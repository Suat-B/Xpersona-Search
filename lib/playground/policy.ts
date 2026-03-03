export type ExecuteEditAction = {
  type: "edit";
  path: string;
  patch?: string;
  diff?: string;
};

export type ExecuteCommandAction = {
  type: "command";
  command: string;
  cwd?: string;
  timeoutMs?: number;
};

export type ExecuteRollbackAction = {
  type: "rollback";
  snapshotId: string;
};

export type ExecuteAction = ExecuteEditAction | ExecuteCommandAction | ExecuteRollbackAction;

const BLOCKED_COMMAND_PATTERNS = [
  /\brm\s+-rf\b/i,
  /\bdel\s+\/f\b/i,
  /\bformat\s+[a-z]:\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+checkout\s+--\b/i,
  /\bcurl\b.*\|\s*(bash|sh|powershell|pwsh)\b/i,
  /\bwget\b.*\|\s*(bash|sh|powershell|pwsh)\b/i,
  /\bsetx?\s+.*(api[_-]?key|token|secret)\b/i,
];

const ALLOWED_COMMAND_PATTERNS = [
  /^(npm|pnpm|yarn)\s+(run\s+)?(build|test|lint|typecheck)\b/i,
  /^npx\s+vitest\b/i,
  /^node\s+.+/i,
  /^tsc\b/i,
  /^pytest\b/i,
  /^go\s+test\b/i,
  /^cargo\s+test\b/i,
];

export function validateExecuteAction(action: ExecuteAction): { ok: boolean; reason?: string } {
  if (action.type === "edit") {
    const patch = action.patch ?? action.diff ?? "";
    if (!action.path || !patch) return { ok: false, reason: "Edit action missing path and patch/diff" };
    if (action.path.includes("..")) return { ok: false, reason: "Path traversal is blocked" };
    if (action.path.startsWith("/") || /^[a-z]:\\/i.test(action.path)) {
      return { ok: false, reason: "Absolute paths are blocked; use workspace-relative paths" };
    }
    return { ok: true };
  }

  if (action.type === "command") {
    if (!action.command.trim()) return { ok: false, reason: "Empty command" };
    if (BLOCKED_COMMAND_PATTERNS.some((pattern) => pattern.test(action.command))) {
      return { ok: false, reason: "Command blocked by safety policy" };
    }
    if (!ALLOWED_COMMAND_PATTERNS.some((pattern) => pattern.test(action.command))) {
      return { ok: false, reason: "Command not in allowlist" };
    }
    if (action.cwd?.includes("..") || (action.cwd && (action.cwd.startsWith("/") || /^[a-z]:\\/i.test(action.cwd)))) {
      return { ok: false, reason: "cwd must stay within workspace root" };
    }
    return { ok: true };
  }

  if (!action.snapshotId.trim()) {
    return { ok: false, reason: "Rollback action missing snapshotId" };
  }
  return { ok: true };
}

