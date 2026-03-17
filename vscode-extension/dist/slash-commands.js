"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSlashCommand = parseSlashCommand;
exports.buildSlashCommandHelpMessage = buildSlashCommandHelpMessage;
exports.describeRuntimePhase = describeRuntimePhase;
exports.buildSlashStatusMessage = buildSlashStatusMessage;
function normalizeCommandText(text) {
    return String(text || "")
        .replace(/\s+/g, " ")
        .trim();
}
function parseSlashCommand(text) {
    const normalized = normalizeCommandText(text);
    if (!normalized.startsWith("/"))
        return null;
    const lower = normalized.toLowerCase();
    if (lower === "/help")
        return { kind: "help" };
    if (lower === "/new")
        return { kind: "new" };
    if (lower === "/plan")
        return { kind: "plan" };
    if (lower === "/auto")
        return { kind: "auto" };
    if (lower === "/key")
        return { kind: "key" };
    if (lower === "/signin")
        return { kind: "signin" };
    if (lower === "/signout")
        return { kind: "signout" };
    if (lower === "/undo")
        return { kind: "undo" };
    if (lower === "/status")
        return { kind: "status" };
    if (lower === "/runtime qwen")
        return { kind: "runtime", runtime: "qwenCode" };
    if (lower === "/runtime cloud")
        return { kind: "runtime", runtime: "playgroundApi" };
    return { kind: "unknown", raw: normalized };
}
function buildSlashCommandHelpMessage(prefix) {
    const lines = [
        prefix || "Slash commands:",
        "- /help",
        "- /new",
        "- /plan",
        "- /auto",
        "- /runtime qwen",
        "- /runtime cloud",
        "- /key",
        "- /signin",
        "- /signout",
        "- /undo",
        "- /status",
    ];
    return lines.join("\n");
}
function describeRuntimePhase(phase) {
    switch (phase) {
        case "radar":
            return "Draft ready";
        case "clarify":
            return "Needs clarification";
        case "collecting_context":
            return "Collecting context";
        case "waiting_for_qwen":
            return "Waiting for Qwen";
        case "awaiting_approval":
            return "Awaiting tool approval";
        case "applying_result":
            return "Applying result";
        case "saving_session":
            return "Saving session";
        case "done":
            return "Done";
        case "failed":
            return "Failed";
        default:
            return "Ready";
    }
}
function buildSlashStatusMessage(input) {
    const sessionLabel = input.sessionId?.trim() || "New chat";
    const lines = [
        "Binary IDE status:",
        `- Runtime: ${input.runtime === "qwenCode" ? "Qwen Code" : "Binary IDE API"}`,
        `- Mode: ${input.mode === "plan" ? "Plan" : input.mode === "yolo" ? "Yolo" : "Auto"}`,
        `- Auth: ${input.authLabel}`,
        `- Phase: ${describeRuntimePhase(input.runtimePhase)}`,
        `- Session: ${sessionLabel}`,
        input.attachedFiles?.length ? `- Attached files: ${input.attachedFiles.join(", ")}` : "",
        input.attachedSelectionPath ? `- Attached selection: ${input.attachedSelectionPath}` : "",
    ].filter(Boolean);
    return lines.join("\n");
}
//# sourceMappingURL=slash-commands.js.map