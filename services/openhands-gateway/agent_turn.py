#!/usr/bin/env python
import argparse
import importlib.metadata
import json
import os
import sys
from pathlib import Path
from typing import Any


def compact_whitespace(value: Any) -> str:
    return " ".join(str(value or "").split()).strip()


def sanitize_relative_path(value: Any) -> str | None:
    normalized = str(value or "").strip().replace("\\", "/")
    while normalized.startswith("@"):
        normalized = normalized[1:]
    while normalized.startswith("./"):
        normalized = normalized[2:]
    normalized = normalized.lstrip("/")
    lowered = normalized.lower()
    if not normalized or ".." in normalized or (len(lowered) > 2 and lowered[1:3] == ":/"):
        return None
    return normalized


def build_history_prompt(history: list[dict[str, Any]] | None) -> str:
    if not history:
        return "Recent session history: none."
    lines = ["Recent session history:"]
    for turn in history[-6:]:
        role = str(turn.get("role") or "user").upper()
        content = str(turn.get("content") or "")[:4000]
        lines.append(f"{role}: {content}")
    return "\n".join(lines)


def build_context_prompt(context: dict[str, Any] | None) -> str:
    if not isinstance(context, dict):
        return "IDE context: none."

    sections: list[str] = []
    active_file = context.get("activeFile")
    if isinstance(active_file, dict) and active_file.get("path"):
        path = sanitize_relative_path(active_file.get("path")) or str(active_file.get("path"))
        content = str(active_file.get("content") or active_file.get("excerpt") or "")[:2500]
        sections.append(f"Active file:\n- {path}\n{content}".strip())

    open_files = context.get("openFiles")
    if isinstance(open_files, list) and open_files:
        lines = []
        for file in open_files[:4]:
            if not isinstance(file, dict):
                continue
            path = sanitize_relative_path(file.get("path")) or str(file.get("path") or "workspace")
            excerpt = str(file.get("excerpt") or "")[:2000]
            lines.append(f"- {path}" + (f"\n{excerpt}" if excerpt else ""))
        if lines:
            sections.append("Open files:\n" + "\n".join(lines))

    diagnostics = context.get("diagnostics")
    if isinstance(diagnostics, list) and diagnostics:
        lines = []
        for item in diagnostics[:10]:
            if not isinstance(item, dict):
                continue
            path = sanitize_relative_path(item.get("file")) or "workspace"
            line = item.get("line") or 1
            message = compact_whitespace(item.get("message"))
            lines.append(f"- {path}:{line} {message}")
        if lines:
            sections.append("Diagnostics:\n" + "\n".join(lines))

    snippets = context.get("indexedSnippets")
    if isinstance(snippets, list) and snippets:
        lines = []
        for snippet in snippets[:6]:
            if not isinstance(snippet, dict):
                continue
            path = sanitize_relative_path(snippet.get("path")) or "workspace"
            reason = str(snippet.get("reason") or ("Cloud index hit" if snippet.get("source") == "cloud" else "Local fallback"))
            content = str(snippet.get("content") or "")[:2000]
            lines.append(f"- {path} ({reason})\n{content}")
        if lines:
            sections.append("Indexed snippets:\n" + "\n".join(lines))

    return "\n\n".join(sections) if sections else "IDE context: none."


