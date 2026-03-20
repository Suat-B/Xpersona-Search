import type { CutieToolCall, CutieToolName } from "./types";

export const CUTIE_MAX_STEPS = 15;
export const CUTIE_MAX_WORKSPACE_MUTATIONS = 8;
export const CUTIE_MAX_DESKTOP_MUTATIONS = 20;
export const CUTIE_MAX_WALL_CLOCK_MS = 10 * 60 * 1000;
export const CUTIE_MAX_IDENTICAL_CALLS = 2;

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

export function nowIso(): string {
  return new Date().toISOString();
}

export function randomId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeWorkspaceRelativePath(input: string | null | undefined): string | null {
  const normalized = String(input || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^@+/, "")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || /^[a-z]:\//i.test(normalized)) return null;
  return normalized;
}

export function isWorkspaceMutationTool(name: CutieToolName): boolean {
  return name === "edit_file" || name === "write_file" || name === "mkdir" || name === "run_command";
}

export function isDesktopMutationTool(name: CutieToolName): boolean {
  return (
    name === "desktop_open_app" ||
    name === "desktop_open_url" ||
    name === "desktop_focus_window" ||
    name === "desktop_click" ||
    name === "desktop_type" ||
    name === "desktop_keypress" ||
    name === "desktop_scroll" ||
    name === "desktop_wait"
  );
}

export function buildToolCallKey(toolCall: CutieToolCall): string {
  return JSON.stringify({
    name: toolCall.name,
    arguments: toolCall.arguments,
  });
}

export function looksLikeShellCommand(input: string): boolean {
  const command = String(input || "").trim();
  if (!command || /\r|\n/.test(command)) return false;
  const tokens = command.split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;
  const first = tokens[0].toLowerCase();
  if (COMMON_COMMAND_PREFIXES.has(first)) return true;
  if (/^[a-z]+-[a-z]+$/i.test(first)) return true;
  return tokens.length <= 8;
}

export function validateShellCommand(command: string): { ok: boolean; reason?: string } {
  if (!command.trim()) return { ok: false, reason: "Command cannot be empty." };
  if (!looksLikeShellCommand(command)) {
    return { ok: false, reason: "Command does not look like a runnable shell command." };
  }
  if (BLOCKED_COMMAND_PATTERNS.some((pattern) => pattern.test(command))) {
    return { ok: false, reason: "Command blocked by Cutie safety policy." };
  }
  return { ok: true };
}

export function validateDesktopApp(app: string): { ok: boolean; reason?: string } {
  if (!app.trim()) return { ok: false, reason: "Desktop app cannot be empty." };
  if (BLOCKED_DESKTOP_APP_PATTERNS.some((pattern) => pattern.test(app))) {
    return { ok: false, reason: "Desktop app launch blocked by Cutie safety policy." };
  }
  return { ok: true };
}

export function validateWindowTarget(value: string): { ok: boolean; reason?: string } {
  const target = String(value || "").trim();
  if (!target) return { ok: true };
  if (BLOCKED_WINDOW_PATTERNS.some((pattern) => pattern.test(target))) {
    return { ok: false, reason: "Window target blocked by Cutie safety policy." };
  }
  return { ok: true };
}
