"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CutieStructuredProtocolError = void 0;
exports.normalizeProtocolResponsePayload = normalizeProtocolResponsePayload;
exports.parseStructuredStreamEvent = parseStructuredStreamEvent;
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
    "patch_file",
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
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function asToolName(value) {
    const name = String(value || "").trim();
    if (!KNOWN_TOOL_NAMES.has(name)) {
        throw new CutieStructuredProtocolError(`Unknown Cutie tool "${String(value || "")}".`);
    }
    return name;
}
function normalizeObjectives(value) {
    if (!Array.isArray(value))
        return undefined;
    const rows = value
        .map((item) => {
        const record = asRecord(item);
        const id = String(record.id || "").trim();
        const status = record.status === "done" || record.status === "blocked" ? record.status : null;
        const note = String(record.note || "").trim();
        if (!id || !status)
            return null;
        return {
            id,
            status,
            ...(note ? { note } : {}),
        };
    })
        .filter((item) => Boolean(item));
    return rows.length ? rows : undefined;
}
function normalizeToolCall(value, index) {
    const record = asRecord(value);
    const args = asRecord(record.arguments);
    const summary = String(record.summary || "").trim();
    return {
        name: asToolName(record.name),
        arguments: args,
        ...(summary ? { summary } : {}),
    };
}
class CutieStructuredProtocolError extends Error {
    constructor(message) {
        super(message);
    }
}
exports.CutieStructuredProtocolError = CutieStructuredProtocolError;
function normalizeProtocolResponsePayload(payload) {
    const record = asRecord(payload);
    const nested = record.response && typeof record.response === "object" ? record.response : payload;
    const row = asRecord(nested);
    const type = String(row.type || "").trim();
    if (type === "final") {
        const text = String(row.text || row.final || "").trim();
        return {
            type: "final",
            final: text,
            ...(normalizeObjectives(row.objectives) ? { objectives: normalizeObjectives(row.objectives) } : {}),
        };
    }
    if (type === "tool_batch") {
        const toolCalls = Array.isArray(row.toolCalls) ? row.toolCalls : [];
        if (!toolCalls.length) {
            throw new CutieStructuredProtocolError("cutie_tools_v2 tool_batch payload is missing toolCalls.");
        }
        const normalized = toolCalls.map((item, index) => normalizeToolCall(item, index));
        if (normalized.length === 1) {
            return {
                type: "tool_call",
                tool_call: normalized[0],
            };
        }
        return {
            type: "tool_calls",
            tool_calls: normalized,
        };
    }
    throw new CutieStructuredProtocolError(`Unknown cutie_tools_v2 response type "${type || "missing"}".`);
}
function parseStructuredStreamEvent(event, data) {
    const normalizedEvent = String(event || "").trim();
    if (normalizedEvent === "ack" ||
        normalizedEvent === "ping" ||
        normalizedEvent === "heartbeat" ||
        normalizedEvent === "keepalive" ||
        normalizedEvent === "status" ||
        normalizedEvent === "progress") {
        return { type: "noop" };
    }
    if (normalizedEvent === "assistant_delta" || normalizedEvent === "delta") {
        const payload = asRecord(data);
        const text = String(payload.text || payload.delta || payload.content || "");
        if (!text) {
            throw new CutieStructuredProtocolError(`${normalizedEvent} is missing text.`);
        }
        return { type: "assistant_delta", text };
    }
    if (normalizedEvent === "meta") {
        const payload = asRecord(data);
        return {
            type: "meta",
            ...(payload.usage && typeof payload.usage === "object" ? { usage: payload.usage } : {}),
            ...(typeof payload.model === "string" && payload.model.trim() ? { model: payload.model.trim() } : {}),
        };
    }
    if (normalizedEvent === "final" || normalizedEvent === "tool_batch") {
        return {
            type: "response",
            response: normalizeProtocolResponsePayload({
                type: normalizedEvent,
                ...asRecord(data),
            }),
        };
    }
    if (normalizedEvent === "error") {
        const message = String(asRecord(data).message || "").trim() || "Cutie model request failed.";
        return { type: "error", message };
    }
    throw new CutieStructuredProtocolError(`Unknown SSE event "${normalizedEvent || "missing"}" in cutie_tools_v2 stream.`);
}
//# sourceMappingURL=cutie-model-protocol.js.map