def build_tool_catalog(tools: list[str]) -> str:
    details = {
        "list_files": "List likely workspace files. Args: { query?: string, limit?: number }",
        "read_file": "Read a workspace file. Args: { path: string, startLine?: number, endLine?: number }",
        "search_workspace": "Search indexed/local workspace context. Args: { query: string, limit?: number }",
        "get_diagnostics": "Return current IDE diagnostics. Args: { path?: string }",
        "git_status": "Return git status summary. Args: {}",
        "git_diff": "Return git diff summary. Args: { path?: string }",
        "create_checkpoint": "Create a local undo checkpoint before mutation. Args: { reason?: string }",
        "edit": "Patch an existing file. Args: { path: string, patch: string }",
        "write_file": "Write full file contents. Args: { path: string, content: string, overwrite?: boolean }",
        "mkdir": "Create a directory. Args: { path: string }",
        "run_command": "Run a workspace command. Args: { command: string, timeoutMs?: number, category?: string }",
        "get_workspace_memory": "Return persisted workspace memory/summary. Args: {}",
        "desktop_capture_screen": "Capture the current desktop and upload a snapshot. Args: { displayId?: string }",
        "desktop_get_active_window": "Return the currently focused desktop window. Args: {}",
        "desktop_list_windows": "List currently visible desktop windows. Args: {}",
        "desktop_open_app": "Open a desktop application. Args: { app: string, args?: string[] }",
        "desktop_open_url": "Open a URL in the default browser. Args: { url: string }",
        "desktop_focus_window": "Focus a desktop window. Args: { windowId?: string, title?: string, app?: string }",
        "desktop_click": "Click on the desktop using normalized coordinates. Args: { displayId: string, viewport: { displayId: string, width: number, height: number }, normalizedX: number, normalizedY: number, button?: string, clickCount?: number }",
        "desktop_type": "Type text into the focused desktop target. Args: { text: string, delayMs?: number }",
        "desktop_keypress": "Send a desktop keypress chord or sequence. Args: { keys: string[] }",
        "desktop_scroll": "Scroll on the desktop. Args: { displayId?: string, viewport?: { displayId: string, width: number, height: number }, normalizedX?: number, normalizedY?: number, deltaX?: number, deltaY?: number }",
        "desktop_wait": "Wait for a period of time. Args: { durationMs: number }",
    }
    return "\n".join(f"- {tool}: {details.get(tool, tool.replace('_', ' '))}" for tool in tools)


def build_prompt(payload: dict[str, Any]) -> str:
    request = payload.get("request") if isinstance(payload.get("request"), dict) else {}
    target = payload.get("targetInference") if isinstance(payload.get("targetInference"), dict) else {}
    selection = payload.get("contextSelection") if isinstance(payload.get("contextSelection"), dict) else {}
    fallback_plan = payload.get("fallbackPlan") if isinstance(payload.get("fallbackPlan"), dict) else {}
    trace = payload.get("toolTrace") if isinstance(payload.get("toolTrace"), list) else []
    loop_summary = payload.get("loopSummary") if isinstance(payload.get("loopSummary"), dict) else {}
    tools = [str(tool) for tool in payload.get("availableTools") or [] if isinstance(tool, str)]
    latest_tool = payload.get("latestToolResult") if isinstance(payload.get("latestToolResult"), dict) else None
    repair = payload.get("repairDirective") if isinstance(payload.get("repairDirective"), dict) else None

    trace_lines = []
    for entry in trace[-8:]:
        if not isinstance(entry, dict):
            continue
        tool = "final"
        tool_call = entry.get("toolCall")
        tool_result = entry.get("toolResult")
        if isinstance(tool_call, dict) and tool_call.get("name"):
            tool = str(tool_call.get("name"))
        elif isinstance(tool_result, dict) and tool_result.get("name"):
            tool = str(tool_result.get("name"))
        summary = str(entry.get("summary") or "")[:400]
        status = str(entry.get("status") or "unknown")
        trace_lines.append(f"- [{status}] {tool}: {summary}")

    context_files: list[str] = []
    for item in selection.get("files") or []:
        if not isinstance(item, dict):
            continue
        path = sanitize_relative_path(item.get("path")) or str(item.get("path") or "workspace")
        reason = str(item.get("reason") or "context")
        context_files.append(f"- {path} ({reason})")

    result_section = "Latest tool result: none."
    if latest_tool:
        result_lines = [
            "Latest tool result:",
            f"- tool: {latest_tool.get('name')}",
            f"- ok: {bool(latest_tool.get('ok'))}",
        ]
        if latest_tool.get("blocked"):
            result_lines.append("- blocked: true")
        result_lines.append(f"- summary: {str(latest_tool.get('summary') or '')[:3000]}")
        if latest_tool.get("error"):
            result_lines.append(f"- error: {str(latest_tool.get('error'))[:3000]}")
        result_section = "\n".join(result_lines)

    repair_section = "Repair directive: none."
    if repair and repair.get("stage"):
        repair_section = "\n".join(
            [
                "Repair directive:",
                f"- stage: {repair.get('stage')}",
                f"- reason: {str(repair.get('reason') or '')[:3000]}",
            ]
        )

    prompt_parts = [
        "You are OpenHands acting as the orchestration brain for a coding IDE extension.",
        "The IDE executes tools locally. You must not assume any tool has run unless it appears in the trace.",
        "Return JSON only.",
        "Choose exactly one of these shapes:",
        '{"toolCall":{"id":"call_1","name":"read_file","arguments":{"path":"src/app.ts"},"kind":"observe","summary":"Inspect the current file"}}',
        '{"final":"string"}',
        "Use at most one tool call per response.",
        "Only use tools from the provided catalog.",
        "Paths must stay workspace-relative.",
        "Prefer observation tools before mutation unless the trace already provides enough grounding.",
        "When loop stats show steps=0 and the tool trace is empty, you must return toolCall (read_file, search_workspace, or list_files) — not final — unless the user message is purely conversational with no workspace task.",
        "After inspecting the trusted target on a code-edit request, do not choose another observation tool unless the latest tool result blocked mutation or the repair directive explicitly requires path repair.",
        "Do not emit markdown, explanations, or code fences.",
        "",
        f"Mode: {request.get('mode') or 'auto'}",
        f"Preferred target: {target.get('path') or 'infer from context'}",
        f"Loop stats: steps={loop_summary.get('stepCount') or 0}, mutations={loop_summary.get('mutationCount') or 0}, repairs={loop_summary.get('repairCount') or 0}",
        f"Available tools:\n{build_tool_catalog(tools) if tools else '- none'}",
        "Context files:\n" + ("\n".join(context_files) if context_files else "none."),
        build_history_prompt(request.get("conversationHistory") if isinstance(request.get("conversationHistory"), list) else None),
        build_context_prompt(request.get("context") if isinstance(request.get("context"), dict) else None),
        "Recent tool trace:\n" + ("\n".join(trace_lines) if trace_lines else "none"),
        result_section,
        repair_section,
        f"Plan objective: {compact_whitespace(fallback_plan.get('objective')) or compact_whitespace(request.get('task'))}",
        "Task:",
        str(request.get("task") or ""),
    ]
    return "\n\n".join(prompt_parts)


