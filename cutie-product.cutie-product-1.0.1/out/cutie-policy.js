"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CUTIE_CONTEXT_RECEIPT_WINDOW = exports.CUTIE_MAX_TOOLS_PER_BATCH = exports.CUTIE_MAX_IDENTICAL_CALLS = exports.CUTIE_MAX_WALL_CLOCK_MS = exports.CUTIE_MAX_DESKTOP_MUTATIONS = exports.CUTIE_MAX_WORKSPACE_MUTATIONS = exports.CUTIE_MAX_STEPS = void 0;
exports.nowIso = nowIso;
exports.randomId = randomId;
exports.normalizeWorkspaceRelativePath = normalizeWorkspaceRelativePath;
exports.isWorkspaceMutationTool = isWorkspaceMutationTool;
exports.isDesktopMutationTool = isDesktopMutationTool;
exports.isCutieBatchMutationTool = isCutieBatchMutationTool;
exports.buildToolCallKey = buildToolCallKey;
exports.looksLikeShellCommand = looksLikeShellCommand;
exports.validateShellCommand = validateShellCommand;
exports.validateDesktopApp = validateDesktopApp;
exports.validateWindowTarget = validateWindowTarget;
exports.CUTIE_MAX_STEPS = 18;
exports.CUTIE_MAX_WORKSPACE_MUTATIONS = 8;
exports.CUTIE_MAX_DESKTOP_MUTATIONS = 20;
exports.CUTIE_MAX_WALL_CLOCK_MS = 10 * 60 * 1000;
exports.CUTIE_MAX_IDENTICAL_CALLS = 2;
/** Max tool calls executed from one model response (observe batch + optional single mutation at end). */
exports.CUTIE_MAX_TOOLS_PER_BATCH = 4;
/** How many recent tool receipts to include in live context JSON. */
exports.CUTIE_CONTEXT_RECEIPT_WINDOW = 14;
const BLOCKED_COMMAND_PATTERNS = [
    /\brm\s+-rf\b/i,
    /\bdel\s+\/f\b/i,
    /\bformat\s+[a-z]:\b/i,
    /\bgit\s+reset\s+--hard\b/i,
    /\bgit\s+checkout\s+--\b/i,
    /\bsudo\b/i,
    /\brunas\b/i,
    /\bstart-process\b.*-verb\s+runas\b/i,
    /\bpowershell\b.*-encodedcommand\b/i,
    /\bnet\s+user\b/i,
    /\bcurl\b.*\|\s*(bash|sh|powershell|pwsh)\b/i,
    /\bwget\b.*\|\s*(bash|sh|powershell|pwsh)\b/i,
    /\bsetx?\s+.*(api[_-]?key|token|secret)\b/i,
    /\b(export|set|env)\s+.*(api[_-]?key|token|secret|password)\b/i,
];
const BLOCKED_DESKTOP_APP_PATTERNS = [/\b(regedit|diskpart|format|fdisk|sudo|runas|credential|keychain)\b/i];
const BLOCKED_WINDOW_PATTERNS = [/\b(password|passcode|credential|sign in|log in|administrator|admin approval|uac)\b/i];
const COMMON_COMMAND_PREFIXES = new Set([
    "npm",
    "pnpm",
    "yarn",
    "npx",
    "node",
    "python",
    "pytest",
    "pip",
    "uv",
    "poetry",
    "git",
    "ls",
    "cat",
    "echo",
    "mkdir",
    "touch",
    "cp",
    "mv",
    "rm",
    "powershell",
    "pwsh",
    "cmd",
    "bash",
    "sh",
    "code",
    "make",
    "cargo",
    "go",
    "java",
    "mvn",
    "gradle",
    "docker",
    "kubectl",
    "terraform",
]);
function nowIso() {
    return new Date().toISOString();
}
function randomId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function normalizeWorkspaceRelativePath(input) {
    const normalized = String(input || "")
        .trim()
        .replace(/\\/g, "/")
        .replace(/^@+/, "")
        .replace(/^\.\/+/, "")
        .replace(/^\/+/, "");
    if (!normalized || normalized.includes("..") || /^[a-z]:\//i.test(normalized))
        return null;
    return normalized;
}
function isWorkspaceMutationTool(name) {
    return name === "patch_file" || name === "write_file" || name === "mkdir" || name === "run_command";
}
function isDesktopMutationTool(name) {
    return (name === "desktop_open_app" ||
        name === "desktop_open_url" ||
        name === "desktop_focus_window" ||
        name === "desktop_click" ||
        name === "desktop_type" ||
        name === "desktop_keypress" ||
        name === "desktop_scroll" ||
        name === "desktop_wait");
}
/** Tools that count as a “mutation” for batch ordering (at most one per batch, must be last). */
function isCutieBatchMutationTool(name) {
    return isWorkspaceMutationTool(name) || isDesktopMutationTool(name) || name === "create_checkpoint";
}
function buildToolCallKey(toolCall) {
    return JSON.stringify({
        name: toolCall.name,
        arguments: toolCall.arguments,
    });
}
function looksLikeShellCommand(input) {
    const command = String(input || "").trim();
    if (!command || /\r|\n/.test(command))
        return false;
    const tokens = command.split(/\s+/).filter(Boolean);
    if (!tokens.length)
        return false;
    const first = tokens[0].toLowerCase();
    if (COMMON_COMMAND_PREFIXES.has(first))
        return true;
    if (/^[a-z]+-[a-z]+$/i.test(first))
        return true;
    return tokens.length <= 8;
}
function validateShellCommand(command) {
    if (!command.trim())
        return { ok: false, reason: "Command cannot be empty." };
    if (!looksLikeShellCommand(command)) {
        return { ok: false, reason: "Command does not look like a runnable shell command." };
    }
    if (BLOCKED_COMMAND_PATTERNS.some((pattern) => pattern.test(command))) {
        return { ok: false, reason: "Command blocked by Cutie safety policy." };
    }
    return { ok: true };
}
function validateDesktopApp(app) {
    if (!app.trim())
        return { ok: false, reason: "Desktop app cannot be empty." };
    if (BLOCKED_DESKTOP_APP_PATTERNS.some((pattern) => pattern.test(app))) {
        return { ok: false, reason: "Desktop app launch blocked by Cutie safety policy." };
    }
    return { ok: true };
}
function validateWindowTarget(value) {
    const target = String(value || "").trim();
    if (!target)
        return { ok: true };
    if (BLOCKED_WINDOW_PATTERNS.some((pattern) => pattern.test(target))) {
        return { ok: false, reason: "Window target blocked by Cutie safety policy." };
    }
    return { ok: true };
}
//# sourceMappingURL=cutie-policy.js.map