from __future__ import annotations

import argparse
import hashlib
import json
import sys
import webbrowser
from pathlib import Path
from typing import Any, Dict, List

from .api import CliHttpError, request_json, request_sse
from .config import config_path, get_api_key, load_config, save_config

ASSIST_MODES = {"auto", "plan", "yolo", "generate", "debug"}
PLAN_TIERS = {"starter", "builder", "studio"}
BILLING_CYCLES = {"monthly", "yearly"}


def _get_data(payload: Any) -> Any:
    if isinstance(payload, dict) and payload.get("success") is True and "data" in payload:
        return payload["data"]
    return payload


def _workspace_fingerprint(raw: str | None = None) -> str:
    base = raw or str(Path.cwd())
    return hashlib.sha256(base.encode("utf-8")).hexdigest()[:32]


def _require_key(config: Dict[str, Any]) -> str:
    key = get_api_key(config)
    if not key:
        raise RuntimeError("No API key configured. Run 'playground auth set-key' or set PLAYGROUND_AI_API_KEY.")
    return key


def _print_json(value: Any) -> None:
    print(json.dumps(value, indent=2))


def _stream_prompt(base_url: str, api_key: str, task: str, mode: str, model: str, session_id: str | None = None) -> str | None:
    seen_session_id = session_id
    printed_token = False
    printed_final = False

    def on_event(event: Dict[str, Any]) -> None:
        nonlocal seen_session_id, printed_token, printed_final

        if isinstance(event.get("sessionId"), str):
            seen_session_id = event["sessionId"]

        ev = event.get("event")
        if ev == "log":
            message = event.get("message") or event.get("data") or event
            print(f"\n[ran] {message}", end="")
            return
        if ev == "status":
            print(f"\n[status] {event.get('data', '')}", end="")
            return
        if ev == "phase":
            data = event.get("data")
            phase = data.get("name", "phase") if isinstance(data, dict) else "phase"
            print(f"\n[phase] {phase}", end="")
            return
        if ev == "decision":
            data = event.get("data")
            mode_name = data.get("mode", "unknown") if isinstance(data, dict) else "unknown"
            print(f"\n[decision] {mode_name}", end="")
            return
        if ev == "token":
            printed_token = True
            print(str(event.get("data", "")), end="", flush=True)
            return
        if ev == "final":
            final_text = str(event.get("data", ""))
            if not printed_token:
                print(final_text, end="")
            printed_final = True
            print("")

    request_sse(
        base_url=base_url,
        api_key=api_key,
        endpoint="/api/v1/playground/assist",
        body={
            "task": task,
            "mode": mode,
            "model": model,
            "stream": True,
            "historySessionId": session_id,
            "contextBudget": {"strategy": "hybrid", "maxTokens": 16384},
        },
        on_event=on_event,
    )
    if not printed_final:
        print("")
    return seen_session_id


def _handle_auth(args: argparse.Namespace, config: Dict[str, Any]) -> None:
    if args.auth_command == "status":
        key = get_api_key(config)
        masked = f"{key[:6]}...{key[-4:]}" if key else "(not set)"
        print(f"Playground AI API key: {masked}")
        print(f"Config file: {config_path()}")
        return

    if args.auth_command == "set-key":
        key = args.key or input("Enter Playground AI API key: ").strip()
        if not key:
            raise RuntimeError("API key is empty.")
        config["apiKey"] = key
        save_config(config)
        print("Saved API key for Playground AI CLI.")
        return

    if args.auth_command == "clear":
        config.pop("apiKey", None)
        save_config(config)
        print("Cleared stored API key.")
        return

    raise RuntimeError(f"Unknown auth command: {args.auth_command}")


def _handle_config(args: argparse.Namespace, config: Dict[str, Any]) -> None:
    if args.config_command == "show":
        _print_json(config)
        return

    if args.config_command == "set-base-url":
        config["baseUrl"] = args.url.rstrip("/")
        save_config(config)
        print(f"Base URL set to {config['baseUrl']}")
        return

    if args.config_command == "set-model":
        config["model"] = args.model
        save_config(config)
        print(f"Default model set to {config['model']}")
        return

    raise RuntimeError(f"Unknown config command: {args.config_command}")


