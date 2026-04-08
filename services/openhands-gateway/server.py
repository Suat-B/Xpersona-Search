#!/usr/bin/env python
import json
import os
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

from agent_turn import doctor_payload, run_turn


PORT = int(os.getenv("OPENHANDS_GATEWAY_PORT", "8010"))
HOST = os.getenv("OPENHANDS_GATEWAY_HOST", "0.0.0.0")
BODY_LIMIT = 1_500_000
GATEWAY_API_KEY = str(os.getenv("OPENHANDS_GATEWAY_API_KEY", "")).strip()


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
                result = run_turn(body, event_callback=lambda event: write_sse_event(self, event))
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
            result = run_turn(body)
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
