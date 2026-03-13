"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractToolCommand = extractToolCommand;
exports.isSafeInspectionToolRequest = isSafeInspectionToolRequest;
exports.getAutoApprovedQwenTools = getAutoApprovedQwenTools;
const SAFE_SHELL_PREFIXES = [
    "pwd",
    "ls",
    "dir",
    "tree",
    "rg",
    "git status",
    "git diff --stat",
    "git diff -- ",
    "git branch --show-current",
    "git rev-parse --show-toplevel",
    "git ls-files",
    "get-location",
    "get-childitem",
    "get-content",
    "select-string",
    "type",
    "cat",
    "findstr",
];
const DANGEROUS_COMMAND_PATTERN = /\b(rm|del|erase|move|copy|cp|mv|touch|chmod|chown|sudo|curl|wget|invoke-webrequest|invoke-restmethod|python|node|npm|yarn|pnpm|set-content|add-content|out-file|new-item|remove-item|copy-item|move-item)\b/i;
function normalizeCommand(command) {
    return String(command || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}
function extractToolCommand(input) {
    if (typeof input.command === "string")
        return input.command;
    if (typeof input.cmd === "string")
        return input.cmd;
    if (typeof input.path === "string")
        return input.path;
    if (Array.isArray(input.args)) {
        return (input.args || []).map((item) => String(item || "")).join(" ").trim();
    }
    return "";
}
function isSafeShellSegment(segment) {
    return SAFE_SHELL_PREFIXES.some((prefix) => segment === prefix || segment.startsWith(`${prefix} `));
}
function isSafeInspectionToolRequest(toolName, input) {
    const normalizedToolName = String(toolName || "").trim().toLowerCase();
    if (normalizedToolName.startsWith("read_") ||
        normalizedToolName.includes("search") ||
        normalizedToolName.includes("grep") ||
        normalizedToolName.includes("glob") ||
        normalizedToolName.includes("list")) {
        return true;
    }
    const command = normalizeCommand(extractToolCommand(input));
    if (!command)
        return false;
    if (command.includes("&&") || command.includes("||") || /[;<>]/.test(command))
        return false;
    if (DANGEROUS_COMMAND_PATTERN.test(command))
        return false;
    const segments = command
        .split("|")
        .map((segment) => segment.trim())
        .filter(Boolean);
    if (!segments.length || segments.length > 3)
        return false;
    return segments.every(isSafeShellSegment);
}
function getAutoApprovedQwenTools() {
    return [
        "ShellTool(pwd)",
        "ShellTool(ls)",
        "ShellTool(dir)",
        "ShellTool(tree)",
        "ShellTool(rg )",
        "ShellTool(git status)",
        "ShellTool(git diff --stat)",
        "ShellTool(git diff -- )",
        "ShellTool(git branch --show-current)",
        "ShellTool(git rev-parse --show-toplevel)",
        "ShellTool(git ls-files)",
        "ShellTool(Get-Location)",
        "ShellTool(Get-ChildItem)",
        "ShellTool(Get-Content)",
        "ShellTool(Select-String)",
        "ShellTool(type )",
        "ShellTool(cat )",
        "ShellTool(findstr )",
    ];
}
//# sourceMappingURL=qwen-runtime-utils.js.map