def extract_balanced_json_object(text: str) -> str | None:
    start = text.find("{")
    if start < 0:
        return None

    depth = 0
    in_string = False
    escaped = False

    for index in range(start, len(text)):
        char = text[index]
        if in_string:
            if escaped:
                escaped = False
                continue
            if char == "\\":
                escaped = True
                continue
            if char == "\"":
                in_string = False
            continue

        if char == "\"":
            in_string = True
            continue
        if char == "{":
            depth += 1
        if char == "}":
            depth -= 1
            if depth == 0:
                return text[start : index + 1]
    return None


def parse_json_candidate(text: str) -> dict[str, Any] | None:
    candidates = [text.strip()]
    if text.strip().startswith("```") and text.strip().endswith("```"):
        stripped = text.strip().strip("`").strip()
        if stripped.lower().startswith("json"):
            stripped = stripped[4:].strip()
        candidates.append(stripped)
    balanced = extract_balanced_json_object(text)
    if balanced:
        candidates.append(balanced)

    for candidate in candidates:
        if not candidate:
            continue
        try:
            parsed = json.loads(candidate)
        except Exception:
            continue
        if isinstance(parsed, dict):
            return parsed
    return None


def normalize_tool_call(value: Any, available_tools: list[str]) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None

    name = str(value.get("name") or "").strip()
    if name not in available_tools:
        return None

    args = value.get("arguments")
    if isinstance(args, dict):
        normalized_args = dict(args)
    else:
        normalized_args = {}

    if isinstance(normalized_args.get("path"), str):
        normalized_path = sanitize_relative_path(normalized_args.get("path"))
        if not normalized_path:
            return None
        normalized_args["path"] = normalized_path

    kind = value.get("kind")
    if kind not in {"observe", "mutate", "command"}:
        if name in {"edit", "write_file", "mkdir", "create_checkpoint"}:
            kind = "mutate"
        elif name == "run_command":
            kind = "command"
        else:
            kind = "observe"

    return {
        "id": compact_whitespace(value.get("id") or "call_1")[:120],
        "name": name,
        "arguments": normalized_args,
        "kind": kind,
        **({"summary": str(value.get("summary"))[:4000]} if value.get("summary") else {}),
    }


def parse_turn_response(raw_text: str, available_tools: list[str]) -> dict[str, Any]:
    parsed = parse_json_candidate(raw_text)
    if parsed:
        tool_call = normalize_tool_call(parsed.get("toolCall"), available_tools)
        if tool_call:
            return {
                "final": str(parsed.get("final") or "").strip(),
                "toolCall": tool_call,
            }
        if isinstance(parsed.get("final"), str) and parsed.get("final").strip():
            return {"final": parsed.get("final").strip()}
    return {"final": raw_text.strip()}


