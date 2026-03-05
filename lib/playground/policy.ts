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
  category?: "implementation" | "validation";
};

export type ExecuteMkdirAction = {
  type: "mkdir";
  path: string;
};

export type ExecuteWriteFileAction = {
  type: "write_file";
  path: string;
  content: string;
  overwrite?: boolean;
};

export type ExecuteRollbackAction = {
  type: "rollback";
  snapshotId: string;
};

export type ExecuteAction =
  | ExecuteEditAction
  | ExecuteCommandAction
  | ExecuteMkdirAction
  | ExecuteWriteFileAction
  | ExecuteRollbackAction;

function isUnsafeRelativePath(value: string): boolean {
  return (
    !value ||
    value.includes("..") ||
    value.startsWith("/") ||
    /^[a-z]:\\/i.test(value) ||
    /^[a-z]:\//i.test(value)
  );
}

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

export function validateExecuteAction(action: ExecuteAction): { ok: boolean; reason?: string } {
  if (action.type === "edit") {
    const patch = action.patch ?? action.diff ?? "";
    if (!action.path || !patch) return { ok: false, reason: "Edit action missing path and patch/diff" };
    if (isUnsafeRelativePath(action.path)) {
      return { ok: false, reason: "Absolute paths are blocked; use workspace-relative paths" };
    }
    return { ok: true };
  }

  if (action.type === "command") {
    if (!action.command.trim()) return { ok: false, reason: "Empty command" };
    if (BLOCKED_COMMAND_PATTERNS.some((pattern) => pattern.test(action.command))) {
      return { ok: false, reason: "Command blocked by safety policy" };
    }
    if (action.cwd?.includes("..") || (action.cwd && (action.cwd.startsWith("/") || /^[a-z]:\\/i.test(action.cwd)))) {
      return { ok: false, reason: "cwd must stay within workspace root" };
    }
    return { ok: true };
  }

  if (action.type === "mkdir") {
    if (isUnsafeRelativePath(action.path)) {
      return { ok: false, reason: "Absolute paths are blocked; use workspace-relative paths" };
    }
    return { ok: true };
  }

  if (action.type === "write_file") {
    if (isUnsafeRelativePath(action.path)) {
      return { ok: false, reason: "Absolute paths are blocked; use workspace-relative paths" };
    }
    if (typeof action.content !== "string") {
      return { ok: false, reason: "write_file requires string content" };
    }
    return { ok: true };
  }

  if (!action.snapshotId.trim()) {
    return { ok: false, reason: "Rollback action missing snapshotId" };
  }
  return { ok: true };
}
