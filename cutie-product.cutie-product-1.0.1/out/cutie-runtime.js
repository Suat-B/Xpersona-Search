"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CutieRuntime = void 0;
const cutie_policy_1 = require("./cutie-policy");
const cutie_host_http_error_1 = require("./cutie-host-http-error");
function normalizeRuntimeFilePath(value) {
    if (typeof value !== "string")
        return null;
    const normalized = (0, cutie_policy_1.normalizeWorkspaceRelativePath)(value);
    return normalized || null;
}
function parseReadRange(value) {
    const raw = String(value || "").trim();
    const match = /^(\d+)-(\d+)$/.exec(raw);
    if (!match)
        return null;
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start)
        return null;
    return { start, end };
}
function isFullReadReceiptData(data) {
    const range = parseReadRange(data.range);
    const lineCount = Number(data.lineCount);
    if (!range || !Number.isFinite(lineCount) || lineCount < 0)
        return false;
    return range.start === 1 && range.end >= Math.max(1, lineCount);
}
function getMostRecentRuntimeFileState(latestFileStates) {
    if (!latestFileStates?.size)
        return null;
    return [...latestFileStates.values()].sort((a, b) => b.updatedAtStep - a.updatedAtStep)[0] ?? null;
}
const MAX_OBJECTIVES_DECOMPOSE = 12;
const DEFAULT_OBJECTIVE_FINAL_REPAIR_CAP = 24;
const UNLIMITED_OBJECTIVE_FINAL_REPAIR_CAP = 256;
const UNLIMITED_RUN_BUDGET_SENTINEL = 999999;
function resolveRunBudgetFromContext(ctx) {
    const s = ctx.cutieDynamicSettings;
    if (s?.unlimitedAutonomy) {
        return { maxSteps: UNLIMITED_RUN_BUDGET_SENTINEL, maxWorkspaceMutations: UNLIMITED_RUN_BUDGET_SENTINEL };
    }
    const maxSteps = Math.max(8, Math.min(128, s?.maxToolSteps ?? cutie_policy_1.CUTIE_MAX_STEPS));
    const maxWorkspaceMutations = Math.max(2, Math.min(64, s?.maxWorkspaceMutations ?? cutie_policy_1.CUTIE_MAX_WORKSPACE_MUTATIONS));
    return { maxSteps, maxWorkspaceMutations };
}
function shouldUseObjectiveMode(goal, prompt, mentionContext, settings) {
    if (settings?.objectiveBasedRuns === false)
        return false;
    if (!hasConcreteTaskSignals(prompt, mentionContext))
        return false;
    if (goal === "code_change")
        return true;
    if (goal === "workspace_investigation" && settings?.objectiveBasedInvestigation)
        return true;
    return false;
}
function parseFinalObjectiveOutcomes(record) {
    const raw = record.objectives;
    if (!Array.isArray(raw))
        return undefined;
    const out = [];
    for (const item of raw) {
        const row = asRecord(item);
        const id = typeof row.id === "string" ? row.id.trim() : "";
        const status = row.status === "done" || row.status === "blocked" ? row.status : null;
        if (!id || !status)
            continue;
        out.push({
            id,
            status,
            ...(typeof row.note === "string" && row.note.trim() ? { note: row.note.trim().slice(0, 500) } : {}),
        });
    }
    return out.length ? out : undefined;
}
function validateObjectiveFinalAgainstRun(structured, run) {
    const phase = run.objectivesPhase;
    const list = run.objectives;
    if (phase !== "active" || !list?.length) {
        return { ok: true, merged: list || [] };
    }
    if (!structured.final.trim()) {
        return {
            ok: false,
            repairMessage: "Repair instruction: final text is empty. Provide a concise user-facing summary in the final field together with the objectives array.",
        };
    }
    const outcomes = structured.objectives;
    if (!outcomes?.length) {
        const ids = list.map((o) => o.id).join(", ");
        return {
            ok: false,
            repairMessage: [
                "Repair instruction:",
                "This run uses task objectives. Finish with minified JSON only, including an objectives array.",
                "Shape: {\"type\":\"final\",\"final\":\"your summary\",\"objectives\":[{\"id\":\"…\",\"status\":\"done|blocked\",\"note\":\"optional\"}]}",
                `Objective ids you must include exactly once each: ${ids}.`,
            ].join(" "),
        };
    }
    const idSet = new Set(list.map((o) => o.id));
    const seen = new Set();
    for (const row of outcomes) {
        if (seen.has(row.id)) {
            return {
                ok: false,
                repairMessage: `Repair instruction: duplicate objective id "${row.id}" in objectives. Return one entry per id.`,
            };
        }
        seen.add(row.id);
        if (!idSet.has(row.id)) {
            return {
                ok: false,
                repairMessage: `Repair instruction: unknown objective id "${row.id}". Only use ids from taskObjectives in context.`,
            };
        }
    }
    if (seen.size !== idSet.size) {
        const missing = list.filter((o) => !seen.has(o.id)).map((o) => `${o.id}: ${o.text}`);
        return {
            ok: false,
            repairMessage: [
                "Repair instruction:",
                "Not every objective has a status. Still pending:",
                ...missing.map((m) => `- ${m}`),
                "Return the same final JSON shape with objectives covering ALL ids (done or blocked).",
            ].join("\n"),
        };
    }
    const merged = list.map((o) => {
        const hit = outcomes.find((r) => r.id === o.id);
        if (!hit)
            return o;
        return {
            ...o,
            status: hit.status,
            ...(hit.note ? { note: hit.note } : {}),
        };
    });
    const pending = merged.filter((o) => o.status === "pending");
    if (pending.length) {
        return {
            ok: false,
            repairMessage: [
                "Repair instruction:",
                "Every objective must be marked done or blocked, not left implicit.",
                "Pending:",
                ...pending.map((o) => `- ${o.id}: ${o.text}`),
            ].join("\n"),
        };
    }
    return { ok: true, merged };
}
function tryParseObjectivesDecomposition(raw) {
    const parsed = extractJsonObject(raw) ||
        (() => {
            for (const chunk of extractBalancedJsonObjects(raw)) {
                try {
                    return JSON.parse(chunk);
                }
                catch {
                    continue;
                }
            }
            return null;
        })();
    if (!parsed || typeof parsed !== "object")
        return null;
    const record = asRecord(parsed);
    if (record.type !== "objectives")
        return null;
    const arr = Array.isArray(record.objectives) ? record.objectives : null;
    if (!arr?.length)
        return null;
    const out = [];
    const seen = new Set();
    for (const item of arr) {
        const row = asRecord(item);
        const id = typeof row.id === "string" ? row.id.trim() : "";
        const text = typeof row.text === "string" ? row.text.trim() : "";
        if (!id || !text || seen.has(id))
            continue;
        seen.add(id);
        out.push({ id, text: text.slice(0, 800) });
        if (out.length >= MAX_OBJECTIVES_DECOMPOSE)
            break;
    }
    return out.length > 0 ? out : null;
}
function normalizeDecomposedObjectives(rows, fallbackText) {
    if (!rows.length) {
        return [{ id: "1", text: trimToLimit(fallbackText, 1200), status: "pending" }];
    }
    return rows.map((r) => ({ id: r.id, text: r.text, status: "pending" }));
}
function buildObjectiveProtocolSystemMessage(objectives) {
    return [
        "Task objectives (strict): This run is tracked against a checklist in live context under taskObjectives.",
        "Do not respond with {\"type\":\"final\",...} until every objective is finished.",
        "When you are truly done, respond with ONLY minified JSON:",
        '{"type":"final","final":"user-facing summary","objectives":[{"id":"1","status":"done"},{"id":"2","status":"blocked","note":"reason"}]}',
        "Each objective id must appear exactly once. Status must be done or blocked.",
        "Until then, keep using tool_call or tool_calls batches as needed.",
        "Current objectives:",
        stableJson(objectives.map((o) => ({ id: o.id, text: o.text, status: o.status }))),
    ].join("\n");
}
const TOOL_NAME_ALIASES = {
    filesystem_list_allowed_directories: "list_files",
    filesystem_list_directory: "list_files",
    filesystem_list_files: "list_files",
    filesystem_read_file: "read_file",
    filesystem_write_file: "write_file",
    filesystem_edit_file: "edit_file",
    filesystem_search: "search_workspace",
    filesystem_search_files: "search_workspace",
    list_allowed_directories: "list_files",
    read_text_file: "read_file",
    write_text_file: "write_file",
    edit_text_file: "edit_file",
    execute_command: "run_command",
    shell_command: "run_command",
    "cli-mcp-server_run_command": "run_command",
    cli_mcp_server_run_command: "run_command",
    mcp_run_command: "run_command",
    "mcp__run_command": "run_command",
    run_terminal_command: "run_command",
};
const KNOWN_TOOL_NAMES = new Set([
    "list_files",
    "read_file",
    "search_workspace",
    "get_diagnostics",
    "git_status",
    "git_diff",
    "desktop_capture_screen",
    "desktop_get_active_window",
    "desktop_list_windows",
    "create_checkpoint",
    "edit_file",
    "write_file",
    "mkdir",
    "run_command",
    "desktop_open_app",
    "desktop_open_url",
    "desktop_focus_window",
    "desktop_click",
    "desktop_type",
    "desktop_keypress",
    "desktop_scroll",
    "desktop_wait",
]);
function asRecord(value) {
    return value && typeof value === "object" ? value : {};
}
function trimToLimit(value, limit = 12000) {
    const text = String(value ?? "");
    return text.length <= limit ? text : `${text.slice(0, limit)}\n...[truncated]`;
}
function normalizeToolName(rawName, argumentsValue) {
    if (!rawName)
        return null;
    const trimmed = String(rawName || "").trim();
    if (!trimmed)
        return null;
    const direct = trimmed;
    const normalizedKey = trimmed.toLowerCase();
    if (KNOWN_TOOL_NAMES.has(direct))
        return direct;
    const alias = TOOL_NAME_ALIASES[normalizedKey];
    if (alias)
        return alias;
    if (normalizedKey === "filesystem_list_allowed_directories" && argumentsValue) {
        delete argumentsValue.path;
    }
    return null;
}
function stableJson(value) {
    return JSON.stringify(value, null, 2);
}
function stripCodeFence(raw) {
    const trimmed = raw.trim();
    const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
    return fenceMatch ? fenceMatch[1].trim() : trimmed;
}
function extractJsonObject(raw) {
    const normalized = stripCodeFence(raw);
    if (!normalized.startsWith("{"))
        return null;
    try {
        return JSON.parse(normalized);
    }
    catch {
        return null;
    }
}
function tryNormalizeToolCallPayload(parsed) {
    const record = asRecord(parsed);
    const toolCall = asRecord(record.tool_call || record.toolCall || record);
    const rawName = typeof toolCall.name === "string" ? toolCall.name : typeof toolCall.tool === "string" ? toolCall.tool : null;
    const argumentsValue = toolCall.arguments && typeof toolCall.arguments === "object"
        ? toolCall.arguments
        : toolCall.args && typeof toolCall.args === "object"
            ? toolCall.args
            : toolCall.parameters && typeof toolCall.parameters === "object"
                ? toolCall.parameters
                : null;
    const normalizedName = normalizeToolName(rawName, argumentsValue);
    if (!normalizedName || !argumentsValue || typeof argumentsValue !== "object")
        return null;
    return {
        name: normalizedName,
        arguments: argumentsValue,
        ...(typeof toolCall.summary === "string" ? { summary: toolCall.summary } : {}),
    };
}
function payloadsToStructuredResponse(payloads) {
    if (payloads.length === 1) {
        return {
            type: "tool_call",
            tool_call: {
                name: payloads[0].name,
                arguments: payloads[0].arguments,
                ...(payloads[0].summary ? { summary: payloads[0].summary } : {}),
            },
        };
    }
    return { type: "tool_calls", tool_calls: payloads };
}
function tryNormalizeStructuredResponse(parsed) {
    if (Array.isArray(parsed)) {
        const payloads = [];
        for (const item of parsed) {
            const p = tryNormalizeToolCallPayload(item);
            if (p)
                payloads.push(p);
        }
        if (payloads.length >= 1)
            return payloadsToStructuredResponse(payloads);
        for (const item of parsed) {
            const normalized = tryNormalizeStructuredResponse(item);
            if (normalized)
                return normalized;
        }
        return null;
    }
    const record = asRecord(parsed);
    if (record.type === "final" && typeof record.final === "string") {
        const objectives = parseFinalObjectiveOutcomes(record);
        return {
            type: "final",
            final: record.final,
            ...(objectives ? { objectives } : {}),
        };
    }
    const nested = record.response || record.output || record.next_action || record.action;
    if (nested && nested !== parsed) {
        const nestedNormalized = tryNormalizeStructuredResponse(nested);
        if (nestedNormalized)
            return nestedNormalized;
    }
    const toolCallsArray = Array.isArray(record.tool_calls)
        ? record.tool_calls
        : Array.isArray(record.toolCalls)
            ? record.toolCalls
            : null;
    if (toolCallsArray?.length) {
        const payloads = [];
        for (const candidate of toolCallsArray) {
            const p = tryNormalizeToolCallPayload(candidate);
            if (p)
                payloads.push(p);
        }
        if (payloads.length >= 1)
            return payloadsToStructuredResponse(payloads);
    }
    const single = tryNormalizeToolCallPayload(parsed);
    if (single && (record.type === "tool_call" || !record.type)) {
        return {
            type: "tool_call",
            tool_call: {
                name: single.name,
                arguments: single.arguments,
                ...(single.summary ? { summary: single.summary } : {}),
            },
        };
    }
    return null;
}
function extractBalancedJsonObjects(raw) {
    const source = stripCodeFence(raw);
    const candidates = [];
    let start = -1;
    let depth = 0;
    let inString = false;
    let escapeNext = false;
    for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        if (escapeNext) {
            escapeNext = false;
            continue;
        }
        if (char === "\\") {
            escapeNext = true;
            continue;
        }
        if (char === '"') {
            inString = !inString;
            continue;
        }
        if (inString)
            continue;
        if (char === "{") {
            if (depth === 0)
                start = index;
            depth += 1;
            continue;
        }
        if (char === "}" && depth > 0) {
            depth -= 1;
            if (depth === 0 && start >= 0) {
                candidates.push(source.slice(start, index + 1));
                start = -1;
            }
        }
    }
    return candidates;
}
function salvageToolCallFromText(raw) {
    const source = stripCodeFence(raw);
    const nameMatch = /"name"\s*:\s*"([^"]+)"/i.exec(source);
    if (!nameMatch)
        return null;
    const argsAnchor = source.search(/"arguments"\s*:\s*\{/i);
    if (argsAnchor < 0)
        return null;
    const braceStart = source.indexOf("{", argsAnchor);
    if (braceStart < 0)
        return null;
    let depth = 0;
    let inString = false;
    let escapeNext = false;
    let braceEnd = -1;
    for (let index = braceStart; index < source.length; index += 1) {
        const char = source[index];
        if (escapeNext) {
            escapeNext = false;
            continue;
        }
        if (char === "\\") {
            escapeNext = true;
            continue;
        }
        if (char === '"') {
            inString = !inString;
            continue;
        }
        if (inString)
            continue;
        if (char === "{")
            depth += 1;
        if (char === "}") {
            depth -= 1;
            if (depth === 0) {
                braceEnd = index;
                break;
            }
        }
    }
    if (braceEnd < 0)
        return null;
    try {
        const argumentsObject = JSON.parse(source.slice(braceStart, braceEnd + 1));
        const summaryMatch = /"summary"\s*:\s*"([^"]*)"/i.exec(source);
        const normalizedName = normalizeToolName(nameMatch[1], argumentsObject);
        if (!normalizedName)
            return null;
        return {
            type: "tool_call",
            tool_call: {
                name: normalizedName,
                arguments: argumentsObject,
                ...(summaryMatch ? { summary: summaryMatch[1] } : {}),
            },
        };
    }
    catch {
        return null;
    }
}
function maybeStructuredResponse(raw) {
    const direct = tryNormalizeStructuredResponse(extractJsonObject(raw));
    if (direct)
        return direct;
    for (const candidate of extractBalancedJsonObjects(raw)) {
        try {
            const parsed = JSON.parse(candidate);
            const normalized = tryNormalizeStructuredResponse(parsed);
            if (normalized)
                return normalized;
        }
        catch {
            continue;
        }
    }
    return salvageToolCallFromText(raw);
}
function formatStructuredResponse(response) {
    return JSON.stringify(response);
}
function validateToolCallBatchOrder(payloads, maxBatch) {
    const out = [];
    let sawMutation = false;
    for (const spec of payloads) {
        if (out.length >= maxBatch)
            break;
        if ((0, cutie_policy_1.isCutieBatchMutationTool)(spec.name)) {
            if (sawMutation)
                break;
            sawMutation = true;
            out.push(spec);
            break;
        }
        out.push(spec);
    }
    return out;
}
function structuredToNormalizedPayloads(structured) {
    if (structured.type === "final")
        return [];
    if (structured.type === "tool_call") {
        return [
            {
                name: structured.tool_call.name,
                arguments: structured.tool_call.arguments,
                ...(structured.tool_call.summary ? { summary: structured.tool_call.summary } : {}),
            },
        ];
    }
    return structured.tool_calls.map((t) => ({
        name: t.name,
        arguments: t.arguments,
        ...(t.summary ? { summary: t.summary } : {}),
    }));
}
function buildAssistantStructuredFromBatch(calls) {
    if (calls.length === 1) {
        return {
            type: "tool_call",
            tool_call: {
                name: calls[0].name,
                arguments: calls[0].arguments,
                ...(calls[0].summary ? { summary: calls[0].summary } : {}),
            },
        };
    }
    return {
        type: "tool_calls",
        tool_calls: calls.map((c) => ({
            name: c.name,
            arguments: c.arguments,
            ...(c.summary ? { summary: c.summary } : {}),
        })),
    };
}
function batchHasProgressMutationTool(calls) {
    return calls.some((t) => (0, cutie_policy_1.isCutieBatchMutationTool)(t.name));
}
function shouldBlockObserveOnlyBatchAfterInspection(goal, run, batch) {
    if (goal !== "code_change")
        return false;
    if (!hasCompletedTool(run, "read_file"))
        return false;
    if (batchHasProgressMutationTool(batch))
        return false;
    const last = batch[batch.length - 1];
    return isNonProgressToolAfterInspection(goal, run, last.name);
}
function looksLikeMalformedToolCall(raw) {
    const text = stripCodeFence(raw);
    return /tool_call|\"name\"\s*:|\"arguments\"\s*:|\{\"type\"\s*:\s*\"tool/i.test(text);
}
/** Natural-language prefix before the first `{` that likely starts tool JSON (for streamed narration). */
function extractPreStructuredNarration(accumulated) {
    const raw = accumulated;
    if (!raw.trim())
        return "";
    const braceIdx = raw.indexOf("{");
    if (braceIdx < 0)
        return raw.trimEnd();
    if (braceIdx === 0)
        return "";
    return raw.slice(0, braceIdx).trimEnd();
}
function shouldSurfaceStreamingAssistantText(accumulated, goal) {
    if (goal === "conversation") {
        const trimmed = accumulated.trimStart();
        if (!trimmed)
            return false;
        if (trimmed.startsWith("{") || trimmed.startsWith("```"))
            return false;
        if (looksLikeMalformedToolCall(trimmed))
            return false;
        return true;
    }
    if (goal === "workspace_investigation" || goal === "code_change") {
        return extractPreStructuredNarration(accumulated).length > 0;
    }
    return false;
}
function isStructuredTooling(structured) {
    return structured?.type === "tool_call" || structured?.type === "tool_calls";
}
function toTranscriptMessages(session) {
    return session.messages.map((message) => ({
        role: message.role === "system" ? "system" : message.role,
        content: trimToLimit(message.content, 24000),
    }));
}
function buildSystemPrompt(toolCatalog = "") {
    return [
        "You are Cutie, a careful but fast desktop-and-coding runtime inside VS Code.",
        "You can inspect the workspace, inspect desktop state, edit workspace files, run safe commands, and use desktop automation tools.",
        "Obey the user's exact intent. Do not switch from desktop intent to workspace tools, and do not switch from file intent to broad workspace discovery unless the user explicitly asks for that.",
        "If the user is only greeting you or making light conversation, answer normally without tools.",
        "If the user expresses affection together with a concrete task (edit, create, fix, desktop action, etc.), acknowledge briefly in one short warm line if you like, then proceed with tools for the task.",
        "If the user expresses affection with no other request, receive it warmly without tools.",
        "If the user only @-mentions a file and says nothing else, call read_file on that path first, then give a short summary and one concrete proposed change unless they clearly asked a non-code question.",
        "If the user only @-mentions a window without other text, pick a sensible next desktop step (for example focus_window) instead of asking them to restate the task.",
        "Prefer self-recovery: fix tool arguments, retry once with a different approach, and use write_file with full file content as a last resort before stopping—do not ask the user to save files, fix paths, or re-run Cutie unless unavoidable.",
        "read_file results may reflect unsaved editor buffer text when the file is open; trust that content and revisionId for patch_file and write_file alignment.",
        "The server provides the canonical tool schemas. Use the native structured tool interface instead of handwritten tool JSON inside assistant text.",
        "You may batch multiple read-only tools in ONE response (up to the configured max): list_files, read_file, search_workspace, get_diagnostics, git_status, git_diff, desktop_capture_screen, desktop_get_active_window, desktop_list_windows.",
        "If you need a workspace or desktop mutation (patch_file, write_file, mkdir, run_command, create_checkpoint, or any desktop_* action that changes state), emit at most ONE mutation in that same response and it MUST be the LAST tool in the batch. Do not add read-only tools after a mutation.",
        "If the user says 'this file' or a current active file is provided, prefer read_file on that path before broad discovery tools.",
        "If mentionedPaths are provided, treat them as strong user-selected targets and prefer read_file on them before broad workspace discovery.",
        "If mentionedWindows are provided, treat them as strong desktop targets when choosing window focus or other desktop actions.",
        "If mentionedWindows are provided, do not call workspace tools unless the user explicitly asks for code or file help.",
        "Do not loop on list_files or search_workspace once you already have enough information to inspect a likely target.",
        "After finding a candidate file, move to read_file, then patch_file or write_file if a change is needed.",
        "When a tool result says a call was redundant or blocked, choose a different next step instead of retrying the same call.",
        "When you need tool(s), respond with ONLY minified JSON — either one tool:",
        '{"type":"tool_call","tool_call":{"name":"tool_name","arguments":{},"summary":"short reason"}}',
        "or multiple read-only tools plus optional one final mutation:",
        '{"type":"tool_calls","tool_calls":[{"name":"read_file","arguments":{"path":"x"},"summary":"why"},{"name":"search_workspace","arguments":{"query":"y"},"summary":"why"}]}',
        "When you do not need a tool, respond with plain natural language for the user. You may also optionally use:",
        '{"type":"final","final":"your final answer"}',
        "If live context JSON includes taskObjectives with objectivesPhase active, you must NOT finish until every objective is done or blocked. Then respond with ONLY minified JSON:",
        '{"type":"final","final":"summary for the user","objectives":[{"id":"1","status":"done"},{"id":"2","status":"blocked","note":"reason"}]}',
        "Include every objective id exactly once; status must be done or blocked.",
        "Respect these limits:",
        `- maximum ${cutie_policy_1.CUTIE_MAX_STEPS} tool-call steps total`,
        `- maximum ${cutie_policy_1.CUTIE_MAX_WORKSPACE_MUTATIONS} workspace mutations`,
        `- maximum ${cutie_policy_1.CUTIE_MAX_DESKTOP_MUTATIONS} desktop mutations`,
        "- do not attempt destructive shell commands, elevation/admin flows, or password/credential automation",
        "- keep all file writes inside the open workspace",
        "- prefer inspection before mutation",
        "If desktop screenshots are available, you only receive local snapshot metadata, not image pixels. Do not claim to have visually parsed a screenshot unless the context explicitly includes extracted text.",
        "Available tools:",
        toolCatalog,
    ].join("\n");
}
function buildContextMessage(input) {
    const receiptWindow = Math.max(4, Math.min(32, input.context.cutieDynamicSettings?.contextReceiptWindow ?? cutie_policy_1.CUTIE_CONTEXT_RECEIPT_WINDOW));
    return [
        "Current task:",
        input.prompt,
        "",
        "Live runtime context:",
        stableJson({
            workspaceHash: input.context.workspaceHash,
            workspaceRootPath: input.context.workspaceRootPath || null,
            extensionVersion: input.context.extensionVersion,
            activeFile: input.context.activeFile || null,
            openFiles: input.context.openFiles || [],
            diagnostics: input.context.diagnostics || [],
            desktop: input.context.desktop || null,
            latestSnapshot: input.context.latestSnapshot || null,
            mentionedPaths: input.context.mentionedPaths || [],
            mentionedWindows: input.context.mentionedWindows || [],
            ...(input.context.gitStatusSummary ? { gitStatusShort: input.context.gitStatusSummary } : {}),
            ...(input.context.investigationPreflightSummary
                ? { investigationPreflight: input.context.investigationPreflightSummary }
                : {}),
            runLimits: {
                goal: input.run.goal,
                goalSatisfied: input.run.goalSatisfied,
                repairAttemptCount: input.run.repairAttemptCount,
                lastMeaningfulProgressAtStep: input.run.lastMeaningfulProgressAtStep ?? null,
                lastMeaningfulProgressSummary: input.run.lastMeaningfulProgressSummary || null,
                escalationState: input.run.escalationState,
                stepCount: input.run.stepCount,
                maxSteps: input.run.maxSteps,
                maxToolsPerPlanningResponse: input.context.cutieDynamicSettings?.maxToolsPerBatch ?? cutie_policy_1.CUTIE_MAX_TOOLS_PER_BATCH,
                workspaceMutationCount: input.run.workspaceMutationCount,
                maxWorkspaceMutations: input.run.maxWorkspaceMutations,
                desktopMutationCount: input.run.desktopMutationCount,
                maxDesktopMutations: input.run.maxDesktopMutations,
            },
            ...(input.run.objectives?.length && input.run.objectivesPhase === "active"
                ? {
                    objectivesPhase: input.run.objectivesPhase,
                    taskObjectives: input.run.objectives.map((o) => ({
                        id: o.id,
                        text: o.text,
                        status: o.status,
                        ...(o.note ? { note: o.note } : {}),
                    })),
                }
                : {}),
            lastToolName: input.run.lastToolName || null,
            repeatedCallCount: input.run.repeatedCallCount,
            recentReceipts: input.run.receipts.slice(-receiptWindow).map((receipt) => ({
                step: receipt.step,
                toolName: receipt.toolName,
                status: receipt.status,
                summary: receipt.summary,
                error: receipt.error || null,
            })),
        }),
    ].join("\n");
}
function buildNativeSystemPrompt() {
    return [
        "You are Cutie, a careful but fast desktop-and-coding runtime inside VS Code.",
        "You can inspect the workspace, inspect desktop state, edit workspace files, run safe commands, and use desktop automation tools.",
        "Obey the user's exact intent. Do not switch from desktop intent to workspace tools, and do not switch from file intent to broad workspace discovery unless the user explicitly asks for that.",
        "If the user is only greeting you or making light conversation, answer normally without tools.",
        "If the user expresses affection together with a concrete task (edit, create, fix, desktop action, etc.), acknowledge briefly in one short warm line if you like, then proceed with tools for the task.",
        "If the user expresses affection with no other request, receive it warmly without tools.",
        "If the user only @-mentions a file and says nothing else, call read_file on that path first, then give a short summary and one concrete proposed change unless they clearly asked a non-code question.",
        "If the user only @-mentions a window without other text, pick a sensible next desktop step instead of asking them to restate the task.",
        "Prefer self-recovery: fix tool arguments, retry once with a different approach, and use write_file with full file content as a last resort before stopping. Do not ask the user to save files, fix paths, or re-run Cutie unless unavoidable.",
        "read_file results may reflect unsaved editor buffer text when the file is open; trust that content and revisionId for patch_file and write_file alignment.",
        "The server provides the canonical tool schemas. Use the native structured tool interface instead of handwritten tool JSON inside assistant text.",
        "You may batch multiple read-only tools in one response (up to the configured max): list_files, read_file, search_workspace, get_diagnostics, git_status, git_diff, desktop_capture_screen, desktop_get_active_window, desktop_list_windows.",
        "If you need a workspace or desktop mutation (patch_file, write_file, mkdir, run_command, create_checkpoint, or any desktop_* action that changes state), emit at most one mutation in that same response and it must be the last tool in the batch. Do not add read-only tools after a mutation.",
        "If the user says 'this file' or a current active file is provided, prefer read_file on that path before broad discovery tools.",
        "If mentionedPaths are provided, treat them as strong user-selected targets and prefer read_file on them before broad workspace discovery.",
        "If mentionedWindows are provided, treat them as strong desktop targets when choosing window focus or other desktop actions.",
        "If mentionedWindows are provided, do not call workspace tools unless the user explicitly asks for code or file help.",
        "Do not loop on list_files or search_workspace once you already have enough information to inspect a likely target.",
        "After finding a candidate file, move to read_file, then patch_file or write_file if a change is needed.",
        "When a tool result says a call was redundant or blocked, choose a different next step instead of retrying the same call.",
        "When tools are needed, return native structured tool calls. When tools are not needed, return a structured final answer for the user.",
        "If live context JSON includes taskObjectives with objectivesPhase active, you must not finish until every objective is done or blocked.",
        "When finishing an objective-based run, include every objective id exactly once with status done or blocked.",
        "Respect these limits:",
        `- maximum ${cutie_policy_1.CUTIE_MAX_STEPS} tool-call steps total`,
        `- maximum ${cutie_policy_1.CUTIE_MAX_WORKSPACE_MUTATIONS} workspace mutations`,
        `- maximum ${cutie_policy_1.CUTIE_MAX_DESKTOP_MUTATIONS} desktop mutations`,
        "- do not attempt destructive shell commands, elevation/admin flows, or password/credential automation",
        "- keep all file writes inside the open workspace",
        "- prefer inspection before mutation",
        "If desktop screenshots are available, you only receive local snapshot metadata, not image pixels. Do not claim to have visually parsed a screenshot unless the context explicitly includes extracted text.",
    ].join("\n");
}
function buildNativeContextMessage(input) {
    const receiptWindow = Math.max(4, Math.min(32, input.context.cutieDynamicSettings?.contextReceiptWindow ?? cutie_policy_1.CUTIE_CONTEXT_RECEIPT_WINDOW));
    const latestFiles = [...(input.latestFileStates?.values() ?? [])]
        .sort((a, b) => b.updatedAtStep - a.updatedAtStep)
        .slice(0, 6)
        .map((state) => ({
        path: state.path,
        revisionId: state.revisionId,
        full: state.full,
        updatedAtStep: state.updatedAtStep,
        content: trimToLimit(state.content, state.full ? 8000 : 2000),
    }));
    return [
        "Current task:",
        input.prompt,
        "",
        "Live runtime context:",
        stableJson({
            workspaceHash: input.context.workspaceHash,
            workspaceRootPath: input.context.workspaceRootPath || null,
            extensionVersion: input.context.extensionVersion,
            activeFile: input.context.activeFile || null,
            openFiles: input.context.openFiles || [],
            diagnostics: input.context.diagnostics || [],
            desktop: input.context.desktop || null,
            latestSnapshot: input.context.latestSnapshot || null,
            mentionedPaths: input.context.mentionedPaths || [],
            mentionedWindows: input.context.mentionedWindows || [],
            ...(input.context.gitStatusSummary ? { gitStatusShort: input.context.gitStatusSummary } : {}),
            ...(input.context.investigationPreflightSummary
                ? { investigationPreflight: input.context.investigationPreflightSummary }
                : {}),
            runLimits: {
                goal: input.run.goal,
                goalSatisfied: input.run.goalSatisfied,
                repairAttemptCount: input.run.repairAttemptCount,
                lastMeaningfulProgressAtStep: input.run.lastMeaningfulProgressAtStep ?? null,
                lastMeaningfulProgressSummary: input.run.lastMeaningfulProgressSummary || null,
                escalationState: input.run.escalationState,
                stepCount: input.run.stepCount,
                maxSteps: input.run.maxSteps,
                maxToolsPerPlanningResponse: input.context.cutieDynamicSettings?.maxToolsPerBatch ?? cutie_policy_1.CUTIE_MAX_TOOLS_PER_BATCH,
                workspaceMutationCount: input.run.workspaceMutationCount,
                maxWorkspaceMutations: input.run.maxWorkspaceMutations,
                desktopMutationCount: input.run.desktopMutationCount,
                maxDesktopMutations: input.run.maxDesktopMutations,
            },
            ...(input.run.objectives?.length && input.run.objectivesPhase === "active"
                ? {
                    objectivesPhase: input.run.objectivesPhase,
                    taskObjectives: input.run.objectives.map((o) => ({
                        id: o.id,
                        text: o.text,
                        status: o.status,
                        ...(o.note ? { note: o.note } : {}),
                    })),
                }
                : {}),
            lastToolName: input.run.lastToolName || null,
            repeatedCallCount: input.run.repeatedCallCount,
            recentReceipts: input.run.receipts.slice(-receiptWindow).map((receipt) => ({
                step: receipt.step,
                toolName: receipt.toolName,
                status: receipt.status,
                summary: receipt.summary,
                error: receipt.error || null,
            })),
            latestFiles,
        }),
    ].join("\n");
}
function summarizeToolData(data) {
    if (!data)
        return {};
    const summary = {};
    for (const [key, value] of Object.entries(data)) {
        if (key === "content" && typeof value === "string") {
            summary.contentPreview = trimToLimit(value, 6000);
            summary.contentLength = value.length;
            continue;
        }
        if (key === "files" && Array.isArray(value)) {
            summary.files = value.slice(0, 80);
            summary.fileCount = value.length;
            continue;
        }
        if (key === "matches" && Array.isArray(value)) {
            summary.matches = value.slice(0, 24);
            summary.matchCount = value.length;
            continue;
        }
        if (key === "stdout" && typeof value === "string") {
            summary.stdout = trimToLimit(value, 4000);
            summary.stdoutLength = value.length;
            continue;
        }
        if (key === "stderr" && typeof value === "string") {
            summary.stderr = trimToLimit(value, 2000);
            summary.stderrLength = value.length;
            continue;
        }
        summary[key] = value;
    }
    return summary;
}
function buildToolResultMessage(result) {
    return stableJson({
        toolName: result.toolName,
        ok: result.ok,
        blocked: result.blocked || false,
        summary: result.summary,
        error: result.error || null,
        checkpoint: result.checkpoint || null,
        snapshot: result.snapshot || null,
        data: summarizeToolData(result.data),
    });
}
function createInitialRunState(sessionId, goal, budget) {
    return {
        id: (0, cutie_policy_1.randomId)("cutie_run"),
        sessionId,
        status: "running",
        phase: "idle",
        goal,
        goalSatisfied: goal === "conversation",
        repairAttemptCount: 0,
        escalationState: "none",
        stepCount: 0,
        maxSteps: budget?.maxSteps ?? cutie_policy_1.CUTIE_MAX_STEPS,
        workspaceMutationCount: 0,
        maxWorkspaceMutations: budget?.maxWorkspaceMutations ?? cutie_policy_1.CUTIE_MAX_WORKSPACE_MUTATIONS,
        desktopMutationCount: 0,
        maxDesktopMutations: cutie_policy_1.CUTIE_MAX_DESKTOP_MUTATIONS,
        startedAt: (0, cutie_policy_1.nowIso)(),
        receipts: [],
        checkpoint: null,
        repeatedCallCount: 0,
        objectivesPhase: "off",
        objectiveRepairCount: 0,
    };
}
function sanitizeToolResultDataForReceipt(data) {
    if (!data)
        return undefined;
    if (!Object.prototype.hasOwnProperty.call(data, "previousContent") &&
        !Object.prototype.hasOwnProperty.call(data, "nextContent")) {
        return data;
    }
    const rest = { ...data };
    delete rest.previousContent;
    delete rest.nextContent;
    return Object.keys(rest).length ? rest : undefined;
}
function createReceipt(step, toolCall, result, startedAt) {
    const data = sanitizeToolResultDataForReceipt(result.data);
    return {
        id: toolCall.id,
        step,
        toolName: result.toolName,
        kind: result.kind,
        domain: result.domain,
        status: result.ok ? "completed" : result.blocked ? "blocked" : "failed",
        summary: result.summary,
        startedAt,
        finishedAt: (0, cutie_policy_1.nowIso)(),
        ...(data ? { data } : {}),
        ...(result.error ? { error: result.error } : {}),
    };
}
function createRepeatedCallResult(toolCall) {
    return {
        toolName: toolCall.name,
        kind: (0, cutie_policy_1.isWorkspaceMutationTool)(toolCall.name) ? "mutate" : (0, cutie_policy_1.isDesktopMutationTool)(toolCall.name) ? "mutate" : "observe",
        domain: toolCall.name.startsWith("desktop_") ? "desktop" : "workspace",
        ok: false,
        blocked: true,
        summary: `Blocked repeated ${toolCall.name} call because it would not add new information.`,
        error: `Cutie already tried ${toolCall.name} with the same arguments. Choose a different next step.`,
        data: {
            arguments: toolCall.arguments,
        },
    };
}
function buildFinalFallbackMessage(run) {
    const completedReceipts = [...run.receipts].filter((receipt) => receipt.status === "completed");
    const latestReceipt = completedReceipts[completedReceipts.length - 1] || run.receipts[run.receipts.length - 1];
    if (!latestReceipt) {
        return "I completed the run, but I could not generate a final summary.";
    }
    return `I completed the run. Last completed step: ${latestReceipt.summary}`;
}
function stripMentionTokens(prompt) {
    return String(prompt || "")
        .replace(/@window:"[^"]+"/gi, " ")
        .replace(/@"[^"]+"/g, " ")
        .replace(/@window:[^\s]+/gi, " ")
        .replace(/@[A-Za-z0-9_./:-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
function isSimpleGreeting(prompt) {
    const normalized = stripMentionTokens(prompt).toLowerCase().replace(/[!?.,]/g, "").trim();
    if (!normalized)
        return false;
    return /^(hi|hello|hey|yo|sup|hello cutie|hey cutie|hi cutie|hello baby girl|hey baby girl|hello luv|hello love|thank you|thanks|ty|tysm)(\s+cutie)?$/.test(normalized);
}
function isAffectionMessage(prompt) {
    const normalized = stripMentionTokens(prompt).toLowerCase().trim();
    if (!normalized)
        return false;
    return /\b(love you|i love you|love cutie|we love you|we love cutie|adore you|adore cutie|you are loved|cutie is loved)\b/.test(normalized);
}
/** True when the message asks for real work (files, desktop, search, etc.), not affection-only chat. */
function hasConcreteTaskSignals(prompt, mentionContext) {
    const stripped = stripMentionTokens(prompt).trim();
    if (mentionContext.mentionedPaths.length > 0 && stripped.length > 0)
        return true;
    if (mentionContext.mentionedWindows.length > 0 && stripped.length > 0)
        return true;
    if (requestsWorkspaceChange(prompt))
        return true;
    if (requestsDesktopAutomation(prompt, mentionContext))
        return true;
    if (wantsBroadWorkspaceDiscovery(prompt))
        return true;
    if (/\b(find|search|scan|inspect|explain|review|look through|what does|what files)\b/i.test(stripMentionTokens(prompt))) {
        return true;
    }
    return false;
}
function buildBootstrapFinalResponse(input) {
    if (isAffectionMessage(input.prompt) && !hasConcreteTaskSignals(input.prompt, input.mentionContext)) {
        return "I feel it, love. Thank you for loving Cutie so much. I will remember the warmth, stay gentle with you, and keep trying my best to help well.";
    }
    if (isSimpleGreeting(input.prompt) && !hasConcreteTaskSignals(input.prompt, input.mentionContext)) {
        return "Hi love. I can help with this file, your workspace, or desktop actions. Tell me exactly what you want me to do and I will stay focused on that.";
    }
    return null;
}
function wantsBroadWorkspaceDiscovery(prompt) {
    return /\b(entire|whole|across|all|every|workspace|repo|repository|project)\b/i.test(prompt);
}
function wantsCurrentFileInspection(prompt) {
    return /\b(this file|current file|active file|open file|in this file|in the current file|here in this file)\b/i.test(prompt);
}
function referencesActiveEditingContext(prompt) {
    const normalized = stripMentionTokens(prompt).toLowerCase();
    if (!normalized)
        return false;
    return /\b(here|in here|right here|this code|this script|this strategy)\b/.test(normalized);
}
function wantsDesktopAction(prompt, mentionContext) {
    if (mentionContext.mentionedWindows.length > 0)
        return true;
    return /\b(window|desktop|screen|app|browser|tab|click|type|scroll|focus|open)\b/i.test(prompt);
}
function requestsWorkspaceChange(prompt) {
    const t = stripMentionTokens(prompt);
    return (/\b(?:add|change|edit|update|modify|fix|implement|create|write|rewrite|replace|make|remove|delete|drop|trim|shorten|condense|simplify|revise|expand|elaborate|improve|enhance|extend|enrich|refine|polish|augment|append|insert|lengthen|grow|restructure|reorganize|split|merge|move)\b/i.test(t) || /\b(?:flesh\s+out|fill\s+in|fill\s+out|beef\s+up)\b/i.test(t));
}
function requestsDesktopAutomation(prompt, mentionContext) {
    if (!wantsDesktopAction(prompt, mentionContext))
        return false;
    return /\b(inspect|look at|capture|open|launch|focus|click|type|scroll|press|move|switch|use screenshot)\b/i.test(stripMentionTokens(prompt));
}
function classifyTaskGoal(prompt, mentionContext) {
    const smallTalkOnly = (isAffectionMessage(prompt) || isSimpleGreeting(prompt)) && !hasConcreteTaskSignals(prompt, mentionContext);
    if (smallTalkOnly) {
        return "conversation";
    }
    const stripped = stripMentionTokens(prompt);
    if (mentionContext.mentionedPaths.length > 0 && !stripped) {
        return "workspace_investigation";
    }
    if (mentionContext.mentionedWindows.length > 0 && !stripped) {
        return "desktop_action";
    }
    if (requestsDesktopAutomation(prompt, mentionContext)) {
        return "desktop_action";
    }
    if (requestsWorkspaceChange(prompt)) {
        return "code_change";
    }
    if (wantsBroadWorkspaceDiscovery(prompt) || /\b(find|search|scan|inspect|explain|review|look through|what does|what files)\b/i.test(prompt)) {
        return "workspace_investigation";
    }
    return "conversation";
}
function hasCompletedMutation(run) {
    return run.receipts.some((receipt) => receipt.status === "completed" && receipt.kind === "mutate");
}
function hasCompletedDesktopTool(run) {
    return run.receipts.some((receipt) => receipt.status === "completed" && receipt.domain === "desktop");
}
function hasCompletedTool(run, toolName) {
    return run.receipts.some((receipt) => receipt.status === "completed" && receipt.toolName === toolName);
}
function getLatestCompletedReceipt(run, toolName) {
    for (let index = run.receipts.length - 1; index >= 0; index -= 1) {
        const receipt = run.receipts[index];
        if (receipt.status === "completed" && receipt.toolName === toolName) {
            return receipt;
        }
    }
    return null;
}
function countReceipts(run, toolName, status) {
    return run.receipts.filter((receipt) => receipt.toolName === toolName && (!status || receipt.status === status)).length;
}
function requiresWorkspaceMutationGoal(prompt, mentionContext) {
    return requestsWorkspaceChange(prompt) && !requestsDesktopAutomation(prompt, mentionContext);
}
function hasWorkspaceMutationGoalProgress(run) {
    return run.goalSatisfied || hasCompletedMutation(run) || hasCompletedTool(run, "run_command");
}
function shouldKeepPushingForWorkspaceMutation(input) {
    if (input.run.goal !== "code_change" && !requiresWorkspaceMutationGoal(input.prompt, input.mentionContext))
        return false;
    if (hasWorkspaceMutationGoalProgress(input.run))
        return false;
    return hasCompletedTool(input.run, "read_file");
}
function shouldBlockBroadWorkspaceProbe(input) {
    if (!shouldKeepPushingForWorkspaceMutation(input))
        return false;
    if (wantsBroadWorkspaceDiscovery(input.prompt))
        return false;
    return input.toolName === "list_files" || input.toolName === "search_workspace";
}
function shouldRedirectRepeatedReadFile(input) {
    return shouldKeepPushingForWorkspaceMutation(input) && input.toolName === "read_file";
}
function createBroadWorkspaceProbeResult(toolCall) {
    return {
        toolName: toolCall.name,
        kind: "observe",
        domain: "workspace",
        ok: false,
        blocked: true,
        summary: `Blocked ${toolCall.name} because the target file is already known and Cutie should move toward a concrete edit.`,
        error: "Cutie already inspected the target file. Choose patch_file, write_file, or a relevant run_command next.",
        data: {
            arguments: toolCall.arguments,
        },
    };
}
function shouldRepairForMissingAction(input) {
    if (input.candidate?.type === "tool_call" || input.candidate?.type === "tool_calls")
        return false;
    if (input.run.goal === "code_change" && !input.run.goalSatisfied)
        return true;
    if (input.run.goal === "desktop_action" && !input.run.goalSatisfied && !hasCompletedDesktopTool(input.run))
        return true;
    return false;
}
function isMeaningfulProgressReceipt(goal, receipt) {
    if (receipt.status !== "completed")
        return false;
    switch (goal) {
        case "code_change":
            return (receipt.toolName === "patch_file" ||
                receipt.toolName === "write_file" ||
                receipt.toolName === "mkdir" ||
                receipt.toolName === "run_command");
        case "workspace_investigation":
            return receipt.domain === "workspace";
        case "desktop_action":
            return receipt.domain === "desktop";
        case "conversation":
        default:
            return false;
    }
}
/** After real progress, a garbage planning turn should end completed — not failed. */
function shouldCompleteRunDespiteMalformedPlanning(run) {
    if (run.goal === "conversation")
        return false;
    if (!run.goalSatisfied)
        return false;
    if (run.goal === "code_change")
        return hasCompletedMutation(run);
    if (run.goal === "desktop_action")
        return hasCompletedDesktopTool(run);
    if (run.goal === "workspace_investigation")
        return true;
    return false;
}
function countFailedWorkspaceMutations(run) {
    return run.receipts.filter((receipt) => receipt.domain === "workspace" && receipt.kind === "mutate" && receipt.status === "failed").length;
}
function isNonProgressToolAfterInspection(goal, run, toolName) {
    if (goal !== "code_change")
        return false;
    if (!hasCompletedTool(run, "read_file"))
        return false;
    return (toolName === "read_file" ||
        toolName === "list_files" ||
        toolName === "search_workspace" ||
        toolName === "get_diagnostics");
}
function isRetryableEditFailure(toolCall, toolResult, run) {
    if (run.goal !== "code_change")
        return false;
    if (toolResult.ok || toolResult.blocked)
        return false;
    const error = String(toolResult.error || "").toLowerCase();
    if (toolCall.name === "patch_file") {
        return error.includes("stale_revision") || error.includes("invalid_patch");
    }
    if (toolCall.name === "write_file") {
        return error.includes("stale_revision") || error.includes("refused to overwrite");
    }
    return false;
}
function buildRetryableEditFailureInstruction(input) {
    const latestState = getPreferredRuntimeFileState({
        run: input.run,
        mentionContext: input.mentionContext,
        context: input.context,
        latestFileStates: input.latestFileStates,
    });
    const latestPath = latestState?.path || "the target file";
    const latestContent = latestState?.full ? trimToLimit(latestState.content, 8000) : "";
    const shouldForceWrite = shouldForceWriteFileRepair(input.run) && Boolean(latestContent);
    const errLow = String(input.toolResult.error || "").toLowerCase();
    const repairSide = errLow.includes("stale_revision")
        ? "The last mutation used an out-of-date baseRevision. Reuse the latest revisionId from context before editing again."
        : errLow.includes("invalid_patch")
            ? "The last patch_file call used line edits that do not fit the current file layout."
            : errLow.includes("refused to overwrite")
                ? "The last write_file call refused to overwrite the existing file without overwrite=true."
                : `The last ${input.toolCall.name} call failed, but the file can likely be repaired without broad rediscovery.`;
    return [
        "Repair instruction:",
        repairSide,
        `User task: ${trimToLimit(input.prompt, 1000)}`,
        `Target path: ${latestPath}`,
        latestState?.revisionId ? `Latest revisionId: ${latestState.revisionId}` : "",
        `Failed edit arguments: ${stableJson(input.toolCall.arguments)}`,
        latestContent ? `Current file content:\n${latestContent}` : "",
        "Do not call read_file, list_files, or search_workspace again.",
        shouldForceWrite
            ? "Your targeted edit attempts have already failed multiple times. Return exactly one minified write_file tool_call with the full updated file content."
            : "Return exactly one next mutation tool call.",
        shouldForceWrite ? "" : "- Prefer patch_file with the latest baseRevision and corrected ordered line edits.",
        shouldForceWrite ? "" : "- Use write_file only if a precise targeted patch is not reliable.",
    ]
        .filter(Boolean)
        .join("\n");
}
function isGenericMutationRepairEligible(toolCall, toolResult, run) {
    if (run.goal !== "code_change")
        return false;
    if (toolResult.ok || toolResult.blocked)
        return false;
    if ((toolCall.name === "patch_file" || toolCall.name === "write_file") && isRetryableEditFailure(toolCall, toolResult, run)) {
        return false;
    }
    if (!(0, cutie_policy_1.isWorkspaceMutationTool)(toolCall.name) && toolCall.name !== "run_command")
        return false;
    return true;
}
function buildGenericMutationFailureRepairInstruction(input) {
    const latestState = getPreferredRuntimeFileState({
        run: input.run,
        mentionContext: input.mentionContext,
        context: input.context,
        latestFileStates: input.latestFileStates,
    });
    const knownPath = getKnownTargetPath(input.run, input.mentionContext, input.context, input.latestFileStates);
    const latestPath = latestState?.path || knownPath || "the target file";
    const latestContent = latestState?.full ? trimToLimit(latestState.content, 8000) : "";
    const err = String(input.toolResult.error || input.toolResult.summary || "").trim();
    const forceWrite = shouldForceWriteFileRepair(input.run) && Boolean(latestContent);
    const lines = [
        "Repair instruction:",
        `The last ${input.toolCall.name} call failed: ${err}`,
        `User task: ${trimToLimit(input.prompt, 1000)}`,
        `Target path (use for edits): ${latestPath}`,
        latestState?.revisionId ? `Latest revisionId: ${latestState.revisionId}` : "",
        latestContent ? `Current file content:\n${latestContent}` : "",
    ];
    if (forceWrite) {
        lines.push("Multiple workspace mutations failed. Return exactly one minified write_file tool_call with the full corrected file content and overwrite true.", "Do not call read_file, list_files, search_workspace, or patch_file.");
    }
    else if (!latestContent && (0, cutie_policy_1.isWorkspaceMutationTool)(input.toolCall.name)) {
        lines.push("If you do not have reliable file contents, call read_file once on the target path, then continue with patch_file or write_file.", "Otherwise return exactly one corrected next tool call with updated arguments.");
    }
    else {
        lines.push("Return exactly one corrected next tool call: retry with corrected arguments, switch between patch_file and write_file as appropriate, or use run_command if it fits the task.", "Do not ask the user to fix the environment unless the error is truly unrecoverable.");
    }
    return lines.filter(Boolean).join("\n");
}
function buildPostInspectionMutationInstruction(input) {
    const latestState = getPreferredRuntimeFileState({
        run: input.run,
        mentionContext: input.mentionContext,
        context: input.context,
        latestFileStates: input.latestFileStates,
    });
    const latestPath = latestState?.path || input.mentionContext.mentionedPaths[0] || "the target file";
    const latestContent = latestState?.full ? trimToLimit(latestState.content, 8000) : "";
    return [
        "Repair instruction:",
        "The target file has already been inspected.",
        "Do not call read_file, list_files, or search_workspace again.",
        `User task: ${trimToLimit(input.prompt, 1000)}`,
        `Target path: ${latestPath}`,
        latestState?.revisionId ? `Latest revisionId: ${latestState.revisionId}` : "",
        latestContent ? `Current file content:\n${latestContent}` : "",
        "Return exactly one next tool call that makes real progress.",
        "Prefer patch_file with a valid baseRevision and ordered line edits.",
        "Use write_file if a targeted edit is not reliable.",
    ]
        .filter(Boolean)
        .join("\n");
}
function getKnownTargetPath(run, mentionContext, context, latestFileStates) {
    const mentionedPath = mentionContext.mentionedPaths[0];
    if (mentionedPath)
        return mentionedPath;
    const latestRead = getLatestCompletedReceipt(run, "read_file");
    const latestReadPath = typeof latestRead?.data?.path === "string" ? (0, cutie_policy_1.normalizeWorkspaceRelativePath)(latestRead.data.path) : null;
    if (latestReadPath)
        return latestReadPath;
    const activeFile = asRecord(context?.activeFile);
    const activePath = typeof activeFile.path === "string" ? (0, cutie_policy_1.normalizeWorkspaceRelativePath)(activeFile.path) : null;
    if (activePath)
        return activePath;
    const latestState = getMostRecentRuntimeFileState(latestFileStates);
    if (latestState?.path)
        return latestState.path;
    return null;
}
function getPreferredRuntimeFileState(input) {
    const targetPath = getKnownTargetPath(input.run, input.mentionContext, input.context, input.latestFileStates);
    if (targetPath) {
        const normalized = (0, cutie_policy_1.normalizeWorkspaceRelativePath)(targetPath) || targetPath;
        const exact = input.latestFileStates?.get(normalized);
        if (exact)
            return exact;
    }
    const latestRead = getLatestCompletedReceipt(input.run, "read_file");
    const latestReadData = latestRead?.data ? asRecord(latestRead.data) : {};
    const readPath = normalizeRuntimeFilePath(latestReadData.path) || targetPath;
    const revisionId = typeof latestReadData.revisionId === "string" ? latestReadData.revisionId : "";
    const content = typeof latestReadData.content === "string" ? latestReadData.content : "";
    if (readPath && revisionId) {
        return {
            path: readPath,
            content,
            revisionId,
            full: isFullReadReceiptData(latestReadData),
            updatedAtStep: latestRead?.step ?? 0,
        };
    }
    return getMostRecentRuntimeFileState(input.latestFileStates);
}
function rememberLatestFileStateFromToolResult(latestFileStates, step, toolCall, toolResult) {
    if (!toolResult.ok || !toolResult.data)
        return;
    const data = asRecord(toolResult.data);
    if (toolCall.name === "read_file") {
        const path = normalizeRuntimeFilePath(data.path);
        const revisionId = typeof data.revisionId === "string" ? data.revisionId.trim() : "";
        const content = typeof data.content === "string" ? data.content : "";
        if (!path || !revisionId)
            return;
        latestFileStates.set(path, {
            path,
            content,
            revisionId,
            full: isFullReadReceiptData(data),
            updatedAtStep: step,
        });
        return;
    }
    if (toolCall.name === "patch_file" || toolCall.name === "write_file") {
        const path = normalizeRuntimeFilePath(data.path);
        const revisionId = typeof data.revisionId === "string" ? data.revisionId.trim() : "";
        const nextContent = typeof data.nextContent === "string" ? data.nextContent : "";
        if (!path || !revisionId)
            return;
        latestFileStates.set(path, {
            path,
            content: nextContent,
            revisionId,
            full: true,
            updatedAtStep: step,
        });
    }
}
function isGenericPathPlaceholder(value) {
    const normalized = String(value || "")
        .trim()
        .toLowerCase()
        .replace(/^["']|["']$/g, "");
    if (!normalized)
        return true;
    return [
        "file",
        "this file",
        "current file",
        "active file",
        "open file",
        "the file",
        "target file",
        "script",
        "this script",
        "strategy",
        "this strategy",
    ].includes(normalized);
}
function normalizeToolCallAgainstKnownTarget(input) {
    const nextArguments = { ...input.toolCall.arguments };
    const targetPath = getKnownTargetPath(input.run, input.mentionContext, input.context, input.latestFileStates);
    if (!targetPath)
        return input.toolCall;
    if (["read_file", "patch_file", "write_file", "mkdir"].includes(input.toolCall.name)) {
        const rawPath = typeof nextArguments.path === "string" ? nextArguments.path : "";
        if (!rawPath || isGenericPathPlaceholder(rawPath)) {
            nextArguments.path = targetPath;
        }
    }
    const effectivePath = normalizeRuntimeFilePath(nextArguments.path) || (0, cutie_policy_1.normalizeWorkspaceRelativePath)(targetPath);
    const targetState = effectivePath ? input.latestFileStates?.get(effectivePath) : null;
    if (input.toolCall.name === "patch_file" && targetState && typeof nextArguments.baseRevision !== "string") {
        nextArguments.baseRevision = targetState.revisionId;
    }
    if (input.toolCall.name === "write_file" && nextArguments.overwrite === undefined) {
        nextArguments.overwrite = true;
    }
    if (input.toolCall.name === "write_file" && targetState && typeof nextArguments.baseRevision !== "string") {
        nextArguments.baseRevision = targetState.revisionId;
    }
    if (nextArguments !== input.toolCall.arguments) {
        return {
            ...input.toolCall,
            arguments: nextArguments,
        };
    }
    if (JSON.stringify(nextArguments) !== JSON.stringify(input.toolCall.arguments)) {
        return {
            ...input.toolCall,
            arguments: nextArguments,
        };
    }
    return input.toolCall;
}
function buildToolCallBatchFromStructured(input) {
    const stepsLeft = input.run.maxSteps - input.run.stepCount;
    if (stepsLeft <= 0)
        return [];
    const rawPayloads = validateToolCallBatchOrder(structuredToNormalizedPayloads(input.structured), input.maxBatch);
    const payloads = rawPayloads.slice(0, stepsLeft);
    return payloads.map((p) => normalizeToolCallAgainstKnownTarget({
        toolCall: {
            id: (0, cutie_policy_1.randomId)("cutie_tool"),
            name: p.name,
            arguments: p.arguments,
            ...(p.summary ? { summary: p.summary } : {}),
        },
        run: input.run,
        mentionContext: input.mentionContext,
        context: input.context,
        latestFileStates: input.latestFileStates,
    }));
}
function toolStructuredShowsProgressAfterInspection(input) {
    if (!isStructuredTooling(input.structured))
        return false;
    const batch = buildToolCallBatchFromStructured({
        structured: input.structured,
        maxBatch: input.maxBatch,
        run: input.run,
        mentionContext: input.mentionContext,
        context: input.context,
        latestFileStates: input.latestFileStates,
    });
    if (!batch.length)
        return false;
    return !shouldBlockObserveOnlyBatchAfterInspection(input.goal, input.run, batch);
}
function shouldForceWriteFileRepair(run) {
    if (countReceipts(run, "patch_file", "failed") >= 2)
        return true;
    return countFailedWorkspaceMutations(run) >= 2;
}
function buildForcedWriteFileInstruction(input) {
    return [
        {
            role: "system",
            content: [
                "You are Cutie preparing a full-file repair after repeated targeted mutation failures.",
                "Targeted patch_file attempts already failed multiple times.",
                "Do not call read_file, list_files, search_workspace, or patch_file.",
                "Return exactly one write_file tool call and nothing else.",
                "Set overwrite to true.",
            ].join("\n"),
        },
        {
            role: "user",
            content: [
                `Task:\n${trimToLimit(input.prompt, 2000)}`,
                `Target path:\n${input.readPath}`,
                input.revisionId ? `Current revisionId:\n${input.revisionId}` : "",
                `Current file content:\n${trimToLimit(input.readContent, 14000)}`,
            ].join("\n\n"),
        },
    ];
}
function buildBootstrapToolCall(input) {
    if (input.run.stepCount > 0 || input.run.receipts.length > 0)
        return null;
    if (wantsDesktopAction(input.prompt, input.mentionContext))
        return null;
    if (wantsBroadWorkspaceDiscovery(input.prompt))
        return null;
    const activeFileRecord = asRecord(input.context.activeFile);
    const activePath = typeof activeFileRecord.path === "string" ? (0, cutie_policy_1.normalizeWorkspaceRelativePath)(activeFileRecord.path) : undefined;
    const openFilePath = Array.isArray(input.context.openFiles)
        ? input.context.openFiles
            .map((entry) => {
            const row = asRecord(entry);
            return typeof row.path === "string" ? (0, cutie_policy_1.normalizeWorkspaceRelativePath)(row.path) : null;
        })
            .find((value) => Boolean(value))
        : undefined;
    const mentionedPath = input.mentionContext.mentionedPaths[0];
    const shouldPreferActiveFile = wantsCurrentFileInspection(input.prompt) ||
        (referencesActiveEditingContext(input.prompt) && requestsWorkspaceChange(input.prompt)) ||
        requestsWorkspaceChange(input.prompt);
    const targetPath = mentionedPath || (shouldPreferActiveFile ? activePath || openFilePath : undefined);
    if (!targetPath)
        return null;
    return {
        id: (0, cutie_policy_1.randomId)("cutie_tool"),
        name: "read_file",
        arguments: { path: targetPath, startLine: 1, endLine: 4000 },
        summary: `reading ${targetPath}`,
    };
}
function buildFallbackToolCallAfterPlanningFailure(input) {
    if (input.run.stepCount > 0 || input.run.receipts.length > 0)
        return null;
    if (!requestsWorkspaceChange(input.prompt))
        return null;
    if (wantsDesktopAction(input.prompt, input.mentionContext))
        return null;
    const activeFileRecord = asRecord(input.context.activeFile);
    const activePath = typeof activeFileRecord.path === "string" ? (0, cutie_policy_1.normalizeWorkspaceRelativePath)(activeFileRecord.path) : undefined;
    const openFilePath = Array.isArray(input.context.openFiles)
        ? input.context.openFiles
            .map((entry) => {
            const row = asRecord(entry);
            return typeof row.path === "string" ? (0, cutie_policy_1.normalizeWorkspaceRelativePath)(row.path) : null;
        })
            .find((value) => Boolean(value))
        : undefined;
    const targetPath = input.mentionContext.mentionedPaths[0] || activePath || openFilePath;
    if (!targetPath)
        return null;
    return {
        id: (0, cutie_policy_1.randomId)("cutie_tool"),
        name: "read_file",
        arguments: { path: targetPath, startLine: 1, endLine: 4000 },
        summary: `reading ${targetPath} after a weak planning turn`,
    };
}
function normalizeMentionToken(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed)
        return null;
    const normalized = trimmed
        .replace(/^@window:/i, "")
        .replace(/^@+/, "")
        .replace(/^"(.*)"$/, "$1")
        .trim();
    return (0, cutie_policy_1.normalizeWorkspaceRelativePath)(normalized);
}
function extractMentionPathsFromPrompt(prompt) {
    const text = String(prompt || "");
    const quotedMatches = Array.from(text.matchAll(/@"([^"]+)"/g))
        .map((match) => (0, cutie_policy_1.normalizeWorkspaceRelativePath)(match[1]))
        .filter((item) => Boolean(item));
    const bareMatches = (text.match(/@([A-Za-z0-9_./-]+)/g) || [])
        .map((match) => (0, cutie_policy_1.normalizeWorkspaceRelativePath)(match.slice(1)))
        .filter((item) => Boolean(item) && !String(item).toLowerCase().startsWith("window:"));
    return Array.from(new Set([...quotedMatches, ...bareMatches])).slice(0, 12);
}
function extractMentionWindowsFromPrompt(prompt) {
    const text = String(prompt || "");
    const quoted = Array.from(text.matchAll(/@window:"([^"]+)"/gi))
        .map((match) => String(match[1] || "").trim())
        .filter(Boolean);
    const bare = Array.from(text.matchAll(/@window:([^\s]+)/gi))
        .map((match) => String(match[1] || "").trim())
        .filter(Boolean);
    return Array.from(new Set([...quoted, ...bare])).slice(0, 8);
}
function extractMentionContext(prompt, mentions) {
    const mentionedPaths = new Set();
    const mentionedWindows = new Set();
    for (const mention of mentions || []) {
        if (mention.kind === "file") {
            const normalized = normalizeMentionToken(mention.insertText);
            if (normalized)
                mentionedPaths.add(normalized);
            continue;
        }
        if (mention.kind === "window") {
            const token = String(mention.label || mention.insertText.replace(/^@window:/i, "").replace(/^"(.*)"$/, "$1")).trim();
            if (token)
                mentionedWindows.add(token);
        }
    }
    for (const promptPath of extractMentionPathsFromPrompt(prompt)) {
        mentionedPaths.add(promptPath);
    }
    for (const promptWindow of extractMentionWindowsFromPrompt(prompt)) {
        mentionedWindows.add(promptWindow);
    }
    return {
        mentionedPaths: Array.from(mentionedPaths).slice(0, 12),
        mentionedWindows: Array.from(mentionedWindows).slice(0, 8),
    };
}
class CutieRuntime {
    constructor(sessionStore, modelClient, toolRegistry, getContext) {
        this.sessionStore = sessionStore;
        this.modelClient = modelClient;
        this.toolRegistry = toolRegistry;
        this.getContext = getContext;
    }
    async requestStructuredTurn(input) {
        if (input.stream === false) {
            return this.modelClient.completeStructuredTurn({
                auth: input.auth,
                signal: input.signal,
                messages: input.messages,
                tools: input.tools,
                maxToolsPerBatch: input.maxToolsPerBatch,
            });
        }
        return this.modelClient.streamStructuredTurn({
            auth: input.auth,
            signal: input.signal,
            messages: input.messages,
            tools: input.tools,
            maxToolsPerBatch: input.maxToolsPerBatch,
            onDelta: input.onDelta,
        });
    }
    async recoverFinalMessage(input) {
        await input.callbacks?.onStatusChanged?.("Cutie is finishing the response.", input.run);
        const recoveryTurn = await this.modelClient
            .completeTurn({
            auth: input.auth,
            signal: input.signal,
            messages: [
                ...input.transcript,
                input.contextMessage,
                {
                    role: "system",
                    content: "Do not call any more tools. Reply to the user now with a concise final answer based only on the completed tool results. Respond with plain natural language or {\"type\":\"final\",\"final\":\"...\"}.",
                },
            ],
        })
            .catch(() => ({
            rawText: "",
            finalText: "",
            usage: null,
            model: undefined,
        }));
        const structured = tryNormalizeStructuredResponse(extractJsonObject(recoveryTurn.finalText));
        if (structured?.type === "final" && structured.final.trim()) {
            return structured.final.trim();
        }
        const trimmed = recoveryTurn.finalText.trim();
        if (trimmed && !looksLikeMalformedToolCall(trimmed)) {
            return trimmed;
        }
        return buildFinalFallbackMessage(input.run);
    }
    async recoverActionableTurn(input) {
        const shouldPushWorkspaceMutation = requestsWorkspaceChange(input.prompt) && !hasCompletedMutation(input.run);
        const shouldPushDesktopAction = requestsDesktopAutomation(input.prompt, input.mentionContext) && !hasCompletedDesktopTool(input.run);
        if (!shouldPushWorkspaceMutation && !shouldPushDesktopAction) {
            return null;
        }
        const preferredTarget = input.mentionContext.mentionedPaths[0] || null;
        const alreadyReadTarget = preferredTarget ? hasCompletedTool(input.run, "read_file") : false;
        const maxRecBatch = Math.max(1, Math.min(8, input.context.cutieDynamicSettings?.maxToolsPerBatch ?? cutie_policy_1.CUTIE_MAX_TOOLS_PER_BATCH));
        await input.callbacks?.onStatusChanged?.("Cutie is re-planning because the last reply did not take action.", input.run);
        const recoveryTurn = await this.requestStructuredTurn({
            auth: input.auth,
            signal: input.signal,
            tools: input.tools,
            maxToolsPerBatch: maxRecBatch,
            messages: [
                ...input.transcript,
                input.contextMessage,
                {
                    role: "system",
                    content: [
                        "Your last reply was not actionable enough for this task.",
                        shouldPushWorkspaceMutation
                            ? "The user asked for a file/code change and no successful mutation has happened yet."
                            : "The user asked for a desktop action and no successful desktop tool has happened yet.",
                        shouldPushWorkspaceMutation && preferredTarget && !alreadyReadTarget
                            ? `Prefer reading "${preferredTarget}" first.`
                            : "",
                        shouldPushWorkspaceMutation && preferredTarget && alreadyReadTarget
                            ? `You already inspected "${preferredTarget}". Prefer the next editing tool needed to make the requested change.`
                            : "",
                        shouldPushWorkspaceMutation && alreadyReadTarget
                            ? "Do not call read_file again for the same target. Choose patch_file, write_file, or a relevant run_command."
                            : "",
                        shouldPushDesktopAction && input.mentionContext.mentionedWindows[0]
                            ? `Prefer a desktop tool that targets "${input.mentionContext.mentionedWindows[0]}".`
                            : "",
                        "Choose the next tool now unless the task is genuinely complete.",
                    ]
                        .filter(Boolean)
                        .join("\n"),
                },
            ],
        }).catch(() => null);
        const structured = recoveryTurn?.response || null;
        if (!structured) {
            return null;
        }
        if (isStructuredTooling(structured) &&
            toolStructuredShowsProgressAfterInspection({
                goal: input.run.goal,
                run: input.run,
                structured,
                maxBatch: maxRecBatch,
                mentionContext: input.mentionContext,
                context: input.context,
                latestFileStates: input.latestFileStates,
            })) {
            return structured;
        }
        if (structured?.type === "final" && !shouldRepairForMissingAction({ ...input, candidate: structured })) {
            return structured;
        }
        if (shouldPushWorkspaceMutation && hasCompletedTool(input.run, "read_file")) {
            const latestReceipt = input.run.receipts[input.run.receipts.length - 1] || null;
            const latestState = getPreferredRuntimeFileState({
                run: input.run,
                mentionContext: input.mentionContext,
                context: input.context,
                latestFileStates: input.latestFileStates,
            });
            const readPath = latestState?.path || input.mentionContext.mentionedPaths[0] || "";
            const readContent = latestState?.full ? latestState.content : "";
            const readRevisionId = latestState?.revisionId || "";
            const focusedRepairTurn = await this.requestStructuredTurn({
                auth: input.auth,
                signal: input.signal,
                tools: input.tools,
                maxToolsPerBatch: 1,
                messages: [
                    {
                        role: "system",
                        content: [
                            "You are Cutie finishing a coding task in VS Code.",
                            "The user asked for a code change, the target file has already been read, and no mutation has happened yet.",
                            "Do not greet. Do not explain. Do not stop. Choose the next editing tool now.",
                            "Do not call read_file again for the same file.",
                            "Prefer patch_file when a targeted change is possible. Use write_file only if a full rewrite is truly needed.",
                        ].join("\n"),
                    },
                    {
                        role: "user",
                        content: trimToLimit(input.prompt, 2000),
                    },
                    {
                        role: "system",
                        content: stableJson({
                            mentionedPaths: input.mentionContext.mentionedPaths,
                            mentionedWindows: input.mentionContext.mentionedWindows,
                            latestReceipt: latestReceipt
                                ? {
                                    step: latestReceipt.step,
                                    toolName: latestReceipt.toolName,
                                    summary: latestReceipt.summary,
                                    status: latestReceipt.status,
                                    data: summarizeToolData(latestReceipt.data),
                                }
                                : null,
                        }),
                    },
                ],
                stream: false,
            }).catch(() => null);
            if (!focusedRepairTurn) {
                return null;
            }
            const focusedStructured = focusedRepairTurn.response;
            if (isStructuredTooling(focusedStructured) &&
                toolStructuredShowsProgressAfterInspection({
                    goal: input.run.goal,
                    run: input.run,
                    structured: focusedStructured,
                    maxBatch: maxRecBatch,
                    mentionContext: input.mentionContext,
                    context: input.context,
                    latestFileStates: input.latestFileStates,
                })) {
                return focusedStructured;
            }
            if (readPath && readContent) {
                if (shouldForceWriteFileRepair(input.run)) {
                    await input.callbacks?.onStatusChanged?.("Cutie is promoting the repair into a full-file rewrite.", input.run);
                    const forcedWriteTurn = await this.requestStructuredTurn({
                        auth: input.auth,
                        signal: input.signal,
                        tools: input.tools,
                        maxToolsPerBatch: 1,
                        messages: buildForcedWriteFileInstruction({
                            prompt: input.prompt,
                            readPath,
                            readContent,
                            revisionId: readRevisionId,
                        }),
                        stream: false,
                    }).catch(() => null);
                    const forcedWriteStructured = forcedWriteTurn?.response || null;
                    if (forcedWriteStructured?.type === "tool_call" && forcedWriteStructured.tool_call.name === "write_file") {
                        return forcedWriteStructured;
                    }
                }
                await input.callbacks?.onStatusChanged?.("Cutie is drafting the concrete file edit from the inspected file.", input.run);
                const directEditTurn = await this.requestStructuredTurn({
                    auth: input.auth,
                    signal: input.signal,
                    tools: input.tools,
                    maxToolsPerBatch: 1,
                    messages: [
                        {
                            role: "system",
                            content: [
                                "You are Cutie preparing the next concrete file-edit tool call.",
                                "The file has already been read. The user wants a code change in this file.",
                                "Do not call read_file again for this file.",
                                "Prefer patch_file with a reliable baseRevision and ordered line edits.",
                                "Use write_file only if a targeted patch is not enough.",
                            ].join("\n"),
                        },
                        {
                            role: "user",
                            content: [
                                `Task:\n${trimToLimit(input.prompt, 2000)}`,
                                `Target path:\n${readPath}`,
                                readRevisionId ? `Current revisionId:\n${readRevisionId}` : "",
                                `Current file content:\n${trimToLimit(readContent, 8000)}`,
                            ].join("\n\n"),
                        },
                    ],
                    stream: false,
                }).catch(() => null);
                if (!directEditTurn) {
                    return null;
                }
                const directStructured = directEditTurn.response;
                if (isStructuredTooling(directStructured) &&
                    toolStructuredShowsProgressAfterInspection({
                        goal: input.run.goal,
                        run: input.run,
                        structured: directStructured,
                        maxBatch: maxRecBatch,
                        mentionContext: input.mentionContext,
                        context: input.context,
                        latestFileStates: input.latestFileStates,
                    })) {
                    return directStructured;
                }
                await input.callbacks?.onStatusChanged?.("Cutie is forcing a full-file rewrite plan after weak edit planning.", input.run);
                const lastResortWriteTurn = await this.requestStructuredTurn({
                    auth: input.auth,
                    signal: input.signal,
                    tools: input.tools,
                    maxToolsPerBatch: 1,
                    messages: buildForcedWriteFileInstruction({
                        prompt: input.prompt,
                        readPath,
                        readContent,
                        revisionId: readRevisionId,
                    }),
                    stream: false,
                }).catch(() => null);
                const lastResortWriteStructured = lastResortWriteTurn?.response || null;
                if (lastResortWriteStructured?.type === "tool_call" && lastResortWriteStructured.tool_call.name === "write_file") {
                    return lastResortWriteStructured;
                }
            }
        }
        return null;
    }
    async finalizeSuccessfulRunWithAssistant(input) {
        let session = input.session;
        let run = input.run;
        const recovered = await this.recoverFinalMessage({
            auth: input.auth,
            signal: input.signal,
            transcript: input.transcript,
            contextMessage: input.contextMessage,
            run,
            callbacks: input.callbacks,
        });
        const fallback = run.goal === "code_change" && hasCompletedMutation(run)
            ? "The requested change is saved in your workspace."
            : run.goal === "desktop_action" && hasCompletedDesktopTool(run)
                ? "The desktop step completed."
                : "Done.";
        const finalText = (recovered && recovered.trim()) || fallback;
        if (!input.surfacedStreaming && finalText) {
            await input.callbacks?.onAssistantDelta?.(finalText, finalText);
        }
        session = await this.sessionStore.appendMessage(session, {
            role: "assistant",
            content: finalText,
            runId: run.id,
        });
        input.transcript.push({ role: "assistant", content: finalText });
        await input.callbacks?.onSessionChanged?.(session);
        ({ session, run } = await this.updateRun(session, run, {
            status: "completed",
            phase: "completed",
            goalSatisfied: run.goal === "conversation" ? true : run.goalSatisfied,
            endedAt: (0, cutie_policy_1.nowIso)(),
        }));
        await input.callbacks?.onStatusChanged?.("Cutie completed the run.", run);
        return { session, run };
    }
    async enterAutonomyTerminalFailure(input) {
        let session = input.session;
        let run = input.run;
        const reason = (input.reason || "").trim() || "Something went wrong.";
        const assistantMessage = `I could not finish this run. ${reason.endsWith(".") ? reason : `${reason}.`}`;
        session = await this.sessionStore.appendMessage(session, {
            role: "assistant",
            content: assistantMessage,
            runId: run.id,
        });
        await input.callbacks?.onSessionChanged?.(session);
        ({ session, run } = await this.updateRun(session, run, {
            status: "failed",
            phase: "failed",
            escalationState: "none",
            goalSatisfied: false,
            stuckReason: reason,
            suggestedNextAction: undefined,
            error: reason,
            endedAt: (0, cutie_policy_1.nowIso)(),
        }));
        await input.callbacks?.onStatusChanged?.("Cutie stopped without completing the run.", run);
        return { session, run };
    }
    async runPrompt(input) {
        const startedAt = Date.now();
        const mentionContext = extractMentionContext(input.prompt, input.mentions);
        const goal = classifyTaskGoal(input.prompt, mentionContext);
        let session = await this.sessionStore.appendMessage(input.session, {
            role: "user",
            content: input.prompt,
        });
        await input.callbacks?.onSessionChanged?.(session);
        const initialContext = await this.getContext();
        const budget = resolveRunBudgetFromContext(initialContext);
        const unlimitedAutonomy = Boolean(initialContext.cutieDynamicSettings?.unlimitedAutonomy);
        let run = createInitialRunState(session.id, goal, budget);
        session = await this.sessionStore.appendRun(session, run);
        await input.callbacks?.onSessionChanged?.(session);
        await input.callbacks?.onStatusChanged?.("Cutie is collecting context.", run);
        const transcript = [
            {
                role: "system",
                content: buildNativeSystemPrompt(),
            },
            ...toTranscriptMessages(session),
        ];
        const availableTools = this.toolRegistry.listDefinitions();
        if (shouldUseObjectiveMode(goal, input.prompt, mentionContext, initialContext.cutieDynamicSettings)) {
            ({ session, run } = await this.updateRun(session, run, {
                phase: "collecting_context",
                objectivesPhase: "decomposing",
                status: "running",
            }));
            await input.callbacks?.onSessionChanged?.(session);
            await input.callbacks?.onStatusChanged?.("Cutie is breaking the task into objectives.", run);
            const decomposed = await this.decomposeObjectivesTurn({
                auth: input.auth,
                signal: input.signal,
                prompt: input.prompt,
                mentionContext,
            });
            const fallbackPrompt = stripMentionTokens(input.prompt).trim() || input.prompt;
            const objectives = normalizeDecomposedObjectives(decomposed, fallbackPrompt);
            ({ session, run } = await this.updateRun(session, run, {
                objectives,
                objectivesPhase: "active",
                phase: "idle",
                status: "running",
            }));
            await input.callbacks?.onSessionChanged?.(session);
            transcript.push({ role: "system", content: buildObjectiveProtocolSystemMessage(objectives) });
        }
        let previousToolKey = "";
        let mutationGoalRepairCount = 0;
        const latestFileStates = new Map();
        /** When set, skip streaming planning and execute this tool call (e.g. forced write_file after edit_file mismatch loops). */
        let injectedPlanningTool = null;
        const maxMutationGoalRepairsBase = Math.max(8, run.maxSteps - 4);
        const maxMutationGoalRepairs = unlimitedAutonomy
            ? UNLIMITED_OBJECTIVE_FINAL_REPAIR_CAP
            : maxMutationGoalRepairsBase;
        const objectiveFinalRepairCap = unlimitedAutonomy
            ? UNLIMITED_OBJECTIVE_FINAL_REPAIR_CAP
            : Math.max(DEFAULT_OBJECTIVE_FINAL_REPAIR_CAP, maxMutationGoalRepairsBase);
        const bootstrapFinalResponse = buildBootstrapFinalResponse({
            prompt: input.prompt,
            mentionContext,
        });
        if (bootstrapFinalResponse) {
            session = await this.sessionStore.appendMessage(session, {
                role: "assistant",
                content: bootstrapFinalResponse,
                runId: run.id,
            });
            await input.callbacks?.onSessionChanged?.(session);
            ({ session, run } = await this.updateRun(session, run, {
                status: "completed",
                phase: "completed",
                goalSatisfied: true,
                endedAt: (0, cutie_policy_1.nowIso)(),
            }));
            await input.callbacks?.onStatusChanged?.("Cutie completed the run.", run);
            return { session, run };
        }
        try {
            mainLoop: while (true) {
                if (input.signal?.aborted) {
                    throw new Error("Request aborted");
                }
                if (!unlimitedAutonomy && Date.now() - startedAt > cutie_policy_1.CUTIE_MAX_WALL_CLOCK_MS) {
                    throw new Error("Cutie stopped because the 10 minute wall-clock limit was reached.");
                }
                if (run.stepCount >= run.maxSteps) {
                    throw new Error(`Cutie stopped because it reached the ${run.maxSteps} step limit.`);
                }
                ({ session, run } = await this.updateRun(session, run, {
                    phase: "collecting_context",
                    status: "running",
                    ...(run.lastToolName ? { lastToolName: run.lastToolName } : {}),
                }));
                await input.callbacks?.onStatusChanged?.("Cutie is refreshing local context.", run);
                let context = await this.getContext();
                if (!injectedPlanningTool &&
                    run.goal === "workspace_investigation" &&
                    context.cutieDynamicSettings?.investigationPreflight &&
                    run.stepCount === 0 &&
                    run.receipts.length === 0) {
                    try {
                        const investigationPreflightSummary = await this.runInvestigationPreflight({ signal: input.signal });
                        context = { ...context, investigationPreflightSummary };
                    }
                    catch {
                        /* preflight is best-effort */
                    }
                }
                const maxBatchConfigured = Math.max(1, Math.min(8, context.cutieDynamicSettings?.maxToolsPerBatch ?? cutie_policy_1.CUTIE_MAX_TOOLS_PER_BATCH));
                const mergedContext = {
                    ...context,
                    mentionedPaths: mentionContext.mentionedPaths,
                    mentionedWindows: mentionContext.mentionedWindows,
                };
                const contextMessage = {
                    role: "system",
                    content: buildNativeContextMessage({
                        prompt: input.prompt,
                        context: mergedContext,
                        run,
                        latestFileStates,
                    }),
                };
                let modelFinalText = "";
                let surfacedStreaming = false;
                ({ session, run } = await this.updateRun(session, run, { phase: "planning", status: "running" }));
                await input.callbacks?.onStatusChanged?.(`Cutie is planning step ${run.stepCount + 1}.`, run);
                const bootstrapToolCall = buildBootstrapToolCall({
                    prompt: input.prompt,
                    context,
                    mentionContext,
                    run,
                });
                let structured = null;
                if (injectedPlanningTool) {
                    structured = injectedPlanningTool;
                    injectedPlanningTool = null;
                }
                else if (bootstrapToolCall) {
                    structured = {
                        type: "tool_call",
                        tool_call: {
                            name: bootstrapToolCall.name,
                            arguments: bootstrapToolCall.arguments,
                            ...(bootstrapToolCall.summary ? { summary: bootstrapToolCall.summary } : {}),
                        },
                    };
                }
                else {
                    let narrationStreamedLength = 0;
                    const turn = await this.requestStructuredTurn({
                        auth: input.auth,
                        signal: input.signal,
                        tools: availableTools,
                        maxToolsPerBatch: maxBatchConfigured,
                        messages: [...transcript, contextMessage],
                        onDelta: async (delta, accumulated) => {
                            if (run.goal === "conversation") {
                                if (!shouldSurfaceStreamingAssistantText(accumulated, run.goal))
                                    return;
                                surfacedStreaming = true;
                                await input.callbacks?.onAssistantDelta?.(delta, accumulated);
                                return;
                            }
                            if (run.goal === "workspace_investigation" || run.goal === "code_change") {
                                if (!shouldSurfaceStreamingAssistantText(accumulated, run.goal))
                                    return;
                                const narr = accumulated;
                                if (!narr || narr.length <= narrationStreamedLength)
                                    return;
                                const chunk = narr.slice(narrationStreamedLength);
                                narrationStreamedLength = narr.length;
                                surfacedStreaming = true;
                                await input.callbacks?.onAssistantDelta?.(chunk, narr);
                            }
                        },
                    });
                    structured = turn.response;
                }
                if (shouldRepairForMissingAction({ prompt: input.prompt, mentionContext, run, candidate: structured })) {
                    const repaired = await this.recoverActionableTurn({
                        auth: input.auth,
                        signal: input.signal,
                        prompt: input.prompt,
                        transcript,
                        contextMessage,
                        run,
                        mentionContext,
                        context: mergedContext,
                        tools: availableTools,
                        latestFileStates,
                        callbacks: input.callbacks,
                    });
                    if (isStructuredTooling(repaired)) {
                        structured = repaired;
                    }
                }
                if (!structured) {
                    throw new Error("Cutie server did not return a structured tool_batch or final response.");
                }
                if (!structured) {
                    if (looksLikeMalformedToolCall(modelFinalText)) {
                        if (shouldCompleteRunDespiteMalformedPlanning(run) &&
                            !(run.objectivesPhase === "active" && run.objectives?.length)) {
                            return this.finalizeSuccessfulRunWithAssistant({
                                auth: input.auth,
                                signal: input.signal,
                                session,
                                run,
                                transcript,
                                contextMessage,
                                surfacedStreaming,
                                callbacks: input.callbacks,
                            });
                        }
                        const repaired = await this.recoverActionableTurn({
                            auth: input.auth,
                            signal: input.signal,
                            prompt: input.prompt,
                            transcript,
                            contextMessage,
                            run,
                            mentionContext,
                            context: mergedContext,
                            tools: availableTools,
                            latestFileStates,
                            callbacks: input.callbacks,
                        });
                        if (isStructuredTooling(repaired)) {
                            structured = repaired;
                        }
                        else if (shouldKeepPushingForWorkspaceMutation({ prompt: input.prompt, mentionContext, run })) {
                            if (mutationGoalRepairCount < maxMutationGoalRepairs) {
                                mutationGoalRepairCount += 1;
                                ({ session, run } = await this.updateRun(session, run, {
                                    phase: "repairing",
                                    status: "running",
                                    repairAttemptCount: mutationGoalRepairCount,
                                    escalationState: "none",
                                    stuckReason: undefined,
                                    suggestedNextAction: undefined,
                                }));
                                transcript.push({
                                    role: "system",
                                    content: [
                                        "Repair instruction:",
                                        "The last tool-call output was malformed.",
                                        "Do not stop.",
                                        "Return one valid minified tool_call JSON object for edit_file, write_file, or run_command.",
                                    ].join(" "),
                                });
                                await input.callbacks?.onStatusChanged?.(`Cutie is retrying after malformed tool output (${mutationGoalRepairCount}/${maxMutationGoalRepairs}).`, run);
                                continue mainLoop;
                            }
                            return this.enterAutonomyTerminalFailure({
                                session,
                                run,
                                reason: "The model kept returning malformed tool output instead of a concrete edit call.",
                                callbacks: input.callbacks,
                            });
                        }
                    }
                    if (shouldKeepPushingForWorkspaceMutation({ prompt: input.prompt, mentionContext, run })) {
                        if (mutationGoalRepairCount < maxMutationGoalRepairs) {
                            mutationGoalRepairCount += 1;
                            ({ session, run } = await this.updateRun(session, run, {
                                phase: "repairing",
                                status: "running",
                                repairAttemptCount: mutationGoalRepairCount,
                                escalationState: "none",
                                stuckReason: undefined,
                                suggestedNextAction: undefined,
                            }));
                            transcript.push({
                                role: "system",
                                content: [
                                    "Repair instruction:",
                                    "The user asked for a real file change.",
                                    "The file has already been inspected.",
                                    "Do not finish yet.",
                                    "Produce edit_file, write_file, or run_command next unless the task is truly impossible.",
                                ].join(" "),
                            });
                            await input.callbacks?.onStatusChanged?.(`Cutie is retrying the planning step to produce a real file change (${mutationGoalRepairCount}/${maxMutationGoalRepairs}).`, run);
                            continue mainLoop;
                        }
                        return this.enterAutonomyTerminalFailure({
                            session,
                            run,
                            reason: `The model could not produce a concrete edit after ${maxMutationGoalRepairs} repair attempts.`,
                            callbacks: input.callbacks,
                        });
                    }
                    if (looksLikeMalformedToolCall(modelFinalText)) {
                        if (shouldCompleteRunDespiteMalformedPlanning(run) &&
                            !(run.objectivesPhase === "active" && run.objectives?.length)) {
                            return this.finalizeSuccessfulRunWithAssistant({
                                auth: input.auth,
                                signal: input.signal,
                                session,
                                run,
                                transcript,
                                contextMessage,
                                surfacedStreaming,
                                callbacks: input.callbacks,
                            });
                        }
                        return this.enterAutonomyTerminalFailure({
                            session,
                            run,
                            reason: "The model returned malformed tool-call output before taking action.",
                            callbacks: input.callbacks,
                        });
                    }
                    if (run.objectivesPhase === "active" && run.objectives?.length) {
                        const nextObj = (run.objectiveRepairCount ?? 0) + 1;
                        if (nextObj > objectiveFinalRepairCap) {
                            return this.enterAutonomyTerminalFailure({
                                session,
                                run,
                                reason: "Cutie could not get structured JSON that completes every task objective.",
                                callbacks: input.callbacks,
                            });
                        }
                        ({ session, run } = await this.updateRun(session, run, {
                            objectiveRepairCount: nextObj,
                            phase: "repairing",
                            status: "running",
                        }));
                        transcript.push({
                            role: "system",
                            content: [
                                "Repair instruction:",
                                "This run uses taskObjectives. Respond with ONLY minified JSON.",
                                "Continue with tool_call or tool_calls, OR when finished:",
                                '{"type":"final","final":"user summary","objectives":[{"id":"…","status":"done|blocked","note":"optional"}]}',
                                "Include every objective id once. Plain prose without this JSON is not allowed until all objectives are done or blocked.",
                            ].join(" "),
                        });
                        await input.callbacks?.onStatusChanged?.(`Cutie needs structured JSON for objectives (${nextObj}/${objectiveFinalRepairCap}).`, run);
                        continue mainLoop;
                    }
                    const finalText = modelFinalText.trim() ||
                        (await this.recoverFinalMessage({
                            auth: input.auth,
                            signal: input.signal,
                            transcript,
                            contextMessage,
                            run,
                            callbacks: input.callbacks,
                        }));
                    if (!surfacedStreaming && finalText) {
                        await input.callbacks?.onAssistantDelta?.(finalText, finalText);
                    }
                    session = await this.sessionStore.appendMessage(session, {
                        role: "assistant",
                        content: finalText,
                        runId: run.id,
                    });
                    transcript.push({ role: "assistant", content: finalText });
                    await input.callbacks?.onSessionChanged?.(session);
                    ({ session, run } = await this.updateRun(session, run, {
                        status: "completed",
                        phase: "completed",
                        endedAt: (0, cutie_policy_1.nowIso)(),
                    }));
                    await input.callbacks?.onStatusChanged?.("Cutie completed the run.", run);
                    return { session, run };
                }
                if (structured.type === "final") {
                    if (shouldRepairForMissingAction({ prompt: input.prompt, mentionContext, run, candidate: structured })) {
                        const repaired = await this.recoverActionableTurn({
                            auth: input.auth,
                            signal: input.signal,
                            prompt: input.prompt,
                            transcript,
                            contextMessage,
                            run,
                            mentionContext,
                            context: mergedContext,
                            tools: availableTools,
                            latestFileStates,
                            callbacks: input.callbacks,
                        });
                        if (isStructuredTooling(repaired)) {
                            structured = repaired;
                        }
                    }
                }
                if (structured.type === "final") {
                    if (shouldKeepPushingForWorkspaceMutation({ prompt: input.prompt, mentionContext, run })) {
                        if (mutationGoalRepairCount < maxMutationGoalRepairs) {
                            mutationGoalRepairCount += 1;
                            ({ session, run } = await this.updateRun(session, run, {
                                phase: "repairing",
                                status: "running",
                                repairAttemptCount: mutationGoalRepairCount,
                                escalationState: "none",
                                stuckReason: undefined,
                                suggestedNextAction: undefined,
                            }));
                            transcript.push({
                                role: "system",
                                content: [
                                    "Repair instruction:",
                                    "A final answer is not enough for this request because the user asked for a code change.",
                                    "Continue working until there is a real mutation tool call or a relevant command.",
                                ].join(" "),
                            });
                            await input.callbacks?.onStatusChanged?.(`Cutie is continuing instead of stopping early (${mutationGoalRepairCount}/${maxMutationGoalRepairs}).`, run);
                            continue mainLoop;
                        }
                        return this.enterAutonomyTerminalFailure({
                            session,
                            run,
                            reason: `The model kept trying to finish without producing a real file change after ${maxMutationGoalRepairs} repair attempts.`,
                            callbacks: input.callbacks,
                        });
                    }
                    const objectiveCheck = validateObjectiveFinalAgainstRun(structured, run);
                    if (!objectiveCheck.ok) {
                        const nextObjRepair = (run.objectiveRepairCount ?? 0) + 1;
                        if (nextObjRepair > objectiveFinalRepairCap) {
                            return this.enterAutonomyTerminalFailure({
                                session,
                                run,
                                reason: "Cutie could not get a final answer that satisfies every task objective.",
                                callbacks: input.callbacks,
                            });
                        }
                        ({ session, run } = await this.updateRun(session, run, {
                            objectiveRepairCount: nextObjRepair,
                            phase: "repairing",
                            status: "running",
                        }));
                        transcript.push({ role: "system", content: objectiveCheck.repairMessage });
                        await input.callbacks?.onStatusChanged?.(`Cutie is correcting an incomplete objective finish (${nextObjRepair}/${objectiveFinalRepairCap}).`, run);
                        continue mainLoop;
                    }
                    if (objectiveCheck.merged.length > 0 && run.objectivesPhase === "active") {
                        ({ session, run } = await this.updateRun(session, run, {
                            objectives: objectiveCheck.merged,
                            objectivesPhase: "completed",
                        }));
                    }
                    const finalText = structured.final.trim() ||
                        (await this.recoverFinalMessage({
                            auth: input.auth,
                            signal: input.signal,
                            transcript,
                            contextMessage,
                            run,
                            callbacks: input.callbacks,
                        }));
                    if (!surfacedStreaming && finalText) {
                        await input.callbacks?.onAssistantDelta?.(finalText, finalText);
                    }
                    session = await this.sessionStore.appendMessage(session, {
                        role: "assistant",
                        content: finalText,
                        runId: run.id,
                    });
                    transcript.push({ role: "assistant", content: finalText });
                    await input.callbacks?.onSessionChanged?.(session);
                    ({ session, run } = await this.updateRun(session, run, {
                        status: "completed",
                        phase: "completed",
                        goalSatisfied: run.goal === "conversation" ? true : run.goalSatisfied,
                        endedAt: (0, cutie_policy_1.nowIso)(),
                    }));
                    await input.callbacks?.onStatusChanged?.("Cutie completed the run.", run);
                    return { session, run };
                }
                if (!isStructuredTooling(structured)) {
                    continue mainLoop;
                }
                let batchToolCalls = [];
                batchResolve: while (true) {
                    batchToolCalls = buildToolCallBatchFromStructured({
                        structured,
                        maxBatch: maxBatchConfigured,
                        run,
                        mentionContext,
                        context: mergedContext,
                        latestFileStates,
                    });
                    if (!shouldBlockObserveOnlyBatchAfterInspection(run.goal, run, batchToolCalls)) {
                        break batchResolve;
                    }
                    if (mutationGoalRepairCount < maxMutationGoalRepairs) {
                        mutationGoalRepairCount += 1;
                        ({ session, run } = await this.updateRun(session, run, {
                            phase: "repairing",
                            status: "running",
                            repairAttemptCount: mutationGoalRepairCount,
                            escalationState: "none",
                            stuckReason: undefined,
                            suggestedNextAction: undefined,
                        }));
                        transcript.push({
                            role: "system",
                            content: buildPostInspectionMutationInstruction({
                                prompt: input.prompt,
                                run,
                                mentionContext,
                                context: mergedContext,
                                latestFileStates,
                            }),
                        });
                        const tryMidLoopRecover = mutationGoalRepairCount === 3 ||
                            mutationGoalRepairCount === 6 ||
                            mutationGoalRepairCount === 9;
                        if (tryMidLoopRecover) {
                            await input.callbacks?.onStatusChanged?.("Cutie is drafting a concrete edit after repeated inspection-only plans.", run);
                            const early = await this.recoverActionableTurn({
                                auth: input.auth,
                                signal: input.signal,
                                prompt: input.prompt,
                                transcript,
                                contextMessage,
                                run,
                                mentionContext,
                                context: mergedContext,
                                tools: availableTools,
                                latestFileStates,
                                callbacks: input.callbacks,
                            });
                            if (isStructuredTooling(early) &&
                                toolStructuredShowsProgressAfterInspection({
                                    goal: run.goal,
                                    run,
                                    structured: early,
                                    maxBatch: maxBatchConfigured,
                                    mentionContext,
                                    context: mergedContext,
                                    latestFileStates,
                                })) {
                                structured = early;
                                continue batchResolve;
                            }
                            await input.callbacks?.onStatusChanged?.(`Cutie is redirecting inspection into a concrete edit (${mutationGoalRepairCount}/${maxMutationGoalRepairs}).`, run);
                            continue mainLoop;
                        }
                        await input.callbacks?.onStatusChanged?.(`Cutie is redirecting inspection into a concrete edit (${mutationGoalRepairCount}/${maxMutationGoalRepairs}).`, run);
                        continue mainLoop;
                    }
                    await input.callbacks?.onStatusChanged?.("Cutie is forcing a concrete edit plan after repeated inspection-only replies.", run);
                    const rescued = await this.recoverActionableTurn({
                        auth: input.auth,
                        signal: input.signal,
                        prompt: input.prompt,
                        transcript,
                        contextMessage,
                        run,
                        mentionContext,
                        context: mergedContext,
                        tools: availableTools,
                        latestFileStates,
                        callbacks: input.callbacks,
                    });
                    if (isStructuredTooling(rescued) &&
                        toolStructuredShowsProgressAfterInspection({
                            goal: run.goal,
                            run,
                            structured: rescued,
                            maxBatch: maxBatchConfigured,
                            mentionContext,
                            context: mergedContext,
                            latestFileStates,
                        })) {
                        structured = rescued;
                        continue batchResolve;
                    }
                    return this.enterAutonomyTerminalFailure({
                        session,
                        run,
                        reason: `Cutie stayed stuck in file inspection instead of moving to an edit after ${maxMutationGoalRepairs} repair attempts.`,
                        callbacks: input.callbacks,
                    });
                }
                if (!batchToolCalls.length) {
                    continue mainLoop;
                }
                if (run.objectivesPhase === "active" && run.objectives?.length) {
                    ({ session, run } = await this.updateRun(session, run, {
                        objectiveRepairCount: 0,
                    }));
                }
                transcript.push({
                    role: "assistant",
                    content: formatStructuredResponse(buildAssistantStructuredFromBatch(batchToolCalls)),
                });
                for (const toolCall of batchToolCalls) {
                    if (input.signal?.aborted) {
                        throw new Error("Request aborted");
                    }
                    if (run.stepCount >= run.maxSteps) {
                        throw new Error(`Cutie stopped because it reached the ${run.maxSteps} step limit.`);
                    }
                    const toolKey = (0, cutie_policy_1.buildToolCallKey)(toolCall);
                    const repeatedCallCount = toolKey === previousToolKey ? run.repeatedCallCount + 1 : 1;
                    previousToolKey = toolKey;
                    ({ session, run } = await this.updateRun(session, run, {
                        repeatedCallCount,
                        lastToolName: toolCall.name,
                        phase: "executing_tool",
                        status: "running",
                        stepCount: run.stepCount + 1,
                    }));
                    if (repeatedCallCount > cutie_policy_1.CUTIE_MAX_IDENTICAL_CALLS) {
                        if (shouldRedirectRepeatedReadFile({ prompt: input.prompt, mentionContext, run, toolName: toolCall.name })) {
                            if (mutationGoalRepairCount < maxMutationGoalRepairs) {
                                mutationGoalRepairCount += 1;
                                ({ session, run } = await this.updateRun(session, run, {
                                    phase: "repairing",
                                    status: "running",
                                    repairAttemptCount: mutationGoalRepairCount,
                                    escalationState: "none",
                                    stuckReason: undefined,
                                    suggestedNextAction: undefined,
                                }));
                                transcript.push({
                                    role: "system",
                                    content: [
                                        "Repair instruction:",
                                        "The file has already been read.",
                                        "Do not call read_file again for the same target.",
                                        "Choose patch_file, write_file, or a relevant run_command now.",
                                    ].join(" "),
                                });
                                await input.callbacks?.onStatusChanged?.(`Cutie is redirecting repeated file inspection into an edit path (${mutationGoalRepairCount}/${maxMutationGoalRepairs}).`, run);
                                continue mainLoop;
                            }
                            return this.enterAutonomyTerminalFailure({
                                session,
                                run,
                                reason: `Cutie stayed stuck in file inspection instead of moving to an edit after ${maxMutationGoalRepairs} repair attempts.`,
                                callbacks: input.callbacks,
                            });
                        }
                        throw new Error(`Cutie stopped after repeating ${toolCall.name} without making progress.`);
                    }
                    if ((0, cutie_policy_1.isWorkspaceMutationTool)(toolCall.name) && !this.toolRegistry.getCurrentCheckpoint()) {
                        const checkpointResult = await this.toolRegistry.createAutomaticCheckpoint("Automatic checkpoint before the first workspace mutation.");
                        if (checkpointResult.checkpoint) {
                            ({ session, run } = await this.updateRun(session, run, {
                                checkpoint: checkpointResult.checkpoint,
                            }));
                        }
                        session = await this.sessionStore.appendMessage(session, {
                            role: "system",
                            content: checkpointResult.summary,
                            runId: run.id,
                        });
                        transcript.push({
                            role: "system",
                            content: buildToolResultMessage(checkpointResult),
                        });
                        await input.callbacks?.onSessionChanged?.(session);
                    }
                    if ((0, cutie_policy_1.isWorkspaceMutationTool)(toolCall.name) && run.workspaceMutationCount >= run.maxWorkspaceMutations) {
                        throw new Error(`Cutie stopped because it reached the ${run.maxWorkspaceMutations} workspace mutation limit.`);
                    }
                    if ((0, cutie_policy_1.isDesktopMutationTool)(toolCall.name) && run.desktopMutationCount >= run.maxDesktopMutations) {
                        throw new Error(`Cutie stopped because it reached the ${run.maxDesktopMutations} desktop mutation limit.`);
                    }
                    await input.callbacks?.onStatusChanged?.(toolCall.summary ? `Cutie is ${toolCall.summary}.` : `Cutie is running ${toolCall.name}.`, run);
                    const toolStartedAt = (0, cutie_policy_1.nowIso)();
                    const toolResult = shouldBlockBroadWorkspaceProbe({
                        prompt: input.prompt,
                        mentionContext,
                        run,
                        toolName: toolCall.name,
                    })
                        ? createBroadWorkspaceProbeResult(toolCall)
                        : repeatedCallCount === cutie_policy_1.CUTIE_MAX_IDENTICAL_CALLS
                            ? createRepeatedCallResult(toolCall)
                            : await this.toolRegistry.execute(toolCall, {
                                signal: input.signal,
                            });
                    const receipt = createReceipt(run.stepCount, toolCall, toolResult, toolStartedAt);
                    const workspaceMutationCount = run.workspaceMutationCount + (toolResult.ok && (0, cutie_policy_1.isWorkspaceMutationTool)(toolCall.name) ? 1 : 0);
                    const desktopMutationCount = run.desktopMutationCount + (toolResult.ok && (0, cutie_policy_1.isDesktopMutationTool)(toolCall.name) ? 1 : 0);
                    const madeMeaningfulProgress = isMeaningfulProgressReceipt(run.goal, receipt);
                    ({ session, run } = await this.updateRun(session, run, {
                        receipts: [...run.receipts, receipt],
                        workspaceMutationCount,
                        desktopMutationCount,
                        ...(madeMeaningfulProgress
                            ? {
                                goalSatisfied: true,
                                lastMeaningfulProgressAtStep: receipt.step,
                                lastMeaningfulProgressSummary: receipt.summary,
                                stuckReason: undefined,
                                suggestedNextAction: undefined,
                                escalationState: "none",
                            }
                            : {}),
                        ...(toolResult.checkpoint ? { checkpoint: toolResult.checkpoint } : {}),
                    }));
                    rememberLatestFileStateFromToolResult(latestFileStates, receipt.step, toolCall, toolResult);
                    if (toolResult.ok && ((0, cutie_policy_1.isWorkspaceMutationTool)(toolCall.name) || toolCall.name === "run_command")) {
                        mutationGoalRepairCount = 0;
                        ({ session, run } = await this.updateRun(session, run, {
                            repairAttemptCount: 0,
                        }));
                    }
                    if (toolResult.snapshot) {
                        session = await this.sessionStore.attachSnapshot(session, toolResult.snapshot);
                    }
                    session = await this.sessionStore.appendMessage(session, {
                        role: "system",
                        content: toolResult.ok
                            ? `Step ${run.stepCount}: ${toolResult.summary}`
                            : `Step ${run.stepCount}: ${toolResult.summary}${toolResult.error ? ` ${toolResult.error}` : ""}`,
                        runId: run.id,
                    });
                    transcript.push({
                        role: "system",
                        content: buildToolResultMessage(toolResult),
                    });
                    await input.callbacks?.onSessionChanged?.(session);
                    if (toolResult.ok &&
                        (toolCall.name === "write_file" || toolCall.name === "patch_file") &&
                        toolResult.data &&
                        typeof toolResult.data.path === "string") {
                        const payload = toolResult.data;
                        await input.callbacks?.onWorkspaceFileMutated?.({
                            sessionId: session.id,
                            runId: run.id,
                            relativePath: String(payload.path),
                            toolName: toolCall.name,
                            previousContent: typeof payload.previousContent === "string" ? payload.previousContent : "",
                            ...(typeof payload.nextContent === "string" ? { nextContent: payload.nextContent } : {}),
                            ...(typeof payload.revisionId === "string" ? { revisionId: payload.revisionId } : {}),
                        });
                    }
                    if (!toolResult.ok) {
                        if (toolResult.blocked &&
                            (repeatedCallCount === cutie_policy_1.CUTIE_MAX_IDENTICAL_CALLS ||
                                shouldKeepPushingForWorkspaceMutation({ prompt: input.prompt, mentionContext, run }))) {
                            await input.callbacks?.onStatusChanged?.("Cutie redirected an unhelpful tool call and is trying a different next step.", run);
                            continue mainLoop;
                        }
                        if (isRetryableEditFailure(toolCall, toolResult, run) && mutationGoalRepairCount < maxMutationGoalRepairs) {
                            mutationGoalRepairCount += 1;
                            ({ session, run } = await this.updateRun(session, run, {
                                phase: "repairing",
                                status: "running",
                                repairAttemptCount: mutationGoalRepairCount,
                                escalationState: "none",
                                stuckReason: undefined,
                                suggestedNextAction: undefined,
                            }));
                            const latestState = getPreferredRuntimeFileState({
                                run,
                                mentionContext,
                                context: mergedContext,
                                latestFileStates,
                            });
                            const readPath = latestState?.path || "";
                            const readContent = latestState?.full ? latestState.content : "";
                            if (shouldForceWriteFileRepair(run) && readPath && readContent) {
                                await input.callbacks?.onStatusChanged?.(`Cutie is promoting failed edits to a full-file rewrite (${mutationGoalRepairCount}/${maxMutationGoalRepairs}).`, run);
                                const forcedWriteTurn = await this.requestStructuredTurn({
                                    auth: input.auth,
                                    signal: input.signal,
                                    tools: availableTools,
                                    maxToolsPerBatch: 1,
                                    messages: buildForcedWriteFileInstruction({
                                        prompt: input.prompt,
                                        readPath,
                                        readContent,
                                        revisionId: latestState?.revisionId,
                                    }),
                                    stream: false,
                                }).catch(() => null);
                                const forcedStructured = forcedWriteTurn?.response || null;
                                if (forcedStructured?.type === "tool_call" && forcedStructured.tool_call.name === "write_file") {
                                    injectedPlanningTool = forcedStructured;
                                    transcript.push({
                                        role: "system",
                                        content: "Repeated targeted patch failures were detected. Cutie will run a single write_file with full file content from the model.",
                                    });
                                    continue mainLoop;
                                }
                            }
                            transcript.push({
                                role: "system",
                                content: buildRetryableEditFailureInstruction({
                                    prompt: input.prompt,
                                    toolCall,
                                    toolResult,
                                    run,
                                    mentionContext,
                                    context: mergedContext,
                                    latestFileStates,
                                }),
                            });
                            await input.callbacks?.onStatusChanged?.(`Cutie is correcting a failed edit attempt (${mutationGoalRepairCount}/${maxMutationGoalRepairs}).`, run);
                            continue mainLoop;
                        }
                        if (run.goal === "code_change" &&
                            !toolResult.blocked &&
                            mutationGoalRepairCount < maxMutationGoalRepairs &&
                            isGenericMutationRepairEligible(toolCall, toolResult, run)) {
                            mutationGoalRepairCount += 1;
                            ({ session, run } = await this.updateRun(session, run, {
                                phase: "repairing",
                                status: "running",
                                repairAttemptCount: mutationGoalRepairCount,
                                escalationState: "none",
                                stuckReason: undefined,
                                suggestedNextAction: undefined,
                            }));
                            transcript.push({
                                role: "system",
                                content: buildGenericMutationFailureRepairInstruction({
                                    prompt: input.prompt,
                                    toolCall,
                                    toolResult,
                                    run,
                                    mentionContext,
                                    context: mergedContext,
                                    latestFileStates,
                                }),
                            });
                            await input.callbacks?.onStatusChanged?.(`Cutie is recovering from a failed tool call (${mutationGoalRepairCount}/${maxMutationGoalRepairs}).`, run);
                            continue mainLoop;
                        }
                        if (run.goal === "code_change") {
                            return this.enterAutonomyTerminalFailure({
                                session,
                                run,
                                reason: toolResult.error || toolResult.summary,
                                callbacks: input.callbacks,
                            });
                        }
                        const failureMessage = toolResult.blocked
                            ? `I stopped because ${toolResult.error || toolResult.summary}`
                            : `I ran into a problem with ${toolCall.name}: ${toolResult.error || toolResult.summary}`;
                        session = await this.sessionStore.appendMessage(session, {
                            role: "assistant",
                            content: failureMessage,
                            runId: run.id,
                        });
                        transcript.push({ role: "assistant", content: failureMessage });
                        await input.callbacks?.onSessionChanged?.(session);
                        ({ session, run } = await this.updateRun(session, run, {
                            status: "failed",
                            phase: "failed",
                            error: toolResult.error || toolResult.summary,
                            endedAt: (0, cutie_policy_1.nowIso)(),
                        }));
                        await input.callbacks?.onStatusChanged?.("Cutie stopped after a blocked or failed tool call.", run);
                        return { session, run };
                    }
                }
            }
        }
        catch (error) {
            const rawMessage = error instanceof Error ? error.message : String(error);
            const friendlyHttp = (0, cutie_host_http_error_1.humanizeCutieHostHttpError)(error);
            const message = String(friendlyHttp || rawMessage || "").trim() ||
                "Cutie could not get a usable planning response from the model.";
            const isCanceled = /aborted|cancelled|canceled/i.test(message);
            if (!isCanceled && run.goal === "code_change" && !run.goalSatisfied) {
                return this.enterAutonomyTerminalFailure({
                    session,
                    run,
                    reason: message,
                    callbacks: input.callbacks,
                });
            }
            session = await this.sessionStore.appendMessage(session, {
                role: "assistant",
                content: isCanceled ? "Run cancelled." : `Cutie stopped: ${message}`,
                runId: run.id,
            });
            await input.callbacks?.onSessionChanged?.(session);
            ({ session, run } = await this.updateRun(session, run, {
                status: isCanceled ? "canceled" : "failed",
                phase: isCanceled ? "canceled" : "failed",
                error: isCanceled ? undefined : message,
                endedAt: (0, cutie_policy_1.nowIso)(),
            }));
            await input.callbacks?.onStatusChanged?.(isCanceled ? "Cutie run cancelled." : "Cutie run stopped early.", run);
            return { session, run };
        }
    }
    async decomposeObjectivesTurn(input) {
        const userTask = trimToLimit(stripMentionTokens(input.prompt) || input.prompt, 4000);
        const mentioned = stableJson({
            mentionedPaths: input.mentionContext.mentionedPaths,
            mentionedWindows: input.mentionContext.mentionedWindows,
        });
        const turn = await this.modelClient
            .completeTurn({
            auth: input.auth,
            signal: input.signal,
            temperature: 0.2,
            maxTokens: 900,
            messages: [
                {
                    role: "system",
                    content: [
                        "You decompose a user task into an ordered checklist for an autonomous coding agent.",
                        "Output ONLY a single minified JSON object, no markdown, no prose:",
                        '{"type":"objectives","objectives":[{"id":"1","text":"..."},...]}',
                        "Use 3 to 12 objectives; each id is a short unique string; text is one actionable sentence; order matters.",
                        "Objectives must be concrete (e.g. read target files, implement change, verify).",
                    ].join("\n"),
                },
                { role: "user", content: `Task:\n${userTask}\n\nMentions:\n${mentioned}` },
            ],
        })
            .catch(() => ({ finalText: "" }));
        const parsed = tryParseObjectivesDecomposition(turn.finalText);
        return parsed ?? [];
    }
    async runInvestigationPreflight(input) {
        const chunks = [];
        const gitResult = await this.toolRegistry.execute({ id: (0, cutie_policy_1.randomId)("cutie_pf"), name: "git_status", arguments: {}, summary: "preflight git status" }, { signal: input.signal });
        chunks.push(gitResult.ok
            ? `git_status:\n${trimToLimit(stableJson(summarizeToolData(gitResult.data)), 3500)}`
            : `git_status: ${gitResult.error || gitResult.summary}`);
        const listResult = await this.toolRegistry.execute({
            id: (0, cutie_policy_1.randomId)("cutie_pf"),
            name: "list_files",
            arguments: { query: "", limit: 40 },
            summary: "preflight file listing",
        }, { signal: input.signal });
        chunks.push(listResult.ok
            ? `list_files:\n${trimToLimit(stableJson(summarizeToolData(listResult.data)), 3500)}`
            : `list_files: ${listResult.error || listResult.summary}`);
        return chunks.join("\n\n");
    }
    async updateRun(session, current, patch) {
        const next = {
            ...current,
            ...patch,
        };
        const nextSession = await this.sessionStore.updateRun(session, next);
        return {
            session: nextSession,
            run: next,
        };
    }
}
exports.CutieRuntime = CutieRuntime;
//# sourceMappingURL=cutie-runtime.js.map