def resolve_openhands_model(model: dict[str, Any]) -> str:
    raw_model = str(model.get("model") or "").strip()
    provider = str(model.get("provider") or "").strip().lower()
    base_url = str(model.get("baseUrl") or "").strip()
    known_prefixes = (
        "openai/",
        "anthropic/",
        "gemini/",
        "google/",
        "openhands/",
        "openrouter/",
        "xai/",
        "groq/",
        "fireworks_ai/",
        "bedrock/",
        "azure/",
    )
    if raw_model.startswith(known_prefixes):
        return raw_model
    if base_url or provider in {"openai", "openai_compatible", "hf"}:
        return f"openai/{raw_model}"
    return raw_model


def run_turn(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        from pydantic import SecretStr
        from openhands.sdk import Agent, Conversation, LLM
    except Exception as exc:
        return {
            "ok": False,
            "error": "OpenHands SDK is not installed.",
            "details": f"{exc}. Run `npm run openhands:gateway:setup` first.",
        }

    model = payload.get("model") if isinstance(payload.get("model"), dict) else {}
    api_key = str(model.get("apiKey") or "").strip()
    if not api_key:
        return {
            "ok": False,
            "error": "The selected model did not provide an API key.",
            "details": "Set the provider token in your Xpersona environment so the backend can forward it to the gateway.",
        }

    model_name = resolve_openhands_model(model)
    workspace = os.getenv("OPENHANDS_GATEWAY_WORKSPACE", str(Path.cwd()))
    prompt = build_prompt(payload)

    llm = LLM(
        model=model_name,
        api_key=SecretStr(api_key),
        base_url=str(model.get("baseUrl") or "").strip() or None,
    )
    agent = Agent(llm=llm, tools=[])
    conversation = Conversation(agent=agent, workspace=workspace)

    raw = conversation.ask_agent(prompt)
    raw_text = str(raw or "")
    parsed_json = parse_json_candidate(raw_text)
    parsed = parse_turn_response(raw_text, [str(tool) for tool in payload.get("availableTools") or []])

    logs = [
        "runtime=openhands_sdk",
        f"model={model_name}",
    ]

    if parsed_json is None:
        repair_prompt = "\n\n".join(
            [
                "Rewrite the previous answer into exactly one valid JSON object.",
                'Allowed shapes: {"toolCall":{...}} or {"final":"string"}',
                "Do not use markdown or code fences.",
                f"Allowed tools: {', '.join(str(tool) for tool in payload.get('availableTools') or [])}",
                "Previous answer:",
                str(raw or ""),
            ]
        )
        repaired = conversation.ask_agent(repair_prompt)
        parsed = parse_turn_response(str(repaired or ""), [str(tool) for tool in payload.get("availableTools") or []])
        logs.append("repair=json_rewrite")

    version = None
    for package_name in ("openhands-sdk", "openhands"):
        try:
            version = importlib.metadata.version(package_name)
            break
        except Exception:
            continue

    return {
        "ok": True,
        "final": str(parsed.get("final") or ""),
        "toolCall": parsed.get("toolCall"),
        "logs": logs,
        "version": version,
    }


def doctor_payload() -> dict[str, Any]:
    try:
        import openhands.sdk  # noqa: F401
        version = None
        for package_name in ("openhands-sdk", "openhands"):
            try:
                version = importlib.metadata.version(package_name)
                break
            except Exception:
                continue
        return {"ok": True, "version": version or "unknown"}
    except Exception as exc:
        return {
            "ok": False,
            "error": "OpenHands SDK is not installed.",
            "details": f"{exc}. Run `npm run openhands:gateway:setup` first.",
        }


def doctor() -> int:
    payload = doctor_payload()
    print(json.dumps(payload))
    return 0 if payload.get("ok") else 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--doctor", action="store_true")
    args = parser.parse_args()

    if args.doctor:
        return doctor()

    try:
        raw = sys.stdin.read()
        payload = json.loads(raw or "{}")
    except Exception as exc:
        print(json.dumps({"ok": False, "error": "Invalid JSON input.", "details": str(exc)}))
        return 1

    result = run_turn(payload)
    print(json.dumps(result))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