def _handle_chat(args: argparse.Namespace, config: Dict[str, Any]) -> None:
    api_key = _require_key(config)
    mode = args.mode or config.get("mode", "auto")
    model = args.model or config.get("model", "Playground AI")
    if mode not in ASSIST_MODES:
        raise RuntimeError("Invalid mode. Use auto|plan|yolo|generate|debug.")

    base_url = str(config["baseUrl"]).rstrip("/")
    session_id = None
    try:
        created = request_json(
            base_url=base_url,
            api_key=api_key,
            endpoint="/api/v1/playground/sessions",
            method="POST",
            body={"title": "Playground AI CLI Chat", "mode": mode},
        )
        data = _get_data(created)
        if isinstance(data, dict):
            session_id = data.get("id")
    except Exception:
        session_id = None

    active_mode = mode
    print("Playground AI CLI chat started.")
    print("Commands: /exit, /help, /mode <auto|plan|yolo|generate|debug>, /usage, /checkout")

    while True:
        line = input(f"Playground AI [{active_mode}] > ").strip()
        if not line:
            continue
        if line in {"/exit", "/quit"}:
            return
        if line == "/help":
            print("Type your prompt and press Enter to send.")
            print("Use /mode <value> to switch mode.")
            continue
        if line.startswith("/mode "):
            next_mode = line[6:].strip()
            if next_mode not in ASSIST_MODES:
                print("Invalid mode. Use auto|plan|yolo|generate|debug.")
                continue
            active_mode = next_mode
            print(f"[mode] {active_mode}")
            continue
        if line == "/usage":
            usage = request_json(
                base_url=base_url,
                api_key=api_key,
                endpoint="/api/v1/hf/usage",
                method="GET",
            )
            _print_json(_get_data(usage))
            continue
        if line == "/checkout":
            checkout = request_json(
                base_url=base_url,
                api_key=api_key,
                endpoint="/api/v1/playground/checkout-link",
                method="POST",
                body={"tier": "builder", "billing": "monthly"},
            )
            data = _get_data(checkout)
            if isinstance(data, dict) and isinstance(data.get("url"), str):
                print(f"Checkout URL: {data['url']}")
                webbrowser.open(data["url"])
            else:
                _print_json(data)
            continue

        session_id = _stream_prompt(base_url, api_key, line, active_mode, model, session_id)


def _handle_run(args: argparse.Namespace, config: Dict[str, Any]) -> None:
    api_key = _require_key(config)
    mode = args.mode or config.get("mode", "auto")
    model = args.model or config.get("model", "Playground AI")
    if mode not in ASSIST_MODES:
        raise RuntimeError("Invalid mode. Use auto|plan|yolo|generate|debug.")

    _stream_prompt(str(config["baseUrl"]).rstrip("/"), api_key, args.task, mode, model, None)


def _handle_sessions(args: argparse.Namespace, config: Dict[str, Any]) -> None:
    api_key = _require_key(config)
    base_url = str(config["baseUrl"]).rstrip("/")

    if args.sessions_command == "list":
        response = request_json(
            base_url=base_url,
            api_key=api_key,
            endpoint=f"/api/v1/playground/sessions?limit={args.limit}",
            method="GET",
        )
        data = _get_data(response)
        rows = data.get("data", []) if isinstance(data, dict) else []
        if not rows:
            print("No sessions found.")
            return
        for row in rows:
            if not isinstance(row, dict):
                continue
            session_id = row.get("id", "(unknown)")
            mode = row.get("mode", "auto")
            title = row.get("title") or "(untitled)"
            updated = row.get("updatedAt", "")
            print(f"{session_id}  [{mode}]  {title}  {updated}")
        return

    if args.sessions_command == "show":
        response = request_json(
            base_url=base_url,
            api_key=api_key,
            endpoint=f"/api/v1/playground/sessions/{args.session_id}/messages?includeAgentEvents=true",
            method="GET",
        )
        rows = _get_data(response)
        if isinstance(rows, list):
            for row in reversed(rows):
                if not isinstance(row, dict):
                    continue
                role = row.get("role", "assistant")
                created_at = row.get("createdAt", "")
                content = row.get("content", "")
                print(f"\n[{role}] {created_at}")
                print(content)
        else:
            _print_json(rows)
        return

    raise RuntimeError(f"Unknown sessions command: {args.sessions_command}")


def _handle_usage(config: Dict[str, Any]) -> None:
    api_key = _require_key(config)
    response = request_json(
        base_url=str(config["baseUrl"]).rstrip("/"),
        api_key=api_key,
        endpoint="/api/v1/hf/usage",
        method="GET",
    )
    _print_json(_get_data(response))


def _handle_checkout(args: argparse.Namespace, config: Dict[str, Any]) -> None:
    api_key = _require_key(config)
    if args.tier not in PLAN_TIERS:
        raise RuntimeError("Invalid tier. Use starter|builder|studio.")
    if args.billing not in BILLING_CYCLES:
        raise RuntimeError("Invalid billing. Use monthly|yearly.")
    response = request_json(
        base_url=str(config["baseUrl"]).rstrip("/"),
        api_key=api_key,
        endpoint="/api/v1/playground/checkout-link",
        method="POST",
        body={"tier": args.tier, "billing": args.billing},
    )
    data = _get_data(response)
    if isinstance(data, dict) and isinstance(data.get("url"), str):
        print(f"Playground AI checkout URL ({args.tier}/{args.billing}):")
        print(data["url"])
        webbrowser.open(data["url"])
    else:
        _print_json(data)


