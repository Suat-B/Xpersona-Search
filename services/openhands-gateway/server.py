#!/usr/bin/env python
import json
import os
import threading
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse
import urllib.request

import agent_turn as agent_turn_module
from agent_turn import doctor_payload, run_turn as gateway_run_turn


PORT = int(os.getenv("OPENHANDS_GATEWAY_PORT", "8010"))
HOST = os.getenv("OPENHANDS_GATEWAY_HOST", "0.0.0.0")
BODY_LIMIT = int(os.getenv("OPENHANDS_GATEWAY_BODY_LIMIT_BYTES", "12000000"))
GATEWAY_API_KEY = str(os.getenv("OPENHANDS_GATEWAY_API_KEY", "")).strip()
_ACTIVE_IMAGE_INPUTS = threading.local()


def _compact_whitespace(value) -> str:
    return " ".join(str(value or "").split()).strip()


def _extract_request_image_inputs(payload: dict) -> list[dict]:
    request = payload.get("request") if isinstance(payload.get("request"), dict) else {}
    raw = request.get("imageInputs")
    if not isinstance(raw, list):
        return []
    result = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        mime_type = _compact_whitespace(item.get("mimeType")).lower()
        data_url = _compact_whitespace(item.get("dataUrl"))
        base64_value = _compact_whitespace(item.get("base64"))
        url_value = _compact_whitespace(item.get("url"))
        if not data_url and base64_value and mime_type.startswith("image/"):
            data_url = f"data:{mime_type};base64,{base64_value}"
        if not data_url and url_value.startswith("data:image/"):
            data_url = url_value
        if not data_url and not url_value:
            continue
        result.append(
            {
                "mimeType": mime_type if mime_type.startswith("image/") else "",
                "dataUrl": data_url,
                "url": url_value,
            }
        )
        if len(result) >= 6:
            break
    return result


def _set_active_image_inputs(image_inputs: list[dict]) -> None:
    setattr(_ACTIVE_IMAGE_INPUTS, "value", image_inputs or [])


def _get_active_image_inputs() -> list[dict]:
    value = getattr(_ACTIVE_IMAGE_INPUTS, "value", [])
    return value if isinstance(value, list) else []


def _clear_active_image_inputs() -> None:
    if hasattr(_ACTIVE_IMAGE_INPUTS, "value"):
        delattr(_ACTIVE_IMAGE_INPUTS, "value")


def _build_openai_user_content(user_prompt: str, image_inputs: list[dict], base_url: str) -> object:
    if not image_inputs:
        return user_prompt
    content = []
    prompt_text = str(user_prompt or "").strip()
    if prompt_text:
        content.append({"type": "text", "text": prompt_text})
    is_gemini_openai = "generativelanguage.googleapis.com" in _compact_whitespace(base_url).lower()
    for image in image_inputs:
        if not isinstance(image, dict):
            continue
        image_url = _compact_whitespace(image.get("dataUrl") or image.get("url"))
        if not image_url:
            continue
        if is_gemini_openai:
            content.append({"type": "image_url", "image_url": image_url})
        else:
            content.append({"type": "image_url", "image_url": {"url": image_url}})
    return content or user_prompt


