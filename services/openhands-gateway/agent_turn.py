#!/usr/bin/env python
import argparse
import importlib.metadata
import json
import os
import sys
import traceback
import urllib.error
import urllib.request
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
        "binary_start_build": "Start a streaming binary build. Args: { intent: string, runtime?: 'node18' | 'node20' }",
        "binary_refine_build": "Refine the active or specified binary build. Args: { buildId?: string, intent: string }",
        "binary_cancel_build": "Cancel the active or specified binary build. Args: { buildId?: string }",
        "binary_branch_build": "Create a branch from the active or specified binary build. Args: { buildId?: string, checkpointId?: string, intent?: string }",
        "binary_rewind_build": "Rewind the active or specified binary build. Args: { buildId?: string, checkpointId?: string }",
        "binary_validate_build": "Validate the active or specified binary build. Args: { buildId?: string, runtime?: 'node18' | 'node20' }",
        "binary_execute_build": "Execute an entrypoint on the active or specified binary build. Args: { buildId?: string, entryPoint?: string, args?: unknown[] }",
        "binary_publish_build": "Publish the active or specified binary build. Args: { buildId?: string }",
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


def build_mutation_imperative(repair: dict[str, Any] | None, target: dict[str, Any], tools: list[str]) -> str:
    """Force toolCall (not final) when the playground loop is waiting for a concrete mutation."""
    if not repair or not repair.get("stage"):
        return ""
    stage = str(repair.get("stage") or "").strip()
    tpath = sanitize_relative_path(target.get("path")) or str(target.get("path") or "").strip() or "the preferred target path"

    if stage == "post_inspection_mutation_required":
        can_edit = "edit" in tools
        can_write = "write_file" in tools
        if not (can_edit or can_write):
            return ""
        opts: list[str] = []
        if can_edit:
            opts.append("edit (unified diff against the file you just read)")
        if can_write:
            opts.append("write_file (complete new file contents)")
        return (
            "MANDATORY FOR THIS TURN: Output a single JSON object with key \"toolCall\" only — do not use \"final\" "
            "for explanations, apologies, or \"I need more context\". The IDE already ran read_file; the file body is in "
            '"Latest tool result" above. Pick one mutation tool: '
            f"{', '.join(opts)} for path {json.dumps(tpath)}. "
            "Implement the user task as best you can from that content. "
            "Use the final key only for a one-line blocked reason if read_file failed, ok was false, or the path is wrong."
        )

    if stage == "patch_repair" and "edit" in tools:
        return (
            'MANDATORY FOR THIS TURN: Return a JSON object with key "toolCall" using tool name "edit" and a minimal patch '
            f"that applies cleanly to {json.dumps(tpath)}. Do not answer with a long final string instead of toolCall."
        )

    if stage == "single_file_rewrite" and "write_file" in tools:
        return (
            'MANDATORY FOR THIS TURN: Return a JSON object with key "toolCall" using tool name "write_file" and the full '
            f"updated file contents for {json.dumps(tpath)}. Do not answer with a long final string instead of toolCall."
        )

    return ""


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
        # Critical: orchestration used to send only summary ("Read path (1-200)"); the model had no file text.
        data = latest_tool.get("data")
        if latest_tool.get("name") == "read_file" and latest_tool.get("ok") and isinstance(data, dict):
            body = data.get("content")
            if isinstance(body, str) and body.strip():
                try:
                    max_body = max(8_000, min(int(os.getenv("OPENHANDS_READ_FILE_BODY_CHARS", "100000")), 500_000))
                except ValueError:
                    max_body = 100_000
                clipped = body if len(body) <= max_body else body[:max_body] + "\n… [truncated for gateway prompt]"
                rng = data.get("range") or "?"
                lc = data.get("lineCount")
                result_lines.append(f"- file_content (range={rng}, lineCount={lc}):\n{clipped}")
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
        '{"toolCall":{"id":"call_1","name":"read_file","arguments":{"path":"src/app.ts"},"kind":"observe","description":"Inspect the current file"}}',
        '{"final":"string"}',
        "Use at most one tool call per response.",
        "Only use tools from the provided catalog.",
        "Never emit a native/tool name of summary, description, final, or note — those are optional JSON string fields inside toolCall, not callable tools.",
        "The only valid tool names are exactly those listed under Available tools (e.g. read_file, list_files).",
        "Paths must stay workspace-relative.",
        "Prefer observation tools before mutation unless the trace already provides enough grounding.",
        "When loop stats show steps=0 and the tool trace is empty, you must return toolCall (read_file, search_workspace, or list_files) — not final — unless the user message is purely conversational with no workspace task.",
        "After inspecting the trusted target on a code-edit request, do not choose another observation tool unless the latest tool result blocked mutation or the repair directive explicitly requires path repair.",
        "When Latest tool result shows a successful read_file for the preferred target and the user asked for a code change, your next response must be a toolCall (edit or write_file), not a final string that refuses or asks for more file text.",
        "Do not emit markdown, explanations, or code fences.",
        "",
        f"Mode: {request.get('mode') or 'auto'}",
        f"Preferred target: {target.get('path') or 'infer from context'}",
        f"Loop stats: steps={loop_summary.get('stepCount') or 0}, mutations={loop_summary.get('mutationCount') or 0}, repairs={loop_summary.get('repairCount') or 0}",
        "Required task files:\n"
        + (
            "\n".join(
                f"- {sanitize_relative_path(item) or str(item)}"
                for item in (fallback_plan.get("files") or [])
                if str(item or "").strip()
            )
            if isinstance(fallback_plan.get("files"), list) and fallback_plan.get("files")
            else "none."
        ),
        f"Available tools:\n{build_tool_catalog(tools) if tools else '- none'}",
        "Context files:\n" + ("\n".join(context_files) if context_files else "none."),
        build_history_prompt(request.get("conversationHistory") if isinstance(request.get("conversationHistory"), list) else None),
        build_context_prompt(request.get("context") if isinstance(request.get("context"), dict) else None),
        "Recent tool trace:\n" + ("\n".join(trace_lines) if trace_lines else "none"),
        result_section,
        repair_section,
        build_mutation_imperative(repair, target, tools),
        f"Plan objective: {compact_whitespace(fallback_plan.get('objective')) or compact_whitespace(request.get('task'))}",
        "Do not keep rewriting the same file while explicit task files remain missing or uncreated unless the latest tool result proves that missing-file issue is blocked.",
        "Task:",
        str(request.get("task") or ""),
    ]
    return "\n\n".join(part for part in prompt_parts if part)


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

    name = normalize_model_tool_name(value.get("name"), available_tools)
    if name not in available_tools:
        return None

    args = value.get("arguments")
    if isinstance(args, dict):
        normalized_args = dict(args)
    else:
        normalized_args = {}

    if isinstance(normalized_args.get("path"), str):
        normalized_path = sanitize_relative_path(normalized_args.get("path"))
        if normalized_path:
            normalized_args["path"] = normalized_path
        elif name in {"read_file", "edit", "write_file", "mkdir"}:
            return None
        else:
            normalized_args.pop("path", None)

    kind = value.get("kind")
    if kind not in {"observe", "mutate", "command"}:
        if name in {"edit", "write_file", "mkdir", "create_checkpoint"}:
            kind = "mutate"
        elif name == "run_command":
            kind = "command"
        else:
            kind = "observe"

    blurb = (
        value.get("summary")
        or value.get("description")
        or value.get("rationale")
        or value.get("note")
    )
    return {
        "id": compact_whitespace(value.get("id") or "call_1")[:120],
        "name": name,
        "arguments": normalized_args,
        "kind": kind,
        **({"summary": str(blurb)[:4000]} if blurb else {}),
    }