def _handle_replay(args: argparse.Namespace, config: Dict[str, Any]) -> None:
    api_key = _require_key(config)
    mode = args.mode or "plan"
    if mode not in ASSIST_MODES:
        raise RuntimeError("Invalid mode. Use auto|plan|yolo|generate|debug.")
    response = request_json(
        base_url=str(config["baseUrl"]).rstrip("/"),
        api_key=api_key,
        endpoint="/api/v1/playground/replay",
        method="POST",
        body={
            "sessionId": args.session_id,
            "workspaceFingerprint": args.workspace or _workspace_fingerprint(),
            "mode": mode,
        },
    )
    _print_json(_get_data(response))


def _parse_execute_actions(payload: Any) -> List[Dict[str, Any]]:
    items = payload
    if isinstance(payload, dict):
        items = payload.get("actions", [])
    if not isinstance(items, list):
        return []
    out: List[Dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        action_type = item.get("type")
        if action_type == "command" and isinstance(item.get("command"), str):
            out.append(
                {
                    "type": "command",
                    "command": item["command"],
                    "cwd": item.get("cwd"),
                    "timeoutMs": item.get("timeoutMs"),
                }
            )
        elif action_type == "edit" and isinstance(item.get("path"), str):
            out.append(
                {
                    "type": "edit",
                    "path": item["path"],
                    "patch": item.get("patch"),
                    "diff": item.get("diff"),
                }
            )
        elif action_type == "rollback" and isinstance(item.get("snapshotId"), str):
            out.append({"type": "rollback", "snapshotId": item["snapshotId"]})
    return out


def _handle_execute(args: argparse.Namespace, config: Dict[str, Any]) -> None:
    api_key = _require_key(config)
    raw = Path(args.file).read_text(encoding="utf-8")
    parsed = json.loads(raw)
    actions = _parse_execute_actions(parsed)
    if not actions:
        raise RuntimeError("No valid actions found in input file.")
    response = request_json(
        base_url=str(config["baseUrl"]).rstrip("/"),
        api_key=api_key,
        endpoint="/api/v1/playground/execute",
        method="POST",
        body={
            "sessionId": args.session,
            "workspaceFingerprint": args.workspace or _workspace_fingerprint(),
            "actions": actions,
        },
    )
    _print_json(_get_data(response))


def _is_text_file(path_obj: Path) -> bool:
    return path_obj.suffix.lower() in {
        ".ts",
        ".tsx",
        ".js",
        ".jsx",
        ".mjs",
        ".cjs",
        ".py",
        ".md",
        ".json",
        ".yaml",
        ".yml",
        ".txt",
        ".go",
        ".rs",
        ".java",
        ".kt",
        ".c",
        ".cc",
        ".cpp",
        ".h",
        ".hpp",
        ".cs",
        ".sh",
        ".sql",
    }


def _collect_files(root: Path, max_files: int) -> List[Path]:
    skip = {".git", ".next", "node_modules", "dist", "build", "__pycache__", ".cache"}
    files: List[Path] = []
    for path_obj in root.rglob("*"):
        if len(files) >= max_files:
            break
        if any(part in skip for part in path_obj.parts):
            continue
        if not path_obj.is_file():
            continue
        if _is_text_file(path_obj):
            files.append(path_obj)
    return files


def _chunk_text(text: str, chunk_size: int) -> List[str]:
    if len(text) <= chunk_size:
        return [text]
    out: List[str] = []
    idx = 0
    while idx < len(text):
        out.append(text[idx : idx + chunk_size])
        idx += chunk_size
    return out


def _handle_index(args: argparse.Namespace, config: Dict[str, Any]) -> None:
    api_key = _require_key(config)
    base_url = str(config["baseUrl"]).rstrip("/")

    if args.index_command == "upsert":
        source = Path(args.path).resolve()
        files = _collect_files(source, args.max_files)
        if not files:
            print("No files found to index.")
            return

        chunks: List[Dict[str, Any]] = []
        for file_path in files:
            try:
                content = file_path.read_text(encoding="utf-8")
            except Exception:
                continue
            if not content.strip():
                continue
            rel = str(file_path.relative_to(source))
            file_chunks = _chunk_text(content, args.chunk_size)
            for idx, chunk in enumerate(file_chunks):
                path_hash = hashlib.sha256(rel.encode("utf-8")).hexdigest()
                chunk_hash = hashlib.sha256(f"{rel}:{idx}:{chunk}".encode("utf-8")).hexdigest()
                chunks.append(
                    {
                        "pathHash": path_hash,
                        "chunkHash": chunk_hash,
                        "pathDisplay": rel,
                        "content": chunk,
                        "metadata": {
                            "chunkIndex": idx,
                            "totalChunks": len(file_chunks),
                            "source": "playground-ai-cli-python",
                        },
                    }
                )

        if not chunks:
            print("No text content found to index.")
            return

        batch_size = 100
        for i in range(0, len(chunks), batch_size):
            batch = chunks[i : i + batch_size]
            request_json(
                base_url=base_url,
                api_key=api_key,
                endpoint="/api/v1/playground/index/upsert",
                method="POST",
                body={"projectKey": args.project, "chunks": batch},
            )
            done = min(i + len(batch), len(chunks))
            print(f"[index] upserted {done}/{len(chunks)} chunks")
        return

    if args.index_command == "query":
        response = request_json(
            base_url=base_url,
            api_key=api_key,
            endpoint="/api/v1/playground/index/query",
            method="POST",
            body={"projectKey": args.project, "query": args.question, "limit": args.limit},
        )
        _print_json(_get_data(response))
        return

    raise RuntimeError(f"Unknown index command: {args.index_command}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="playground", description="Playground AI CLI - Agentic coding runtime")
    sub = parser.add_subparsers(dest="command", required=True)

    auth = sub.add_parser("auth", help="Manage Playground AI API key")
    auth_sub = auth.add_subparsers(dest="auth_command", required=True)
    auth_sub.add_parser("status")
    set_key = auth_sub.add_parser("set-key")
    set_key.add_argument("key", nargs="?")
    auth_sub.add_parser("clear")

    config_cmd = sub.add_parser("config", help="Manage CLI configuration")
    config_sub = config_cmd.add_subparsers(dest="config_command", required=True)
    config_sub.add_parser("show")
    set_base = config_sub.add_parser("set-base-url")
    set_base.add_argument("url")
    set_model = config_sub.add_parser("set-model")
    set_model.add_argument("model")

    chat = sub.add_parser("chat", help="Start interactive chat")
    chat.add_argument("--mode")
    chat.add_argument("--model")

    run = sub.add_parser("run", help="Run one task")
    run.add_argument("task")
    run.add_argument("--mode")
    run.add_argument("--model")

    sessions = sub.add_parser("sessions", help="Session operations")
    sessions_sub = sessions.add_subparsers(dest="sessions_command", required=True)
    sessions_list = sessions_sub.add_parser("list")
    sessions_list.add_argument("--limit", type=int, default=20)
    sessions_show = sessions_sub.add_parser("show")
    sessions_show.add_argument("session_id")

    sub.add_parser("usage", help="Show HF usage stats")

    checkout = sub.add_parser("checkout", help="Create checkout link")
    checkout.add_argument("--tier", default="builder")
    checkout.add_argument("--billing", default="monthly")

    replay = sub.add_parser("replay", help="Replay a session")
    replay.add_argument("session_id")
    replay.add_argument("--mode", default="plan")
    replay.add_argument("--workspace")

    execute = sub.add_parser("execute", help="Execute action list from JSON file")
    execute.add_argument("--file", required=True)
    execute.add_argument("--session")
    execute.add_argument("--workspace")

    index = sub.add_parser("index", help="Index operations")
    index_sub = index.add_subparsers(dest="index_command", required=True)
    upsert = index_sub.add_parser("upsert")
    upsert.add_argument("--project", required=True)
    upsert.add_argument("--path", default=".")
    upsert.add_argument("--max-files", type=int, default=120)
    upsert.add_argument("--chunk-size", type=int, default=3000)

    query = index_sub.add_parser("query")
    query.add_argument("--project", required=True)
    query.add_argument("question")
    query.add_argument("--limit", type=int, default=8)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    config = load_config()

    try:
        if args.command == "auth":
            _handle_auth(args, config)
            return
        if args.command == "config":
            _handle_config(args, config)
            return
        if args.command == "chat":
            _handle_chat(args, config)
            return
        if args.command == "run":
            _handle_run(args, config)
            return
        if args.command == "sessions":
            _handle_sessions(args, config)
            return
        if args.command == "usage":
            _handle_usage(config)
            return
        if args.command == "checkout":
            _handle_checkout(args, config)
            return
        if args.command == "replay":
            _handle_replay(args, config)
            return
        if args.command == "execute":
            _handle_execute(args, config)
            return
        if args.command == "index":
            _handle_index(args, config)
            return
        raise RuntimeError(f"Unknown command: {args.command}")
    except CliHttpError as exc:
        print(f"Playground AI request failed ({exc.status}): {exc}", file=sys.stderr)
        if exc.details is not None:
            _print_json(exc.details)
        sys.exit(1)
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
