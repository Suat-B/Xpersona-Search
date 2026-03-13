import type { ToolInput } from "@qwen-code/sdk";

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
  "git grep",
  "get-location",
  "get-childitem",
  "get-content",
  "select-string",
  "type",
  "cat",
  "findstr",
];

const DANGEROUS_COMMAND_PATTERN =
  /\b(rm|del|erase|move|copy|cp|mv|touch|chmod|chown|sudo|curl|wget|invoke-webrequest|invoke-restmethod|python|node|npm|yarn|pnpm|set-content|add-content|out-file|new-item|remove-item|copy-item|move-item)\b/i;

function normalizeCommand(command: string): string {
  return String(command || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function basename(value: string): string {
  const normalized = String(value || "").replace(/\\/g, "/");
  return normalized.split("/").pop() || normalized;
}

export function extractToolCommand(input: ToolInput): string {
  if (typeof input.command === "string") return input.command;
  if (typeof input.cmd === "string") return input.cmd;
  if (typeof input.path === "string") return input.path;
  if (Array.isArray((input as { args?: unknown[] }).args)) {
    return ((input as { args?: unknown[] }).args || []).map((item) => String(item || "")).join(" ").trim();
  }
  return "";
}

function isSafeShellSegment(segment: string): boolean {
  return SAFE_SHELL_PREFIXES.some((prefix) => segment === prefix || segment.startsWith(`${prefix} `));
}

export function isMutationToolName(toolName: string): boolean {
  return /\b(edit|write|mkdir|delete|remove|rename|run_terminal_cmd|shelltool)\b/i.test(toolName);
}

export function isSafeInspectionToolRequest(toolName: string, input: ToolInput): boolean {
  const normalizedToolName = String(toolName || "").trim().toLowerCase();
  if (
    normalizedToolName.startsWith("read_") ||
    normalizedToolName.includes("search") ||
    normalizedToolName.includes("grep") ||
    normalizedToolName.includes("glob") ||
    normalizedToolName.includes("list")
  ) {
    return true;
  }

  const command = normalizeCommand(extractToolCommand(input));
  if (!command) return false;
  if (command.includes("&&") || command.includes("||") || /[;<>]/.test(command)) return false;
  if (DANGEROUS_COMMAND_PATTERN.test(command)) return false;

  const segments = command
    .split("|")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (!segments.length || segments.length > 3) return false;

  return segments.every(isSafeShellSegment);
}

export function getAutoApprovedQwenTools(): string[] {
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
    "ShellTool(git grep )",
    "ShellTool(Get-Location)",
    "ShellTool(Get-ChildItem)",
    "ShellTool(Get-Content)",
    "ShellTool(Select-String)",
    "ShellTool(type )",
    "ShellTool(cat )",
    "ShellTool(findstr )",
  ];
}

export function describeToolActivity(toolName: string, input: ToolInput): string {
  const normalizedToolName = String(toolName || "").trim().toLowerCase();
  const command = extractToolCommand(input);

  if (normalizedToolName.includes("read")) {
    return `Reading ${basename(typeof input.path === "string" ? input.path : command)}`;
  }
  if (normalizedToolName.includes("search") || normalizedToolName.includes("grep")) {
    return "Searching symbol";
  }
  if (normalizedToolName.includes("list") || normalizedToolName.includes("glob")) {
    return "Scanning files";
  }
  if (normalizedToolName.includes("edit") || normalizedToolName.includes("write")) {
    return "Applying result";
  }
  if (normalizedToolName.includes("plan")) {
    return "Planning edit";
  }

  const normalizedCommand = normalizeCommand(command);
  if (normalizedCommand.startsWith("rg")) return "Searching symbol";
  if (
    normalizedCommand.startsWith("ls") ||
    normalizedCommand.startsWith("dir") ||
    normalizedCommand.startsWith("tree") ||
    normalizedCommand.startsWith("get-childitem")
  ) {
    return "Scanning files";
  }
  if (
    normalizedCommand.startsWith("cat") ||
    normalizedCommand.startsWith("type ") ||
    normalizedCommand.startsWith("get-content")
  ) {
    return `Reading ${basename(command)}`;
  }
  if (normalizedCommand.startsWith("git diff")) return "Reviewing diff";
  if (normalizedCommand.startsWith("git status")) return "Checking git status";

  return command ? `Qwen tool: ${toolName} ${command}` : `Qwen tool: ${toolName}`;
}