def normalize_model_tool_name(value: Any, available_tools: list[str]) -> str:
    raw = compact_whitespace(value)
    if not raw:
        return ""
    if raw in available_tools:
        return raw

    alias_map = {
        "repo_browser.read_file": "read_file",
        "repo_browser.list_files": "list_files",
        "repo_browser.search_workspace": "search_workspace",
        "repo_browser.search": "search_workspace",
        "repo_browser.run_command": "run_command",
        "repo_browser.write_file": "write_file",
        "repo_browser.mkdir": "mkdir",
        "filesystem.read_file": "read_file",
        "filesystem.write_file": "write_file",
        "filesystem.mkdir": "mkdir",
    }
    mapped = alias_map.get(raw)
    if mapped in available_tools:
        return str(mapped)

    tail = raw.split(".")[-1].strip()
    tail_alias_map = {
        "read_file": "read_file",
        "write_file": "write_file",
        "mkdir": "mkdir",
        "run_command": "run_command",
        "list_files": "list_files",
        "search_workspace": "search_workspace",
        "search": "search_workspace",
        "list_dir": "list_files",
    }
    mapped_tail = tail_alias_map.get(tail, tail)
    return mapped_tail if mapped_tail in available_tools else raw


def normalize_failed_generation_arguments(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(arguments)
    if name == "read_file":
        if "line_start" in normalized and "startLine" not in normalized:
            normalized["startLine"] = normalized.pop("line_start")
        if "line_end" in normalized and "endLine" not in normalized:
            normalized["endLine"] = normalized.pop("line_end")
    return normalized


def extract_hf_router_failed_generation(err_body: str, available_tools: list[str]) -> dict[str, Any] | None:
    try:
        payload = json.loads(err_body)
    except Exception:
        return None

    error = payload.get("error") if isinstance(payload, dict) else None
    if not isinstance(error, dict):
        return None
    failed_generation = error.get("failed_generation")
    if isinstance(failed_generation, str):
        try:
            failed_generation = json.loads(failed_generation)
        except Exception:
            return None
    if not isinstance(failed_generation, dict):
        return None

    normalized_name = normalize_model_tool_name(failed_generation.get("name"), available_tools)
    if normalized_name not in available_tools:
        return None

    arguments = failed_generation.get("arguments")
    if not isinstance(arguments, dict):
        arguments = {}

    tool_call = normalize_tool_call(
        {
            "id": "hf_failed_generation",
            "name": normalized_name,
            "arguments": normalize_failed_generation_arguments(normalized_name, arguments),
            "summary": "Recovered tool call from HF router failed_generation payload.",
        },
        available_tools,
    )
    if not tool_call:
        return None
    return {
        "toolCall": tool_call,
    }


def extract_tool_turn(value: Any, available_tools: list[str], depth: int = 0) -> dict[str, Any] | None:
    if depth > 3 or value is None:
        return None

    if isinstance(value, str):
        parsed = parse_json_candidate(value)
        if not parsed:
            return None
        return extract_tool_turn(parsed, available_tools, depth + 1)

    if not isinstance(value, dict):
        return None

    tool_call = normalize_tool_call(value.get("toolCall"), available_tools)
    if tool_call:
        nested = extract_tool_turn(value.get("final"), available_tools, depth + 1) if isinstance(value.get("final"), str) else None
        nested_final = str(nested.get("final") or "").strip() if isinstance(nested, dict) else ""
        final_text = str(value.get("final") or "").strip() or nested_final
        return {
            "final": final_text,
            "toolCall": nested.get("toolCall") if isinstance(nested, dict) and nested.get("toolCall") else tool_call,
        }

    for candidate in (value.get("final"), value.get("message"), value.get("content"), value.get("response")):
        nested = extract_tool_turn(candidate, available_tools, depth + 1)
        if isinstance(nested, dict) and nested.get("toolCall"):
            return nested

    final = value.get("final")
    if isinstance(final, str) and final.strip():
        return {"final": final.strip()}

    return None


def is_hf_inference_router_base_url(base_url: str) -> bool:
    return "huggingface.co" in base_url.lower()


def _format_hf_router_http_error(status_code: int, err_body: str) -> str:
    low = err_body.lower()
    one_line = " ".join(err_body.split())[:400]
    if status_code == 403 and ("api.groq.com" in low or "groq" in low or "cloudflare" in low):
        return (
            "HTTP 403: The Hugging Face router forwarded this request to Groq (api.groq.com), "
            "and Cloudflare blocked it. That often happens from Docker/datacenter egress IPs or strict bot checks. "
            "Try: (1) set env HF_ROUTER_USER_AGENT to your real browser's User-Agent string; "
            "(2) run the OpenHands gateway on the host with `npm run openhands:gateway` instead of Docker; "
            "(3) in Cutie settings pick a model that does not use the :groq suffix (e.g. Qwen on HF Router). "
            f"Raw snippet: {one_line}"
        )
    return f"Hugging Face router HTTP {status_code}: {one_line}"


def hf_router_chat_completion(
    base_url: str, api_key: str, model_id: str, user_prompt: str, available_tools: list[str]
) -> str:
    """
    Call HF Inference / OpenAI-compatible router with plain chat (no tools).
    Avoids OpenHands+LiteLLM sending tool schemas that some models misuse (e.g. calling tool 'summary').
    """
    root = base_url.strip().rstrip("/")
    if not root:
        raise ValueError("model.baseUrl is empty")
    endpoint = f"{root}/chat/completions"
    max_tokens_raw = os.getenv("OPENHANDS_HF_MAX_TOKENS", "4096").strip()
    try:
        max_tokens = max(256, min(int(max_tokens_raw), 8192))
    except ValueError:
        max_tokens = 4096
    body = json.dumps(
        {
            "model": model_id,
            "messages": [{"role": "user", "content": user_prompt}],
            "temperature": 0.1,
            "max_tokens": max_tokens,
        }
    ).encode("utf-8")
    # Groq (behind Cloudflare) often returns 403 for Python-urllib's default User-Agent or datacenter IPs.
    ua = os.getenv("HF_ROUTER_USER_AGENT", "").strip()
    if not ua:
        ua = (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Xpersona-OpenHands-Gateway/1.0"
        )
    req = urllib.request.Request(
        endpoint,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": ua,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        err_body = exc.read().decode("utf-8", errors="replace")
        recovered = extract_hf_router_failed_generation(err_body, available_tools)
        if recovered:
            return json.dumps(recovered)
        raise RuntimeError(_format_hf_router_http_error(exc.code, err_body)) from exc

    choices = payload.get("choices") if isinstance(payload, dict) else None
    if not isinstance(choices, list) or not choices:
        raise RuntimeError(f"Hugging Face router returned no choices: {str(payload)[:2000]}")
    msg = choices[0].get("message") if isinstance(choices[0], dict) else None
    if not isinstance(msg, dict):
        raise RuntimeError(f"Hugging Face router missing message: {str(choices[0])[:2000]}")
    content = msg.get("content")
    if content is None:
        raise RuntimeError(f"Hugging Face router empty content: {str(msg)[:2000]}")
    return str(content)


def parse_turn_response(raw_text: str, available_tools: list[str]) -> dict[str, Any]:
    parsed = parse_json_candidate(raw_text)
    if parsed:
        extracted = extract_tool_turn(parsed, available_tools)
        if extracted:
            return extracted
    return {"final": raw_text.strip()}


def resolve_openhands_model(model: dict[str, Any]) -> str:
    raw_model = str(model.get("model") or "").strip()
    provider = str(model.get("provider") or "").strip().lower()
    base_url = str(model.get("baseUrl") or "").strip()
    base_lower = base_url.lower()
    # OpenAI-compatible Inference / Router — model ids are multiplexed (e.g. openai/gpt-oss-120b:groq).
    is_hf_router = "huggingface.co" in base_lower
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
        resolved = raw_model
    elif base_url or provider in {"openai", "openai_compatible", "hf"}:
        resolved = f"openai/{raw_model}"
    else:
        resolved = raw_model

    # LiteLLM strips the leading openai/ when calling OpenAI-compatible endpoints, so the HTTP body
    # would get model=gpt-oss-120b instead of openai/gpt-oss-120b:groq. Double-prefix so the proxied
    # id matches HF Router expectations. Skip if already doubled.
    if is_hf_router and resolved.startswith("openai/") and not resolved.startswith("openai/openai/"):
        resolved = f"openai/{resolved}"
    return resolved


def run_turn(payload: dict[str, Any]) -> dict[str, Any]:
    model = payload.get("model") if isinstance(payload.get("model"), dict) else {}
    api_key = str(model.get("apiKey") or "").strip()
    if not api_key:
        return {
            "ok": False,
            "error": "The selected model did not provide an API key.",
            "details": "Set the provider token in your Xpersona environment so the backend can forward it to the gateway.",
        }

    base_url = str(model.get("baseUrl") or "").strip()
    raw_model_id = str(model.get("model") or "").strip()
    workspace = os.getenv("OPENHANDS_GATEWAY_WORKSPACE", str(Path.cwd()))
    prompt = build_prompt(payload)
    available_tools = [str(tool) for tool in payload.get("availableTools") or [] if isinstance(tool, str)]

    version = None
    for package_name in ("openhands-sdk", "openhands"):
        try:
            version = importlib.metadata.version(package_name)
            break
        except Exception:
            continue

    # HF OpenAI-compatible router: plain completions avoid LiteLLM tool schemas (fixes bogus tool name "summary").
    if is_hf_inference_router_base_url(base_url):
        if not raw_model_id:
            return {
                "ok": False,
                "error": "Model id missing for Hugging Face router.",
                "details": "Registry entry must include model (e.g. openai/gpt-oss-120b:groq).",
            }
        model_label = raw_model_id
        try:
            raw_text = hf_router_chat_completion(base_url, api_key, raw_model_id, prompt, available_tools)
            parsed_json = parse_json_candidate(raw_text)
            parsed = parse_turn_response(raw_text, available_tools)
            logs = ["runtime=hf_openai_compat", f"model={raw_model_id}"]

            if parsed_json is None:
                repair_prompt = "\n\n".join(
                    [
                        "Rewrite the previous answer into exactly one valid JSON object.",
                        'Allowed shapes: {"toolCall":{...}} or {"final":"string"}',
                        "Do not use markdown or code fences.",
                        f"Allowed tools: {', '.join(available_tools)}",
                        "Previous answer:",
                        str(raw_text or ""),
                    ]
                )
                repaired = hf_router_chat_completion(base_url, api_key, raw_model_id, repair_prompt, available_tools)
                parsed = parse_turn_response(str(repaired or ""), available_tools)
                logs.append("repair=json_rewrite")

            return {
                "ok": True,
                "final": str(parsed.get("final") or ""),
                "toolCall": parsed.get("toolCall"),
                "logs": logs,
                "version": version,
            }
        except Exception as exc:
            print(f"[openhands-gateway] run_turn HF path model={model_label!r}: {exc}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            return {
                "ok": False,
                "error": "Hugging Face router completion failed.",
                "details": f"{type(exc).__name__}: {exc}",
            }

    try:
        from pydantic import SecretStr
        from openhands.sdk import Agent, Conversation, LLM
    except Exception as exc:
        return {
            "ok": False,
            "error": "OpenHands SDK is not installed.",
            "details": f"{exc}. Run `npm run openhands:gateway:setup` first.",
        }

    model_name = resolve_openhands_model(model)

    try:
        llm = LLM(
            model=model_name,
            api_key=SecretStr(api_key),
            base_url=base_url or None,
        )
        agent = Agent(llm=llm, tools=[])
        conversation = Conversation(agent=agent, workspace=workspace)

        raw = conversation.ask_agent(prompt)
        raw_text = str(raw or "")
        parsed_json = parse_json_candidate(raw_text)
        parsed = parse_turn_response(raw_text, available_tools)

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
                    f"Allowed tools: {', '.join(available_tools)}",
                    "Previous answer:",
                    str(raw or ""),
                ]
            )
            repaired = conversation.ask_agent(repair_prompt)
            parsed = parse_turn_response(str(repaired or ""), available_tools)
            logs.append("repair=json_rewrite")

        return {
            "ok": True,
            "final": str(parsed.get("final") or ""),
            "toolCall": parsed.get("toolCall"),
            "logs": logs,
            "version": version,
        }
    except Exception as exc:
        print(f"[openhands-gateway] run_turn error model={model_name!r}: {exc}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return {
            "ok": False,
            "error": "OpenHands SDK raised an exception while running the turn.",
            "details": f"{type(exc).__name__}: {exc}",
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
