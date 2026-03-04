from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any, Callable, Dict


class CliHttpError(RuntimeError):
    def __init__(self, message: str, status: int, details: Any = None) -> None:
        super().__init__(message)
        self.status = status
        self.details = details


def _headers(api_key: str) -> Dict[str, str]:
    return {
        "Content-Type": "application/json",
        "X-API-Key": api_key,
        "Authorization": f"Bearer {api_key}",
    }


def _error_message(payload: Any, fallback: str) -> str:
    if not isinstance(payload, dict):
        return fallback
    if isinstance(payload.get("message"), str) and payload["message"].strip():
        return payload["message"]
    err = payload.get("error")
    if isinstance(err, str):
        return err
    if isinstance(err, dict):
        code = err.get("code", "ERROR")
        message = err.get("message", fallback)
        return f"{code}: {message}"
    return fallback


def request_json(
    *,
    base_url: str,
    api_key: str,
    endpoint: str,
    method: str = "GET",
    body: Any = None,
) -> Any:
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        f"{base_url.rstrip('/')}{endpoint}",
        method=method,
        data=data,
        headers=_headers(api_key),
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(raw) if raw else {}
        except Exception:
            parsed = {"message": raw}
        raise CliHttpError(_error_message(parsed, f"Request failed ({exc.code})"), exc.code, parsed) from exc
    except urllib.error.URLError as exc:
        raise CliHttpError(f"Network error: {exc.reason}", 0) from exc


def request_sse(
    *,
    base_url: str,
    api_key: str,
    endpoint: str,
    body: Any,
    on_event: Callable[[Dict[str, Any]], None],
) -> None:
    request = urllib.request.Request(
        f"{base_url.rstrip('/')}{endpoint}",
        method="POST",
        data=json.dumps(body).encode("utf-8"),
        headers=_headers(api_key),
    )
    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            event_lines: list[str] = []
            for raw_line in response:
                line = raw_line.decode("utf-8", errors="replace").rstrip("\r\n")
                if line == "":
                    if not event_lines:
                        continue
                    payload = "".join(
                        segment[5:].strip()
                        for segment in event_lines
                        if segment.startswith("data:")
                    )
                    event_lines = []
                    if not payload:
                        continue
                    if payload == "[DONE]":
                        return
                    try:
                        obj = json.loads(payload)
                        if isinstance(obj, dict):
                            on_event(obj)
                        else:
                            on_event({"event": "raw", "data": payload})
                    except Exception:
                        on_event({"event": "raw", "data": payload})
                    continue
                event_lines.append(line)
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(raw) if raw else {}
        except Exception:
            parsed = {"message": raw}
        raise CliHttpError(_error_message(parsed, f"Streaming request failed ({exc.code})"), exc.code, parsed) from exc
    except urllib.error.URLError as exc:
        raise CliHttpError(f"Network error: {exc.reason}", 0) from exc
