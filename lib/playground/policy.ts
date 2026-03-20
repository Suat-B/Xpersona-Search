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

export type ExecuteDesktopOpenAppAction = {
  type: "desktop_open_app";
  app: string;
  args?: string[];
};

export type ExecuteDesktopOpenUrlAction = {
  type: "desktop_open_url";
  url: string;
};

export type ExecuteDesktopFocusWindowAction = {
  type: "desktop_focus_window";
  windowId?: string;
  title?: string;
  app?: string;
};

export type ExecuteDesktopClickAction = {
  type: "desktop_click";
  displayId: string;
  viewport: {
    displayId: string;
    width: number;
    height: number;
  };
  normalizedX: number;
  normalizedY: number;
  button?: "left" | "right" | "middle";
  clickCount?: number;
};

export type ExecuteDesktopTypeAction = {
  type: "desktop_type";
  text: string;
  delayMs?: number;
};

export type ExecuteDesktopKeypressAction = {
  type: "desktop_keypress";
  keys: string[];
};

export type ExecuteDesktopScrollAction = {
  type: "desktop_scroll";
  displayId?: string;
  viewport?: {
    displayId: string;
    width: number;
    height: number;
  };
  normalizedX?: number;
  normalizedY?: number;
  deltaX?: number;
  deltaY?: number;
};

export type ExecuteDesktopWaitAction = {
  type: "desktop_wait";
  durationMs: number;
};

export type ExecuteAction =
  | ExecuteEditAction
  | ExecuteCommandAction
  | ExecuteMkdirAction
  | ExecuteWriteFileAction
  | ExecuteRollbackAction
  | ExecuteDesktopOpenAppAction
  | ExecuteDesktopOpenUrlAction
  | ExecuteDesktopFocusWindowAction
  | ExecuteDesktopClickAction
  | ExecuteDesktopTypeAction
  | ExecuteDesktopKeypressAction
  | ExecuteDesktopScrollAction
  | ExecuteDesktopWaitAction;

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

const BLOCKED_APP_PATTERNS = [
  /\b(regedit|diskpart|format|fdisk)\b/i,
  /\b(powershell|pwsh|cmd|bash|sh)\b/i,
];

const BLOCKED_URL_PATTERNS = [
  /^file:/i,
  /^javascript:/i,
  /^data:/i,
];

function isNormalizedCoordinate(value: number | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function hasValidViewport(
  viewport: { displayId: string; width: number; height: number } | undefined,
  displayId?: string
): boolean {
  if (!viewport) return false;
  if (!viewport.displayId || viewport.width < 1 || viewport.height < 1) return false;
  if (displayId && viewport.displayId !== displayId) return false;
  return true;
}

const COMMAND_HINT_PATTERNS = [
  /^[a-z][a-z0-9._-]*/i,
  /^\s*[a-z]+-[a-z]+(?:\s|$)/i,
  /(^|\s)(--?[a-z0-9][\w-]*)(\s|$)/i,
  /[|&;<>`$]/,
  /[./\\][\w.-]/,
];

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
  "cd",
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

export function looksLikeShellCommand(input: string): boolean {
  const command = String(input || "").trim();
  if (!command) return false;
  if (/\r|\n/.test(command)) return false;

  const tokens = command.split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;

  const first = tokens[0].toLowerCase();
  if (COMMON_COMMAND_PREFIXES.has(first)) return true;
  if (/^[a-z]+-[a-z]+$/i.test(first)) return true;
  if (COMMAND_HINT_PATTERNS.some((pattern) => pattern.test(command))) {
    if (tokens.length <= 10) return true;
  }

  const likelyProse =
    tokens.length >= 6 &&
    /\b(you|your|please|where|should|could|would|want|then|open|create)\b/i.test(command) &&
    !/[|&;<>`$]/.test(command) &&
    !/(^|\s)(--?[a-z0-9][\w-]*)(\s|$)/i.test(command);
  if (likelyProse) return false;

  return tokens.length <= 5;
}

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
    if (!looksLikeShellCommand(action.command)) {
      return { ok: false, reason: "Command rejected: does not look like a runnable shell command" };
    }
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

  if (action.type === "rollback") {
    if (!action.snapshotId.trim()) {
      return { ok: false, reason: "Rollback action missing snapshotId" };
    }
    return { ok: true };
  }

  if (action.type === "desktop_open_app") {
    if (!action.app.trim()) return { ok: false, reason: "desktop_open_app requires an app name" };
    if (BLOCKED_APP_PATTERNS.some((pattern) => pattern.test(action.app))) {
      return { ok: false, reason: "desktop_open_app blocked by safety policy" };
    }
    return { ok: true };
  }

  if (action.type === "desktop_open_url") {
    if (!action.url.trim()) return { ok: false, reason: "desktop_open_url requires a URL" };
    if (BLOCKED_URL_PATTERNS.some((pattern) => pattern.test(action.url))) {
      return { ok: false, reason: "desktop_open_url blocked by safety policy" };
    }
    try {
      const parsed = new URL(action.url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return { ok: false, reason: "desktop_open_url only allows http(s) URLs" };
      }
    } catch {
      return { ok: false, reason: "desktop_open_url requires a valid URL" };
    }
    return { ok: true };
  }

  if (action.type === "desktop_focus_window") {
    if (!action.windowId?.trim() && !action.title?.trim() && !action.app?.trim()) {
      return { ok: false, reason: "desktop_focus_window requires a windowId, title, or app" };
    }
    return { ok: true };
  }

  if (action.type === "desktop_click") {
    if (!action.displayId.trim()) return { ok: false, reason: "desktop_click requires displayId" };
    if (!hasValidViewport(action.viewport, action.displayId)) {
      return { ok: false, reason: "desktop_click requires matching display viewport metadata" };
    }
    if (!isNormalizedCoordinate(action.normalizedX) || !isNormalizedCoordinate(action.normalizedY)) {
      return { ok: false, reason: "desktop_click requires normalizedX/Y between 0 and 1" };
    }
    return { ok: true };
  }

  if (action.type === "desktop_type") {
    if (!action.text.trim()) return { ok: false, reason: "desktop_type requires text" };
    return { ok: true };
  }

  if (action.type === "desktop_keypress") {
    if (!Array.isArray(action.keys) || action.keys.length === 0) {
      return { ok: false, reason: "desktop_keypress requires at least one key" };
    }
    return { ok: true };
  }

  if (action.type === "desktop_scroll") {
    if (
      action.viewport &&
      !hasValidViewport(action.viewport, action.displayId || action.viewport.displayId)
    ) {
      return { ok: false, reason: "desktop_scroll viewport metadata is invalid" };
    }
    const hasPointerTarget =
      isNormalizedCoordinate(action.normalizedX) && isNormalizedCoordinate(action.normalizedY);
    const hasDelta = typeof action.deltaX === "number" || typeof action.deltaY === "number";
    if (!hasPointerTarget && !hasDelta) {
      return { ok: false, reason: "desktop_scroll requires coordinates or delta values" };
    }
    return { ok: true };
  }

  if (action.type === "desktop_wait") {
    if (action.durationMs < 0 || action.durationMs > 120_000) {
      return { ok: false, reason: "desktop_wait durationMs must be between 0 and 120000" };
    }
    return { ok: true };
  }

  return { ok: false, reason: "Unknown execute action" };
}