def _install_openai_image_input_patch() -> None:
    original = getattr(agent_turn_module, "openai_compatible_chat_completion", None)
    if not callable(original):
        return

    def patched_openai_compatible_chat_completion(
        base_url: str,
        api_key: str,
        model_id: str,
        user_prompt: str,
        extra_headers: dict | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.1,
        timeout_seconds: int = 300,
    ) -> str:
        image_inputs = _get_active_image_inputs()
        if not image_inputs:
            return original(
                base_url=base_url,
                api_key=api_key,
                model_id=model_id,
                user_prompt=user_prompt,
                extra_headers=extra_headers,
                max_tokens=max_tokens,
                temperature=temperature,
                timeout_seconds=timeout_seconds,
            )

        root = str(base_url or "").strip().rstrip("/")
        if not root:
            raise ValueError("model.baseUrl is empty")
        endpoint = f"{root}/chat/completions"
        body = json.dumps(
            {
                "model": model_id,
                "messages": [{"role": "user", "content": _build_openai_user_content(user_prompt, image_inputs, root)}],
                "temperature": float(temperature),
                "max_tokens": int(max_tokens),
            }
        ).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "Xpersona-OpenHands-Gateway/1.0",
        }
        if _compact_whitespace(api_key):
            headers["Authorization"] = f"Bearer {api_key}"
        if isinstance(extra_headers, dict):
            for key, value in extra_headers.items():
                normalized_key = _compact_whitespace(key)
                normalized_value = _compact_whitespace(value)
                if normalized_key and normalized_value:
                    headers[normalized_key] = normalized_value
        req = urllib.request.Request(endpoint, data=body, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=max(5, int(timeout_seconds))) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        choices = payload.get("choices") if isinstance(payload, dict) else None
        if not isinstance(choices, list) or not choices:
            raise RuntimeError(f"OpenAI-compatible endpoint returned no choices: {str(payload)[:2000]}")
        message = choices[0].get("message") if isinstance(choices[0], dict) else None
        if not isinstance(message, dict):
            raise RuntimeError(f"OpenAI-compatible endpoint missing message: {str(choices[0])[:2000]}")
        content = message.get("content")
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts = []
            for item in content:
                if isinstance(item, dict) and isinstance(item.get("text"), str):
                    parts.append(item.get("text"))
            if parts:
                return "\n".join(parts)
        raise RuntimeError(f"OpenAI-compatible endpoint empty content: {str(message)[:2000]}")

    setattr(agent_turn_module, "openai_compatible_chat_completion", patched_openai_compatible_chat_completion)


_install_openai_image_input_patch()


def run_turn_with_hotfix(payload: dict, event_callback=None) -> dict:
    _set_active_image_inputs(_extract_request_image_inputs(payload))
    if not hasattr(agent_turn_module, "total_candidates"):
        # Hotfix for chat-only fast path crash in agent_turn.py where total_candidates is referenced as a global.
        setattr(agent_turn_module, "total_candidates", 1)
    try:
        return gateway_run_turn(payload, event_callback=event_callback)
    except NameError as exc:
        if "total_candidates" not in str(exc):
            raise
        setattr(agent_turn_module, "total_candidates", 1)
        return gateway_run_turn(payload, event_callback=event_callback)
    finally:
        _clear_active_image_inputs()


def write_json(handler: BaseHTTPRequestHandler, status: int, body: dict) -> None:
    payload = json.dumps(body, default=str).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(payload)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(payload)


def write_sse_headers(handler: BaseHTTPRequestHandler, status: int = 200) -> None:
    handler.send_response(status)
    handler.send_header("Content-Type", "text/event-stream; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Connection", "keep-alive")
    handler.end_headers()


def write_sse_event(handler: BaseHTTPRequestHandler, body: dict) -> None:
    payload = json.dumps(body, default=str).encode("utf-8")
    handler.wfile.write(b"data: " + payload + b"\n\n")
    try:
        handler.wfile.flush()
    except Exception:
        return


def wants_streaming_response(handler: BaseHTTPRequestHandler) -> bool:
    accept = str(handler.headers.get("Accept") or "")
    if "text/event-stream" in accept.lower():
        return True
    parsed = urlparse(handler.path)
    return parsed.query.lower() == "stream=1" or "stream=1" in parsed.query.lower().split("&")


def is_authorized(handler: BaseHTTPRequestHandler) -> bool:
    if not GATEWAY_API_KEY:
        return True
    return handler.headers.get("Authorization") == f"Bearer {GATEWAY_API_KEY}"


def parse_json_body(handler: BaseHTTPRequestHandler) -> dict:
    raw_length = handler.headers.get("Content-Length") or "0"
    try:
        content_length = int(raw_length)
    except ValueError:
        raise ValueError("Invalid Content-Length header.")
    if content_length > BODY_LIMIT:
        raise ValueError("Request body exceeded the 1.5MB limit.")
    raw = handler.rfile.read(content_length).decode("utf-8") if content_length > 0 else "{}"
    return json.loads(raw or "{}")


