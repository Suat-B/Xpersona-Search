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
    payload = json.dumps(body).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(payload)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(payload)


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
                },
            )
            return

        write_json(
            self,
            200,
            {
                "status": "healthy",
                "title": "OpenHands Gateway",
                "runtime": "openhands_sdk",
                "version": result.get("version"),
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
        elif pathname.startswith("/v1/runs/") and pathname.endswith("/continue"):
            run_id = pathname[len("/v1/runs/") : -len("/continue")].strip("/")
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
            write_json(
                self,
                502,
                {
                    "error": result.get("error") or "OpenHands failed to produce the next turn.",
                    "details": result.get("details") or "Check the OpenHands SDK installation and model credentials.",
                },
            )
            return

        write_json(
            self,
            200,
            {
                "runId": run_id,
                "adapter": "text_actions",
                "final": str(result.get("final") or ""),
                "toolCall": result.get("toolCall"),
                "logs": ["engine=openhands_sdk", *(result.get("logs") or [])],
                "version": result.get("version"),
            },
        )

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        return


def main() -> int:
    server = ThreadingHTTPServer((HOST, PORT), OpenHandsGatewayHandler)
    print(f"OpenHands gateway listening on http://{HOST}:{PORT}")
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