def with_run_context(body: dict, run_id: str, turn_phase: str) -> dict:
    tom = body.get("tom") if isinstance(body.get("tom"), dict) else {}
    return {
        **body,
        "runId": run_id,
        "tom": {
            **tom,
            "turnPhase": turn_phase,
        },
    }


class OpenHandsGatewayHandler(BaseHTTPRequestHandler):
    server_version = "OpenHandsGateway/1.0"

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_header("Allow", "GET, POST, OPTIONS")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        if not is_authorized(self):
            write_json(
                self,
                401,
                {
                    "error": "Unauthorized",
                    "details": "The OpenHands gateway API key did not match OPENHANDS_GATEWAY_API_KEY.",
                },
            )
            return

        if urlparse(self.path).path != "/health":
            write_json(
                self,
                404,
                {
                    "error": "Not found",
                    "details": "Use GET /health, POST /v1/runs/start, or POST /v1/runs/:runId/continue.",
                },
            )
            return

        result = doctor_payload()
        if not result.get("ok"):
            write_json(
                self,
                503,
                {
                    "status": "unhealthy",
                    "title": "OpenHands Gateway",
                    "error": result.get("error") or "OpenHands SDK is not installed or is not importable.",
                    "details": result.get("details") or "This container should install it automatically at build time.",
                    "version": result.get("version"),
                    "doctor": result,
                },
            )
            return

        runtime_profile = str(result.get("runtimeProfile") or "unavailable")
        degraded_reasons = result.get("degradedReasons") if isinstance(result.get("degradedReasons"), list) else []
        status = "healthy" if runtime_profile == "full" and not degraded_reasons else "degraded"
        message = (
            "Managed coding runtime is ready."
            if status == "healthy"
            else "Binary runtime is ready with limited capabilities."
        )

        write_json(
            self,
            200,
            {
                "status": status,
                "title": "OpenHands Gateway",
                "runtime": "openhands_sdk",
                "message": message,
                "version": result.get("version"),
                "doctor": result,
            },
        )

    def do_POST(self) -> None:  # noqa: N802
        if not is_authorized(self):
            write_json(
                self,
                401,
                {
                    "error": "Unauthorized",
                    "details": "The OpenHands gateway API key did not match OPENHANDS_GATEWAY_API_KEY.",
                },
            )
            return

        try:
            body = parse_json_body(self)
        except Exception as exc:
            write_json(self, 400, {"error": "Invalid gateway payload.", "details": str(exc)})
            return

        pathname = urlparse(self.path).path
        if pathname == "/v1/runs/start":
            run_id = os.urandom(16).hex()
            body = with_run_context(body, run_id, "start")
        elif pathname.startswith("/v1/runs/") and pathname.endswith("/continue"):
            run_id = pathname[len("/v1/runs/") : -len("/continue")].strip("/")
            body = with_run_context(body, run_id, "continue")
        else:
            write_json(
                self,
                404,
                {
                    "error": "Not found",
                    "details": "Use GET /health, POST /v1/runs/start, or POST /v1/runs/:runId/continue.",
                },
            )
            return

        if body.get("protocol") != "xpersona_openhands_gateway_v1":
            write_json(
                self,
                400,
                {
                    "error": "Invalid gateway payload.",
                    "details": "Expected protocol=xpersona_openhands_gateway_v1.",
                },
            )
            return

        streaming = wants_streaming_response(self)

        def build_failure_payload(result: dict, run_id: str) -> dict:
            return {
                "error": result.get("error") or "OpenHands failed to produce the next turn.",
                "details": result.get("details") or "Check the OpenHands SDK installation and model credentials.",
                "failureReason": result.get("failureReason"),
                "modelCandidate": result.get("modelCandidate"),
                "fallbackAttempt": result.get("fallbackAttempt"),
                "persistenceDir": result.get("persistenceDir"),
                "conversationId": result.get("conversationId"),
                "fallbackTrail": result.get("fallbackTrail"),
                "executionLane": result.get("executionLane"),
                "pluginPacks": result.get("pluginPacks"),
                "skillSources": result.get("skillSources"),
                "traceId": result.get("traceId"),
                "jsonlPath": result.get("jsonlPath"),
                "adapterMode": result.get("adapterMode"),
                "latencyPolicy": result.get("latencyPolicy"),
                "timeoutPolicy": result.get("timeoutPolicy"),
                "budgetProfile": result.get("budgetProfile"),
                "firstTurnBudgetMs": result.get("firstTurnBudgetMs"),
                "smallModelForced": result.get("smallModelForced"),
                "coercionApplied": result.get("coercionApplied"),
                "seedToolInjected": result.get("seedToolInjected"),
                "invalidToolNameRecovered": result.get("invalidToolNameRecovered"),
                "runId": run_id,
            }

        def build_success_payload(result: dict, run_id: str) -> dict:
            return {
                "runId": run_id,
                "adapter": "text_actions",
                "final": str(result.get("final") or ""),
                "toolCall": result.get("toolCall"),
                "logs": ["engine=openhands_sdk", *(result.get("logs") or [])],
                "version": result.get("version"),
                "modelCandidate": result.get("modelCandidate"),
                "fallbackAttempt": result.get("fallbackAttempt"),
                "failureReason": result.get("failureReason"),
                "persistenceDir": result.get("persistenceDir"),
                "conversationId": result.get("conversationId"),
                "fallbackTrail": result.get("fallbackTrail"),
                "executionLane": result.get("executionLane"),
                "pluginPacks": result.get("pluginPacks"),
                "skillSources": result.get("skillSources"),
                "traceId": result.get("traceId"),
                "jsonlPath": result.get("jsonlPath"),
                "adapterMode": result.get("adapterMode"),
                "latencyPolicy": result.get("latencyPolicy"),
                "timeoutPolicy": result.get("timeoutPolicy"),
                "budgetProfile": result.get("budgetProfile"),
                "firstTurnBudgetMs": result.get("firstTurnBudgetMs"),
                "smallModelForced": result.get("smallModelForced"),
                "coercionApplied": result.get("coercionApplied"),
                "seedToolInjected": result.get("seedToolInjected"),
                "invalidToolNameRecovered": result.get("invalidToolNameRecovered"),
            }

        if streaming:
            write_sse_headers(self, 200)
            try:
                write_sse_event(
                    self,
                    {
                        "event": "run",
                        "data": {
                            "runId": run_id,
                            "adapter": "text_actions",
                        },
                    },
                )
                result = run_turn_with_hotfix(body, event_callback=lambda event: write_sse_event(self, event))
            except Exception as exc:
                traceback.print_exc()
                write_sse_event(
                    self,
                    {
                        "event": "gateway.error",
                        "data": {
                            "runId": run_id,
                            "error": "OpenHands gateway crashed while handling the request.",
                            "details": f"{type(exc).__name__}: {exc}",
                        },
                    },
                )
                self.wfile.write(b"data: [DONE]\n\n")
                try:
                    self.wfile.flush()
                except Exception:
                    pass
                return

            if not result.get("ok"):
                write_sse_event(
                    self,
                    {
                        "event": "gateway.error",
                        "data": build_failure_payload(result, run_id),
                    },
                )
            else:
                write_sse_event(
                    self,
                    {
                        "event": "gateway.result",
                        "data": build_success_payload(result, run_id),
                    },
                )
            self.wfile.write(b"data: [DONE]\n\n")
            try:
                self.wfile.flush()
            except Exception:
                pass
            return

        try:
            result = run_turn_with_hotfix(body)
        except Exception as exc:
            traceback.print_exc()
            write_json(
                self,
                502,
                {
                    "error": "OpenHands gateway crashed while handling the request.",
                    "details": f"{type(exc).__name__}: {exc}",
                },
            )
            return

        if not result.get("ok"):
            write_json(self, 502, build_failure_payload(result, run_id))
            return

        write_json(self, 200, build_success_payload(result, run_id))

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        return


def main() -> int:
    server = ThreadingHTTPServer((HOST, PORT), OpenHandsGatewayHandler)
    print(f"OpenHands gateway listening on http://{HOST}:{PORT}")
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
