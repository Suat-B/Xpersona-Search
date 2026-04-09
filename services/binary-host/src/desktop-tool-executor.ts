import { exec } from "node:child_process";
import os from "node:os";
import process from "node:process";
import { promisify } from "node:util";
import {
  MachineAutonomyController,
  type MachineAutonomyPolicy,
} from "./machine-autonomy.js";
import { AutonomyExecutionController } from "./autonomy-execution-controller.js";
import {
  NativeAppRuntime,
  type NativeAppControlSelector,
} from "./native-app-runtime.js";
import {
  isDangerousNativeAction,
  matchNativeAppAdapter,
} from "./native-app-adapters.js";

const execAsync = promisify(exec);

type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

type PendingToolCall = {
  step: number;
  adapter: string;
  requiresClientExecution: boolean;
  toolCall: ToolCall;
  availableTools?: string[];
  createdAt: string;
};

type ToolResult = {
  toolCallId: string;
  name: string;
  ok: boolean;
  blocked?: boolean;
  summary: string;
  data?: Record<string, unknown>;
  error?: string;
  createdAt?: string;
};

type DesktopWindowSummary = {
  id: string;
  title: string;
  app: string;
};

type DesktopExecutorDependencies = {
  listWindows: () => Promise<DesktopWindowSummary[]>;
  getActiveWindow: () => Promise<DesktopWindowSummary | null>;
  focusWindow: (input: { windowId?: string; title?: string; app?: string }) => Promise<string>;
};

export type DesktopCleanupSummary = {
  attempted: number;
  closed: number;
  failed: Array<{ pid: number; error: string }>;
  skipped: boolean;
  skippedPreExistingCount: number;
  cleanupErrors: number;
};

type DesktopAppSessionRecord = {
  appIntent: string;
  appName: string;
  windowId?: string;
  windowTitle?: string;
  processId?: number;
  preExisting: boolean;
  runLaunched: boolean;
  lastProofAt?: string;
  openAttempts: number;
  relaunchAttempts: number;
};

type ForegroundLeaseContext = {
  previousWindowId?: string;
  previousWindowTitle?: string;
  previousWindowApp?: string;
  startedAt: number;
};

type DesktopIntentKind = "open" | "draft_text" | "compute" | "navigate_path" | "verify" | "cleanup";
type DesktopExecutionMode = "background_safe" | "foreground_lease" | "takeover";

type DesktopIntentMetadataOptions = {
  intentStepId?: string;
  intentKind?: DesktopIntentKind;
  executionMode?: DesktopExecutionMode;
  windowAffinityToken?: string;
  targetResolvedApp?: string;
  targetConfidence?: number;
  focusRecoveryAttempted?: boolean;
  focusLeaseRestored?: boolean;
  verificationRequired?: boolean;
  verificationPassed?: boolean;
  proofProgress?: number;
  recoverySuppressedReason?: string;
  relaunchAttempt?: number;
  relaunchSuppressed?: boolean;
  relaunchSuppressionReason?: string;
  focusModeApplied?: "background_safe" | "foreground_lease";
  foregroundLeaseMs?: number;
  proofArtifacts?: string[];
};

type DesktopFocusGuardResult = {
  ok: boolean;
  message?: string;
  targetAppIntent?: string;
  targetResolvedApp?: string;
  targetWindowId?: string;
  targetWindowTitle?: string;
  focusRecoveryAttempted: boolean;
  focusStolen: boolean;
  backgroundTargetBound?: boolean;
  focusModeApplied?: "background_safe" | "foreground_lease";
  foregroundLease?: ForegroundLeaseContext;
  recoverySuppressedReason?: string;
  relaunchAttempt?: number;
  relaunchSuppressed?: boolean;
  relaunchSuppressionReason?: string;
};

const RECOVERY_LAUNCH_COOLDOWN_MS = 15_000;
const RECOVERY_LAUNCH_MAX_PER_APP = 2;
const RECOVERY_LAUNCH_MAX_PER_RUN = 4;
const FOREGROUND_LEASE_MAX_MS = 1_200;
const FOREGROUND_LEASE_RESTORE_TIMEOUT_MS = 450;
const FOREGROUND_LEASE_RESTORE_ATTEMPTS = 1;
const APP_LAUNCH_WINDOW_DETECT_ATTEMPTS = 10;
const APP_LAUNCH_WINDOW_DETECT_DELAY_MS = 160;
const BACKGROUND_RECOVERY_WINDOW_POLL_ATTEMPTS = 14;
const BACKGROUND_RECOVERY_WINDOW_POLL_DELAY_MS = 120;
const FOREGROUND_RECOVERY_SETTLE_ATTEMPTS = 12;
const FOREGROUND_RECOVERY_SETTLE_DELAY_MS = 160;
const WINDOWS_SENDKEYS_SETTLE_MS = 80;
const CALCULATOR_CONTROL_STEP_DELAY_MS = 24;
const CALCULATOR_CONTROL_INVOKE_TIMEOUT_MS = 2_200;
const CALCULATOR_READBACK_TIMEOUT_MS = 2_200;
const CALCULATOR_SHORTCUT_TIMEOUT_MS = 3_200;

function nowIso(): string {
  return new Date().toISOString();
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function fail(toolCall: ToolCall, summary: string, blocked = false): ToolResult {
  return {
    toolCallId: toolCall.id,
    name: toolCall.name,
    ok: false,
    blocked,
    summary,
    error: summary,
    createdAt: nowIso(),
  };
}

function failWithData(
  toolCall: ToolCall,
  summary: string,
  data: Record<string, unknown>,
  blocked = false
): ToolResult {
  return {
    ...fail(toolCall, summary, blocked),
    ...(Object.keys(data).length > 0 ? { data } : {}),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asSelector(value: unknown): NativeAppControlSelector | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  return {
    automationId: typeof record.automationId === "string" ? record.automationId : undefined,
    name: typeof record.name === "string" ? record.name : undefined,
    text: typeof record.text === "string" ? record.text : undefined,
    controlType: typeof record.controlType === "string" ? record.controlType : undefined,
    className: typeof record.className === "string" ? record.className : undefined,
    index: typeof record.index === "number" ? record.index : undefined,
  };
}

function isNativeRuntime(value: unknown): value is NativeAppRuntime {
  return Boolean(
    value &&
      typeof value === "object" &&
      "getStatus" in value &&
      typeof (value as NativeAppRuntime).getStatus === "function"
  );
}

function explicitUserAuthorization(task: string | undefined, actionLabel: string): boolean {
  const normalizedTask = String(task || "").toLowerCase();
  const normalizedAction = String(actionLabel || "").toLowerCase();
  if (!normalizedTask || !normalizedAction) return false;
  if (normalizedAction.includes("send")) {
    return /\b(send|message|tell|reply|email|dm|post)\b/.test(normalizedTask);
  }
  if (normalizedAction.includes("submit")) {
    return /\bsubmit|apply|confirm\b/.test(normalizedTask);
  }
  if (normalizedAction.includes("delete") || normalizedAction.includes("remove")) {
    return /\bdelete|remove\b/.test(normalizedTask);
  }
  if (normalizedAction.includes("purchase") || normalizedAction.includes("buy") || normalizedAction.includes("checkout")) {
    return /\b(buy|purchase|checkout|order)\b/.test(normalizedTask);
  }
  if (normalizedAction.includes("share")) {
    return /\bshare|post|publish\b/.test(normalizedTask);
  }
  return false;
}

async function runPlatformCommand(command: string): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execAsync(command, {
    windowsHide: true,
    maxBuffer: 2_000_000,
    shell: process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : undefined,
  });
  return {
    stdout: String(stdout || ""),
    stderr: String(stderr || ""),
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, Math.floor(ms))));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race<T>([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), Math.max(1, Math.floor(timeoutMs)));
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function escapePowerShellSingleQuoted(value: string): string {
  return String(value || "").replace(/'/g, "''");
}

function normalizeWindowsFilesystemTarget(input: string): string | null {
  const raw = String(input || "").trim();
  if (!raw) return null;
  const normalized = raw.replace(/\//g, "\\");

  const bareDrive = normalized.match(/^([a-z]):?$/i);
  if (bareDrive?.[1]) return `${bareDrive[1].toUpperCase()}:\\`;

  const spokenDrive = normalized.match(/\b(?:drive\s+([a-z])|([a-z])\s+drive)\b/i);
  if (spokenDrive?.[1] || spokenDrive?.[2]) {
    const letter = String(spokenDrive[1] || spokenDrive[2]).toUpperCase();
    return `${letter}:\\`;
  }

  if (/^[a-z]:$/i.test(normalized)) {
    return `${normalized.toUpperCase()}\\`;
  }
  if (/^[a-z]:\\?/i.test(normalized)) {
    return normalized.length === 2 ? `${normalized.toUpperCase()}\\` : normalized;
  }
  if (/^\\\\[^\\]+\\[^\\]+/.test(normalized)) return normalized;

  return null;
}

async function openWindowsFilesystemTarget(targetPath: string): Promise<{ command: string; normalizedPath: string }> {
  const normalizedPath = normalizeWindowsFilesystemTarget(targetPath);
  if (!normalizedPath) {
    throw new Error(`Binary Host could not interpret "${targetPath}" as a Windows drive or filesystem path.`);
  }
  const psPath = escapePowerShellSingleQuoted(normalizedPath);
  const command = `powershell -NoProfile -Command "Start-Process -FilePath 'explorer.exe' -ArgumentList @('${psPath}')"`;
  await runPlatformCommand(command);
  return { command, normalizedPath };
}

function parseProcessId(value: unknown): number | null {
  const numeric = Number(String(value || "").trim());
  if (!Number.isFinite(numeric)) return null;
  if (numeric <= 0) return null;
  if (!Number.isInteger(numeric)) return null;
  return numeric;
}

function sanitizeNativeWindowId(value: unknown): string | undefined {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  if (/^\d+$/.test(raw)) {
    const numeric = Number.parseInt(raw, 10);
    if (Number.isFinite(numeric) && numeric > 0 && numeric < 200_000) {
      // Host window ids are usually process ids in this range; don't forward them as UIA handles.
      return undefined;
    }
  }
  return raw;
}

function isExplorerQuery(value: string): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "explorer" || normalized === "file explorer" || normalized === "windows explorer";
}

function normalizeAppToken(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function canonicalizeAppIntent(value: unknown): string | undefined {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized.includes("calc") || normalized.includes("calculator")) return "Calculator";
  if (normalized.includes("file explorer") || normalized.includes("explorer")) return "File Explorer";
  if (normalized.includes("notepad")) return "Notepad";
  if (normalized.includes("discord")) return "Discord";
  if (normalized.includes("slack")) return "Slack";
  if (normalized.includes("outlook") || normalized === "mail") return "Outlook";
  return String(value || "").trim();
}

function windowMatchesAppIntent(activeWindow: DesktopWindowSummary | null, targetAppIntent: string): boolean {
  if (!activeWindow) return false;
  const intent = normalizeAppToken(targetAppIntent);
  if (!intent) return false;
  const app = normalizeAppToken(activeWindow.app);
  const title = normalizeAppToken(activeWindow.title);
  if (!app && !title) return false;
  if (intent === "calculator") {
    if (app.includes("calc") || app.includes("calculator")) return true;
    if (app === "applicationframehost" && title.includes("calculator")) return true;
    return title.includes("calculator");
  }
  if (intent === "fileexplorer") {
    return app.includes("explorer") || title.includes("fileexplorer") || title.includes("windows explorer");
  }
  if (intent === "notepad") {
    return app.includes("notepad") || title.includes("notepad");
  }
  if (intent === "discord") {
    return app.includes("discord") || title.includes("discord");
  }
  if (intent === "slack") {
    return app.includes("slack") || title.includes("slack");
  }
  if (intent === "outlook") {
    return app.includes("outlook") || title.includes("outlook") || title.includes("mail");
  }
  return app.includes(intent) || title.includes(intent);
}

function isWindowResolutionError(error: unknown): boolean {
  const message = String(error instanceof Error ? error.message : error || "").toLowerCase();
  return (
    message.includes("no native app window matched") ||
    message.includes("window not found") ||
    message.includes("window not available")
  );
}

function inferExpectedCalculatorResultFromTask(task: string | undefined): string | null {
  const normalized = String(task || "").toLowerCase();
  if (!normalized) return null;
  const canonical = normalized
    .replace(/\bdivided by\b/g, "/")
    .replace(/\bover\b/g, "/")
    .replace(/\bmultiplied by\b/g, "*")
    .replace(/\btimes\b/g, "*")
    .replace(/\bx\b/g, "*")
    .replace(/\bplus\b/g, "+")
    .replace(/\bminus\b/g, "-")
    .replace(/\bthen\b/g, " ")
    .replace(/[^0-9+\-*/.\s]/g, " ");
  const expressionMatch = canonical.match(/-?\d+(?:\.\d+)?(?:\s*[+\-*/]\s*-?\d+(?:\.\d+)?)+/);
  if (!expressionMatch?.[0]) return null;
  return evaluateArithmeticExpression(expressionMatch[0]);
}

function evaluateArithmeticExpression(expression: string): string | null {
  const compact = String(expression || "").replace(/\s+/g, "");
  if (!compact) return null;
  if (!/^-?\d+(?:\.\d+)?(?:[+\-*/]-?\d+(?:\.\d+)?)+$/.test(compact)) return null;
  const numbers: number[] = [];
  const operators: string[] = [];
  let cursor = 0;
  while (cursor < compact.length) {
    let sign = 1;
    if (
      (compact[cursor] === "+" || compact[cursor] === "-") &&
      (cursor === 0 || /[+\-*/]/.test(compact[cursor - 1] || ""))
    ) {
      sign = compact[cursor] === "-" ? -1 : 1;
      cursor += 1;
    }
    const start = cursor;
    while (cursor < compact.length && /[0-9.]/.test(compact[cursor] || "")) cursor += 1;
    if (start === cursor) return null;
    const parsed = Number(compact.slice(start, cursor));
    if (!Number.isFinite(parsed)) return null;
    numbers.push(sign * parsed);
    if (cursor >= compact.length) break;
    const op = compact[cursor] || "";
    if (!/[+\-*/]/.test(op)) return null;
    operators.push(op);
    cursor += 1;
  }
  if (!numbers.length || operators.length !== numbers.length - 1) return null;
  const collapsedNumbers: number[] = [numbers[0] ?? 0];
  const collapsedOperators: string[] = [];
  for (let index = 0; index < operators.length; index += 1) {
    const op = operators[index] || "";
    const next = numbers[index + 1] ?? 0;
    if (op === "*" || op === "/") {
      const left = collapsedNumbers.pop() ?? 0;
      if (op === "/" && next === 0) return null;
      const value = op === "*" ? left * next : left / next;
      if (!Number.isFinite(value)) return null;
      collapsedNumbers.push(value);
      continue;
    }
    collapsedOperators.push(op);
    collapsedNumbers.push(next);
  }
  let total = collapsedNumbers[0] ?? 0;
  for (let index = 0; index < collapsedOperators.length; index += 1) {
    const op = collapsedOperators[index] || "";
    const next = collapsedNumbers[index + 1] ?? 0;
    total = op === "+" ? total + next : total - next;
  }
  if (!Number.isFinite(total)) return null;
  const rounded = Number(total.toFixed(8));
  return Number.isInteger(rounded) ? String(Math.trunc(rounded)) : String(rounded);
}

function parseCalculatorShortcutTokens(keys: string): string[] {
  const tokens: string[] = [];
  for (const raw of String(keys || "").replace(/\s+/g, "")) {
    if (/[0-9]/.test(raw)) {
      tokens.push(raw);
      continue;
    }
    if (raw === "x" || raw === "X") {
      tokens.push("*");
      continue;
    }
    if (raw === "=") {
      tokens.push("~");
      continue;
    }
    if ("+-*/.~".includes(raw)) {
      tokens.push(raw);
    }
  }
  return tokens;
}

function calculatorControlForToken(token: string): { selector: NativeAppControlSelector; query: string } | null {
  if (/^[0-9]$/.test(token)) {
    return {
      selector: { automationId: `num${token}Button`, controlType: "Button" },
      query: `digit ${token} button`,
    };
  }
  if (token === "+") {
    return { selector: { automationId: "plusButton", controlType: "Button" }, query: "plus button" };
  }
  if (token === "-") {
    return { selector: { automationId: "minusButton", controlType: "Button" }, query: "minus button" };
  }
  if (token === "*") {
    return { selector: { automationId: "multiplyButton", controlType: "Button" }, query: "multiply button" };
  }
  if (token === "/") {
    return { selector: { automationId: "divideButton", controlType: "Button" }, query: "divide button" };
  }
  if (token === ".") {
    return {
      selector: { automationId: "decimalSeparatorButton", controlType: "Button" },
      query: "decimal separator button",
    };
  }
  if (token === "~") {
    return { selector: { automationId: "equalButton", controlType: "Button" }, query: "equals button" };
  }
  return null;
}

function inferExpectedCalculatorResultFromShortcutKeys(keys: string): string | null {
  const expression = parseCalculatorShortcutTokens(keys)
    .filter((token) => token !== "~")
    .join("");
  if (!expression) return null;
  return evaluateArithmeticExpression(expression);
}

function textIncludesNumericToken(text: string, token: string): boolean {
  if (!text || !token) return false;
  if (text.includes(token)) return true;
  const matches: string[] = text.match(/-?\d+(?:\.\d+)?/g) || [];
  return matches.some((value) => value === token);
}

function textIncludesSnippet(text: string, snippet: string): boolean {
  const haystack = String(text || "").trim().toLowerCase().replace(/\s+/g, " ");
  const needle = String(snippet || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!haystack || !needle) return false;
  return haystack.includes(needle);
}

function toWindowsSendKeysPattern(input: string): string {
  const value = String(input || "");
  let out = "";
  for (const char of value) {
    if (char === "~") {
      out += "{ENTER}";
      continue;
    }
    if (char === "+") {
      out += "{+}";
      continue;
    }
    if (char === "^") {
      out += "{^}";
      continue;
    }
    if (char === "%") {
      out += "{%}";
      continue;
    }
    if (char === "{") {
      out += "{{}";
      continue;
    }
    if (char === "}") {
      out += "{}}";
      continue;
    }
    if (char === "(") {
      out += "{(}";
      continue;
    }
    if (char === ")") {
      out += "{)}";
      continue;
    }
    if (char === "[") {
      out += "{[}";
      continue;
    }
    if (char === "]") {
      out += "{]}";
      continue;
    }
    out += char;
  }
  return out;
}

async function sendWindowsShortcutToApp(
  keys: string,
  targetApp = "Calculator"
): Promise<boolean> {
  if (process.platform !== "win32") return false;
  const sendKeysPattern = toWindowsSendKeysPattern(keys);
  const escapedKeys = escapePowerShellSingleQuoted(sendKeysPattern);
  const canonicalTarget = canonicalizeAppIntent(targetApp) || targetApp;
  const candidates = new Set<string>();
  for (const candidate of [targetApp, canonicalTarget]) {
    const raw = String(candidate || "").trim();
    if (raw) candidates.add(raw);
  }
  if (canonicalTarget === "Calculator") {
    for (const alias of ["Calculator", "calc", "CalculatorApp", "Windows Calculator"]) {
      candidates.add(alias);
    }
  }
  const visibleWindows = await listWindows().catch(() => []);
  for (const window of visibleWindows) {
    if (windowMatchesAppIntent(window, canonicalTarget)) {
      if (window.title) candidates.add(String(window.title));
      if (window.app) candidates.add(String(window.app));
    }
  }
  for (const label of candidates) {
    const escapedTarget = escapePowerShellSingleQuoted(label);
    const command =
      `powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; ` +
      `if (-not $ws.AppActivate('${escapedTarget}')) { throw 'Window not found.' }; ` +
      `Start-Sleep -Milliseconds ${WINDOWS_SENDKEYS_SETTLE_MS}; $ws.SendKeys('${escapedKeys}')"`; // deterministic keyboard fallback when UIA shortcut routing cannot resolve Calculator.
    try {
      await runPlatformCommand(command);
      return true;
    } catch {
      // try next candidate label
    }
  }
  return false;
}

async function invokeCalculatorExpressionViaControls(
  runtime: NativeAppRuntime,
  keys: string,
  target: { sessionId?: string; app?: string; title?: string; windowId?: string; allowBackground?: boolean }
): Promise<Awaited<ReturnType<NativeAppRuntime["invokeControl"]>> | null> {
  const tokens = parseCalculatorShortcutTokens(keys);
  if (!tokens.length) return null;
  let currentTarget = {
    sessionId: target.sessionId,
    app: target.app || "Calculator",
    title: target.title,
    windowId: target.windowId,
    allowBackground: target.allowBackground === true,
  };
  let last: Awaited<ReturnType<NativeAppRuntime["invokeControl"]>> | null = null;
  for (const token of tokens) {
    const mapped = calculatorControlForToken(token);
    if (!mapped) continue;
    let step = await runtime
      .invokeControl({
        ...currentTarget,
        selector: mapped.selector,
        timeoutMs: CALCULATOR_CONTROL_INVOKE_TIMEOUT_MS,
      })
      .catch(() => null);
    if (!step) {
      step = await runtime
        .invokeControl({
          ...currentTarget,
          query: mapped.query,
          timeoutMs: CALCULATOR_CONTROL_INVOKE_TIMEOUT_MS,
        })
        .catch(() => null);
    }
    if (!step) return null;
    last = step;
    currentTarget = {
      sessionId: step.sessionId,
      app: step.appName || currentTarget.app,
      title: step.windowTitle || currentTarget.title,
      windowId: step.windowId || currentTarget.windowId,
      allowBackground: currentTarget.allowBackground,
    };
    await sleep(CALCULATOR_CONTROL_STEP_DELAY_MS);
  }
  return last;
}

async function openUrl(url: string): Promise<string> {
  if (process.platform === "win32") {
    const localPath = normalizeWindowsFilesystemTarget(url);
    if (localPath) {
      const opened = await openWindowsFilesystemTarget(localPath);
      return opened.command;
    }
    const command = `start "" "${url.replace(/"/g, '""')}"`;
    await runPlatformCommand(command);
    return command;
  }
  const command = process.platform === "darwin" ? `open ${JSON.stringify(url)}` : `xdg-open ${JSON.stringify(url)}`;
  await runPlatformCommand(command);
  return command;
}

async function listWindows(): Promise<DesktopWindowSummary[]> {
  if (process.platform === "win32") {
    const script = [
      "$windows = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle } | Sort-Object ProcessName",
      "$windows | Select-Object @{Name='id';Expression={[string]$_.Id}}, @{Name='title';Expression={$_.MainWindowTitle}}, @{Name='app';Expression={$_.ProcessName}} | ConvertTo-Json -Compress",
    ].join("; ");
    const { stdout } = await runPlatformCommand(`powershell -NoProfile -Command "${script}"`);
    const parsed = JSON.parse(stdout || "[]") as
      | Array<{ id?: string; title?: string; app?: string }>
      | { id?: string; title?: string; app?: string };
    const items = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    return items
      .filter((item) => item && item.id && item.title)
      .map((item) => ({
        id: String(item.id),
        title: String(item.title || ""),
        app: String(item.app || ""),
      }));
  }

  if (process.platform === "darwin") {
    const script = [
      "tell application \"System Events\"",
      "set windowList to {}",
      "repeat with proc in (application processes whose background only is false)",
      "repeat with w in windows of proc",
      "set end of windowList to {id:(id of w as string), title:(name of w as string), app:(name of proc as string)}",
      "end repeat",
      "end repeat",
      "return windowList",
      "end tell",
    ].join("\n");
    const { stdout } = await runPlatformCommand(`osascript -e ${JSON.stringify(script)}`);
    return stdout
      .split(/\r?\n/)
      .map((line, index) => line.trim())
      .filter(Boolean)
      .map((line, index) => ({
        id: `mac_window_${index + 1}`,
        title: line,
        app: "",
      }));
  }

  return [];
}

async function getActiveWindow(): Promise<DesktopWindowSummary | null> {
  if (process.platform === "win32") {
    const script = [
      "Add-Type @\"",
      "using System;",
      "using System.Runtime.InteropServices;",
      "public static class BinaryWin32 {",
      "  [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow();",
      "  [DllImport(\"user32.dll\")] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);",
      "  [DllImport(\"user32.dll\")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);",
      "}",
      "\"@;",
      "$hwnd = [BinaryWin32]::GetForegroundWindow();",
      "if ($hwnd -eq [IntPtr]::Zero) { return '{}' }",
      "$buffer = New-Object System.Text.StringBuilder 2048;",
      "[void][BinaryWin32]::GetWindowText($hwnd, $buffer, $buffer.Capacity);",
      "$pid = 0;",
      "[void][BinaryWin32]::GetWindowThreadProcessId($hwnd, [ref]$pid);",
      "$proc = Get-Process -Id $pid -ErrorAction SilentlyContinue;",
      "[pscustomobject]@{ id = [string]$pid; title = $buffer.ToString(); app = if ($proc) { $proc.ProcessName } else { '' } } | ConvertTo-Json -Compress",
    ].join("\n");
    const { stdout } = await runPlatformCommand(`powershell -NoProfile -Command "${script}"`);
    const parsed = JSON.parse(stdout || "{}") as { id?: string; title?: string; app?: string };
    if (!parsed.id || !parsed.title) return null;
    return {
      id: String(parsed.id),
      title: String(parsed.title || ""),
      app: String(parsed.app || ""),
    };
  }

  if (process.platform === "darwin") {
    const script = [
      'tell application "System Events"',
      "set frontApp to first application process whose frontmost is true",
      'return (name of frontApp as string) & "|" & (name of front window of frontApp as string)',
      "end tell",
    ].join("\n");
    const { stdout } = await runPlatformCommand(`osascript -e ${JSON.stringify(script)}`);
    const [app, title] = String(stdout || "").trim().split("|");
    if (!title) return null;
    return {
      id: `front_${app || "app"}`,
      title: title || "",
      app: app || "",
    };
  }

  return null;
}

async function focusWindow(input: {
  windowId?: string;
  title?: string;
  app?: string;
}): Promise<string> {
  if (process.platform === "win32") {
    const target = String(input.title || input.app || input.windowId || "").trim();
    if (!target) throw new Error("desktop_focus_window requires a windowId, title, or app.");
    const escaped = target.replace(/"/g, '""');
    const command = `powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $ok = $ws.AppActivate('${escaped.replace(/'/g, "''")}'); if (-not $ok) { throw 'Window not found.' }"`;
    await runPlatformCommand(command);
    return command;
  }

  if (process.platform === "darwin") {
    const app = String(input.app || "").trim();
    if (!app) throw new Error("desktop_focus_window currently requires an app on macOS.");
    const command = `osascript -e ${JSON.stringify(`tell application "${app}" to activate`)}`;
    await runPlatformCommand(command);
    return command;
  }

  throw new Error("desktop_focus_window is not implemented on this platform.");
}

export async function collectDesktopContext(input: {
  machineAutonomyController: MachineAutonomyController;
  policy: MachineAutonomyPolicy;
  appLimit?: number;
  windowLimit?: number;
}): Promise<{
  platform: string;
  activeWindow?: { id?: string; title?: string; app?: string };
  visibleWindows?: Array<{ id?: string; title?: string; app?: string }>;
  discoveredApps?: Array<{ id: string; name: string; aliases: string[]; source: string }>;
}> {
  const appLimit = clamp(input.appLimit ?? 24, 1, 60);
  const windowLimit = clamp(input.windowLimit ?? 12, 1, 40);
  const discovered = await input.machineAutonomyController.listApps().catch(() => ({ apps: [], indexedAt: nowIso() }));
  const activeWindow = input.policy.allowDesktopObservation ? await getActiveWindow().catch(() => null) : null;
  const visibleWindows = input.policy.allowDesktopObservation ? await listWindows().catch(() => []) : [];
  return {
    platform: `${process.platform}-${os.release()}`,
    ...(activeWindow ? { activeWindow } : {}),
    ...(visibleWindows.length ? { visibleWindows: visibleWindows.slice(0, windowLimit) } : {}),
    discoveredApps: discovered.apps.slice(0, appLimit).map((app) => ({
      id: app.id,
      name: app.name,
      aliases: app.aliases.slice(0, 8),
      source: app.source,
    })),
  };
}

export class DesktopToolExecutor {
  private readonly launchedProcessIds = new Set<number>();
  private readonly launchedWindowTargets = new Map<string, { appIntent: string; title?: string; windowId?: string }>();
  private readonly recoveryLaunchHistory = new Map<string, number[]>();
  private readonly openedAppIntentKeys = new Set<string>();
  private readonly appSessions = new Map<string, DesktopAppSessionRecord>();
  private readonly windowAffinityBindings = new Map<
    string,
    { targetAppIntent?: string; targetResolvedApp?: string; windowId?: string; windowTitle?: string; boundAt: string }
  >();
  private totalRecoveryLaunches = 0;
  private readonly deps: DesktopExecutorDependencies;

  constructor(
    private readonly machineAutonomyController: MachineAutonomyController,
    private readonly policy: MachineAutonomyPolicy,
    private readonly executionController?: AutonomyExecutionController,
    private readonly nativeAppRuntime?: NativeAppRuntime,
    private readonly task?: string,
    private readonly options?: {
      autoCloseLaunchedApps?: boolean;
      deps?: Partial<DesktopExecutorDependencies>;
    }
  ) {
    this.deps = {
      listWindows,
      getActiveWindow,
      focusWindow,
      ...(options?.deps || {}),
    };
  }

  private ensureNativeRuntime(toolCall: ToolCall): NativeAppRuntime | ToolResult {
    if (!this.nativeAppRuntime) {
      return fail(
        toolCall,
        "Binary Host could not start the native app runtime on this machine.",
        true
      );
    }
    return this.nativeAppRuntime;
  }

  private async ensureNativeRuntimeAvailable(toolCall: ToolCall): Promise<NativeAppRuntime | ToolResult> {
    const runtime = this.ensureNativeRuntime(toolCall);
    if (isNativeRuntime(runtime)) {
      const status = await runtime.getStatus();
      if (status.available) return runtime;
      return fail(
        toolCall,
        status.lastLaunchError ||
          "Binary Host native app automation is unavailable. Install the sidecar dependencies from services/binary-host/resources/requirements.txt.",
        true
      );
    }
    return runtime;
  }

  private buildNativeActionLabel(toolCall: ToolCall, args: Record<string, unknown>): string {
    if (toolCall.name === "desktop_send_shortcut") return `shortcut ${String(args.keys || "").trim()}`;
    const selector = asRecord(args.selector);
    const name = typeof selector?.name === "string" ? selector.name : "";
    const text = typeof selector?.text === "string" ? selector.text : "";
    const query = String(args.query || "").trim();
    return [name, text, query, String(toolCall.name || "").replace(/^desktop_/, "")]
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  private shouldBlockIrreversibleAction(toolCall: ToolCall, args: Record<string, unknown>): boolean {
    if (args.confirm === true) return false;
    const selector = asRecord(args.selector);
    const app = typeof args.app === "string" ? args.app : undefined;
    const title = typeof args.title === "string" ? args.title : undefined;
    const adapter = matchNativeAppAdapter(app, title);
    const actionLabel = this.buildNativeActionLabel(toolCall, args);
    const dangerous =
      isDangerousNativeAction(actionLabel, adapter) ||
      (toolCall.name === "desktop_type_into_control" && args.submit === true);
    if (!dangerous) return false;
    return !explicitUserAuthorization(this.task, actionLabel);
  }

  private buildNativeResult(
    toolCall: ToolCall,
    summary: string,
    payload: Record<string, unknown>,
    createdAt = nowIso()
  ): ToolResult {
    return {
      toolCallId: toolCall.id,
      name: toolCall.name,
      ok: true,
      summary,
      data: payload,
      createdAt,
    };
  }

  private shouldAutoCloseLaunchedApps(): boolean {
    return this.options?.autoCloseLaunchedApps !== false;
  }

  private resolveTargetAppIntent(args: Record<string, unknown>): string | undefined {
    const explicit = canonicalizeAppIntent(args.targetAppIntent);
    if (explicit) return explicit;
    return canonicalizeAppIntent(args.app);
  }

  private resolveRuntimeAppName(...candidates: unknown[]): string | undefined {
    for (const candidate of candidates) {
      const canonical = canonicalizeAppIntent(candidate);
      if (canonical) return canonical;
      const raw = String(candidate || "").trim();
      if (raw) return raw;
    }
    return undefined;
  }

  private normalizeIntentKind(value: unknown): DesktopIntentKind | undefined {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "open") return "open";
    if (normalized === "draft_text") return "draft_text";
    if (normalized === "compute") return "compute";
    if (normalized === "navigate_path") return "navigate_path";
    if (normalized === "verify") return "verify";
    if (normalized === "cleanup") return "cleanup";
    return undefined;
  }

  private normalizeExecutionMode(value: unknown): DesktopExecutionMode | undefined {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "background_safe") return "background_safe";
    if (normalized === "foreground_lease") return "foreground_lease";
    if (normalized === "takeover") return "takeover";
    return undefined;
  }

  private inferIntentKind(toolName: string, args: Record<string, unknown>): DesktopIntentKind {
    if (toolName === "desktop_open_app") {
      const appIntent = this.resolveTargetAppIntent(args);
      const targetPath = normalizeWindowsFilesystemTarget(String(args.path || args.target || args.url || "").trim());
      const appToken = String(args.app || "").trim();
      if (
        (appIntent === "File Explorer" && targetPath) ||
        (appIntent === "File Explorer" && (/^[a-z]:/i.test(appToken) || /\bdrive\b/i.test(appToken)))
      ) {
        return "navigate_path";
      }
      return "open";
    }
    if (toolName === "desktop_open_url") {
      return normalizeWindowsFilesystemTarget(String(args.url || "").trim()) ? "navigate_path" : "open";
    }
    if (toolName === "desktop_type_into_control") return "draft_text";
    if (toolName === "desktop_send_shortcut") {
      const appIntent = this.resolveTargetAppIntent(args);
      const keys = String(args.keys || "").trim();
      if (appIntent === "Calculator" || /[0-9]\s*[\+\-\*\/x]\s*[0-9]|[=~]/i.test(keys)) return "compute";
      return "draft_text";
    }
    if (toolName === "desktop_wait") return "verify";
    if (toolName.startsWith("desktop_")) return "verify";
    return "verify";
  }

  private normalizeDesktopToolArgs(toolCall: ToolCall, pendingToolCall: PendingToolCall): Record<string, unknown> {
    const args = asRecord(toolCall.arguments) ? { ...(toolCall.arguments as Record<string, unknown>) } : {};
    const targetAppIntent = this.resolveTargetAppIntent(args);
    if (targetAppIntent && typeof args.targetAppIntent !== "string") {
      args.targetAppIntent = targetAppIntent;
    }
    const intentKind = this.normalizeIntentKind(args.intentKind) || this.inferIntentKind(toolCall.name, args);
    if (intentKind) args.intentKind = intentKind;
    const rawStep = Number(pendingToolCall.step || 1);
    const safeStep = Number.isFinite(rawStep) && rawStep > 0 ? Math.floor(rawStep) : 1;
    if (typeof args.intentStepId !== "string" || !String(args.intentStepId).trim()) {
      const suffix = String(toolCall.id || toolCall.name || "step")
        .replace(/[^a-z0-9_:-]+/gi, "_")
        .slice(0, 120);
      args.intentStepId = `desktop_step_${safeStep}_${suffix}`;
    } else {
      args.intentStepId = String(args.intentStepId).trim().slice(0, 160);
    }
    const executionMode =
      this.normalizeExecutionMode(args.executionMode) ||
      (this.shouldPreferBackgroundExecution(args) ? "background_safe" : "foreground_lease");
    args.executionMode = executionMode;
    if (typeof args.windowAffinityToken !== "string" || !String(args.windowAffinityToken).trim()) {
      const appToken = normalizeAppToken(targetAppIntent || args.app || "desktop") || "desktop";
      const stepToken = String(args.intentStepId || "step").replace(/[^a-z0-9_:-]+/gi, "_");
      args.windowAffinityToken = `desktop_affinity_${appToken}_${stepToken}`.slice(0, 180);
    } else {
      args.windowAffinityToken = String(args.windowAffinityToken).trim().slice(0, 180);
    }
    return args;
  }

  private resolveWindowAffinityToken(args: Record<string, unknown>): string | undefined {
    const token = String(args.windowAffinityToken || "").trim();
    return token ? token : undefined;
  }

  private updateWindowAffinityBinding(
    token: string | undefined,
    binding: {
      targetAppIntent?: string;
      targetResolvedApp?: string;
      windowId?: string;
      windowTitle?: string;
    }
  ): void {
    if (!token) return;
    this.windowAffinityBindings.set(token, {
      ...(binding.targetAppIntent ? { targetAppIntent: binding.targetAppIntent } : {}),
      ...(binding.targetResolvedApp ? { targetResolvedApp: binding.targetResolvedApp } : {}),
      ...(binding.windowId ? { windowId: binding.windowId } : {}),
      ...(binding.windowTitle ? { windowTitle: binding.windowTitle } : {}),
      boundAt: nowIso(),
    });
  }

  private buildDesktopIntentMetadata(
    args: Record<string, unknown>,
    options?: DesktopIntentMetadataOptions
  ): Record<string, unknown> {
    const targetAppIntent = this.resolveTargetAppIntent(args);
    const intentStepId = String(options?.intentStepId || args.intentStepId || "").trim();
    const intentKind = this.normalizeIntentKind(options?.intentKind || args.intentKind);
    const executionMode =
      this.normalizeExecutionMode(options?.executionMode || args.executionMode) ||
      (options?.focusModeApplied ? options.focusModeApplied : undefined);
    const windowAffinityToken = String(options?.windowAffinityToken || args.windowAffinityToken || "").trim();
    const targetConfidenceValue =
      typeof options?.targetConfidence === "number"
        ? options.targetConfidence
        : Number.isFinite(Number(args.targetConfidence))
          ? Number(args.targetConfidence)
          : undefined;
    const verificationRequired =
      typeof options?.verificationRequired === "boolean" ? options.verificationRequired : undefined;
    const verificationPassed =
      typeof options?.verificationPassed === "boolean" ? options.verificationPassed : undefined;
    const proofProgressRaw =
      typeof options?.proofProgress === "number"
        ? options.proofProgress
        : verificationRequired === true
          ? verificationPassed === true
            ? 1
            : 0
          : Array.isArray(options?.proofArtifacts) && options?.proofArtifacts.length > 0
            ? 1
            : undefined;
    const proofProgress =
      typeof proofProgressRaw === "number" && Number.isFinite(proofProgressRaw)
        ? Math.max(0, Math.min(1, Number(proofProgressRaw)))
        : undefined;
    return {
      ...(intentStepId ? { intentStepId } : {}),
      ...(intentKind ? { intentKind } : {}),
      ...(executionMode ? { executionMode } : {}),
      ...(windowAffinityToken ? { windowAffinityToken } : {}),
      ...(targetAppIntent ? { targetAppIntent } : {}),
      ...(typeof options?.targetResolvedApp === "string" && options.targetResolvedApp.trim()
        ? { targetResolvedApp: options.targetResolvedApp.trim() }
        : {}),
      ...(typeof targetConfidenceValue === "number" ? { targetConfidence: targetConfidenceValue } : {}),
      ...(typeof options?.focusRecoveryAttempted === "boolean"
        ? { focusRecoveryAttempted: options.focusRecoveryAttempted }
        : {}),
      ...(typeof options?.focusLeaseRestored === "boolean" ? { focusLeaseRestored: options.focusLeaseRestored } : {}),
      ...(typeof verificationRequired === "boolean"
        ? { verificationRequired }
        : {}),
      ...(typeof verificationPassed === "boolean"
        ? { verificationPassed }
        : {}),
      ...(typeof proofProgress === "number" ? { proofProgress } : {}),
      ...(typeof options?.recoverySuppressedReason === "string" && options.recoverySuppressedReason.trim()
        ? { recoverySuppressedReason: options.recoverySuppressedReason.trim() }
        : {}),
      ...(typeof options?.relaunchAttempt === "number" ? { relaunchAttempt: Math.max(0, Math.floor(options.relaunchAttempt)) } : {}),
      ...(typeof options?.relaunchSuppressed === "boolean" ? { relaunchSuppressed: options.relaunchSuppressed } : {}),
      ...(typeof options?.relaunchSuppressionReason === "string" && options.relaunchSuppressionReason.trim()
        ? { relaunchSuppressionReason: options.relaunchSuppressionReason.trim() }
        : {}),
      ...(options?.focusModeApplied ? { focusModeApplied: options.focusModeApplied } : {}),
      ...(typeof options?.foregroundLeaseMs === "number" ? { foregroundLeaseMs: Math.max(0, Math.floor(options.foregroundLeaseMs)) } : {}),
      ...(Array.isArray(options?.proofArtifacts) && options?.proofArtifacts.length > 0 ? { proofArtifacts: options?.proofArtifacts } : {}),
    };
  }

  private composeFocusGuardMetadataOptions(
    focusGuard: DesktopFocusGuardResult,
    options?: DesktopIntentMetadataOptions
  ): DesktopIntentMetadataOptions {
    return {
      ...(typeof focusGuard.targetResolvedApp === "string" && focusGuard.targetResolvedApp.trim()
        ? { targetResolvedApp: focusGuard.targetResolvedApp }
        : {}),
      ...(typeof focusGuard.focusRecoveryAttempted === "boolean"
        ? { focusRecoveryAttempted: focusGuard.focusRecoveryAttempted }
        : {}),
      ...(typeof focusGuard.recoverySuppressedReason === "string" && focusGuard.recoverySuppressedReason.trim()
        ? { recoverySuppressedReason: focusGuard.recoverySuppressedReason }
        : {}),
      ...(typeof focusGuard.relaunchAttempt === "number" ? { relaunchAttempt: focusGuard.relaunchAttempt } : {}),
      ...(typeof focusGuard.relaunchSuppressed === "boolean"
        ? { relaunchSuppressed: focusGuard.relaunchSuppressed }
        : {}),
      ...(typeof focusGuard.relaunchSuppressionReason === "string" && focusGuard.relaunchSuppressionReason.trim()
        ? { relaunchSuppressionReason: focusGuard.relaunchSuppressionReason }
        : {}),
      ...(focusGuard.focusModeApplied ? { focusModeApplied: focusGuard.focusModeApplied } : {}),
      ...(options || {}),
    };
  }

  private shouldPreferBackgroundExecution(args: Record<string, unknown>): boolean {
    if (args.allowBackground === false) return false;
    if (args.requiresForeground === true) return false;
    if (args.forceForeground === true) return false;
    return true;
  }

  private async resolveMatchingWindowTarget(
    targetAppIntent?: string,
    title?: string,
    windowId?: string
  ): Promise<DesktopWindowSummary | null> {
    const windows = await this.deps.listWindows().catch(() => []);
    if (!windows.length) return null;
    if (windowId) {
      const byId = windows.find((window) => String(window.id || "") === String(windowId));
      if (byId) return byId;
    }
    if (title) {
      const normalizedTitle = normalizeAppToken(title);
      const byTitle = windows.find((window) => {
        const candidate = normalizeAppToken(window.title);
        return candidate === normalizedTitle || candidate.includes(normalizedTitle) || normalizedTitle.includes(candidate);
      });
      if (byTitle) return byTitle;
    }
    if (targetAppIntent) {
      const byIntent = windows.find((window) => windowMatchesAppIntent(window, targetAppIntent));
      if (byIntent) return byIntent;
    }
    return null;
  }

  private async launchAppForRecovery(app: string): Promise<void> {
    const beforeWindows = await withTimeout(this.deps.listWindows().catch(() => []), 900, []);
    const beforeLaunchProcessIds =
      process.platform === "win32" ? await this.captureWindowProcessIds().catch(() => new Set<number>()) : new Set<number>();
    const launched = await this.machineAutonomyController.launchApp(app);
    const launchedProcessIds =
      process.platform === "win32"
        ? await this.detectNewLaunchProcessIds(beforeLaunchProcessIds, launched.app.name).catch(() => [])
        : [];
    this.trackLaunchedProcesses(launchedProcessIds);
    const canonicalApp = canonicalizeAppIntent(app) || launched.app.name;
    const launchedWindow = await this.detectLaunchedWindowTarget(beforeWindows, canonicalApp);
    this.rememberLaunchedWindowTarget(canonicalApp, launchedWindow);
    this.updateAppSessionFromWindow(canonicalApp, launchedWindow, {
      runLaunched: true,
    });
  }

  private getRecoveryLaunchKey(app: string): string {
    return String(canonicalizeAppIntent(app) || app || "").trim().toLowerCase();
  }

  private getOrCreateAppSession(app: string): DesktopAppSessionRecord {
    const canonical = canonicalizeAppIntent(app) || String(app || "").trim() || "App";
    const key = this.getRecoveryLaunchKey(canonical);
    const existing = this.appSessions.get(key);
    if (existing) return existing;
    const created: DesktopAppSessionRecord = {
      appIntent: canonical,
      appName: canonical,
      preExisting: false,
      runLaunched: false,
      openAttempts: 0,
      relaunchAttempts: 0,
    };
    this.appSessions.set(key, created);
    return created;
  }

  private findAppSession(app: unknown): DesktopAppSessionRecord | null {
    const canonical = canonicalizeAppIntent(app);
    const key = canonical ? this.getRecoveryLaunchKey(canonical) : "";
    if (!key) return null;
    return this.appSessions.get(key) || null;
  }

  private updateAppSessionFromWindow(
    app: string,
    window: DesktopWindowSummary | null,
    options?: {
      preExisting?: boolean;
      runLaunched?: boolean;
      incrementOpenAttempt?: boolean;
      incrementRelaunch?: boolean;
    }
  ): DesktopAppSessionRecord {
    const session = this.getOrCreateAppSession(app);
    const normalizedAppName = String(window?.app || app || session.appName || session.appIntent || "").trim();
    session.appName = normalizedAppName || session.appName;
    session.appIntent = canonicalizeAppIntent(session.appIntent || app || normalizedAppName) || session.appIntent;
    if (window?.id) {
      session.windowId = String(window.id);
      const pid = parseProcessId(window.id);
      if (pid) session.processId = pid;
    }
    if (window?.title) session.windowTitle = String(window.title);
    if (options?.preExisting === true) session.preExisting = true;
    if (options?.runLaunched === true) session.runLaunched = true;
    if (options?.incrementOpenAttempt === true) {
      session.openAttempts = Math.max(0, session.openAttempts) + 1;
    }
    if (options?.incrementRelaunch === true) {
      session.relaunchAttempts = Math.max(0, session.relaunchAttempts) + 1;
    }
    const key = this.getRecoveryLaunchKey(session.appIntent || session.appName);
    if (key) this.appSessions.set(key, session);
    return session;
  }

  private recordProofArtifact(app: string, proofLabel: string): void {
    const normalizedApp = canonicalizeAppIntent(app) || app;
    if (!normalizedApp) return;
    const session = this.getOrCreateAppSession(normalizedApp);
    if (!proofLabel) return;
    session.lastProofAt = nowIso();
    const key = this.getRecoveryLaunchKey(normalizedApp);
    if (key) this.appSessions.set(key, session);
  }

  private buildRecoverySuppressedReason(
    app: string,
    context: "per_app_limit" | "per_run_limit" | "cooldown"
  ): string {
    if (context === "per_run_limit") {
      return `Recovery launch suppressed for ${app}: the run-level relaunch governor reached ${RECOVERY_LAUNCH_MAX_PER_RUN} launches.`;
    }
    if (context === "per_app_limit") {
      return `Recovery launch suppressed for ${app}: the per-app relaunch governor reached ${RECOVERY_LAUNCH_MAX_PER_APP} launches for this run.`;
    }
    return `Recovery launch suppressed for ${app}: please wait at least ${Math.round(RECOVERY_LAUNCH_COOLDOWN_MS / 1000)}s before another relaunch attempt.`;
  }

  private markAppIntentOpened(app: string): void {
    const key = this.getRecoveryLaunchKey(app);
    if (!key) return;
    this.openedAppIntentKeys.add(key);
  }

  private wasAppIntentOpened(app: string): boolean {
    const key = this.getRecoveryLaunchKey(app);
    if (!key) return false;
    return this.openedAppIntentKeys.has(key);
  }

  private getRecoveryLaunchDecision(app: string): {
    allowed: boolean;
    reason?: string;
    relaunchAttempt: number;
  } {
    const key = this.getRecoveryLaunchKey(app);
    if (!key) {
      return {
        allowed: false,
        reason: this.buildRecoverySuppressedReason(app, "per_app_limit"),
        relaunchAttempt: 0,
      };
    }
    const session = this.getOrCreateAppSession(app);
    const now = Date.now();
    const history = (this.recoveryLaunchHistory.get(key) || []).filter((timestamp) => now - timestamp <= 86_400_000);
    this.recoveryLaunchHistory.set(key, history);
    if (this.totalRecoveryLaunches >= RECOVERY_LAUNCH_MAX_PER_RUN) {
      return {
        allowed: false,
        reason: this.buildRecoverySuppressedReason(session.appIntent || app, "per_run_limit"),
        relaunchAttempt: Math.max(0, session.relaunchAttempts || history.length),
      };
    }
    if (history.length >= RECOVERY_LAUNCH_MAX_PER_APP) {
      return {
        allowed: false,
        reason: this.buildRecoverySuppressedReason(session.appIntent || app, "per_app_limit"),
        relaunchAttempt: Math.max(0, session.relaunchAttempts || history.length),
      };
    }
    const mostRecent = history.length > 0 ? history[history.length - 1] : 0;
    if (mostRecent && now - mostRecent < RECOVERY_LAUNCH_COOLDOWN_MS) {
      return {
        allowed: false,
        reason: this.buildRecoverySuppressedReason(session.appIntent || app, "cooldown"),
        relaunchAttempt: Math.max(0, session.relaunchAttempts || history.length),
      };
    }
    return {
      allowed: true,
      relaunchAttempt: Math.max(0, session.relaunchAttempts || history.length) + 1,
    };
  }

  private recordRecoveryLaunch(app: string, matchedWindow: DesktopWindowSummary | null = null): DesktopAppSessionRecord {
    const key = this.getRecoveryLaunchKey(app);
    const session = this.getOrCreateAppSession(app);
    if (!key) return session;
    const now = Date.now();
    const history = (this.recoveryLaunchHistory.get(key) || []).filter((timestamp) => now - timestamp <= 86_400_000);
    history.push(now);
    this.recoveryLaunchHistory.set(key, history);
    this.totalRecoveryLaunches = Math.max(0, this.totalRecoveryLaunches) + 1;
    return this.updateAppSessionFromWindow(app, matchedWindow, {
      runLaunched: true,
      incrementRelaunch: true,
      incrementOpenAttempt: true,
    });
  }

  private async tryFocusExistingWindowForIntent(
    targetAppIntent: string,
    title?: string,
    windowId?: string
  ): Promise<boolean> {
    const windows = await this.deps.listWindows().catch(() => []);
    const matchedWindows = windows.filter((window) => windowMatchesAppIntent(window, targetAppIntent));
    if (!matchedWindows.length) return false;
    for (const matched of matchedWindows) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          await this.deps.focusWindow({
            app: targetAppIntent,
            title: matched.title || title,
            windowId: matched.id || windowId,
          });
          return true;
        } catch {
          await sleep(100);
        }
      }
    }
    return false;
  }

  private async captureForegroundLeaseContext(): Promise<ForegroundLeaseContext | undefined> {
    const activeWindow = await this.deps.getActiveWindow().catch(() => null);
    if (!activeWindow) return undefined;
    return {
      ...(activeWindow.id ? { previousWindowId: String(activeWindow.id) } : {}),
      ...(activeWindow.title ? { previousWindowTitle: String(activeWindow.title) } : {}),
      ...(activeWindow.app ? { previousWindowApp: String(activeWindow.app) } : {}),
      startedAt: Date.now(),
    };
  }

  private async restoreForegroundLease(
    lease?: ForegroundLeaseContext
  ): Promise<{ attempted: boolean; restored: boolean; foregroundLeaseMs?: number }> {
    if (!lease) return { attempted: false, restored: false };
    const startedAt = lease.startedAt || Date.now();
    const finish = () => Math.min(FOREGROUND_LEASE_MAX_MS, Math.max(0, Date.now() - startedAt));
    const focusInput = {
      ...(lease.previousWindowId ? { windowId: lease.previousWindowId } : {}),
      ...(lease.previousWindowTitle ? { title: lease.previousWindowTitle } : {}),
      ...(lease.previousWindowApp ? { app: lease.previousWindowApp } : {}),
    };
    if (!focusInput.windowId && !focusInput.title && !focusInput.app) {
      return { attempted: false, restored: false, foregroundLeaseMs: finish() };
    }
    for (let attempt = 0; attempt < FOREGROUND_LEASE_RESTORE_ATTEMPTS; attempt += 1) {
      const restoreResult = await withTimeout(
        this.deps.focusWindow(focusInput).then(() => true).catch(() => false),
        Math.min(FOREGROUND_LEASE_MAX_MS, FOREGROUND_LEASE_RESTORE_TIMEOUT_MS),
        false
      );
      if (restoreResult) {
        return { attempted: true, restored: true, foregroundLeaseMs: finish() };
      }
      await sleep(80);
    }
    return { attempted: true, restored: false, foregroundLeaseMs: finish() };
  }

  private async sendWindowsShortcutWithBackgroundRecovery(
    keys: string,
    app: string,
    preferBackground: boolean
  ): Promise<{
    sent: boolean;
    focusStolen: boolean;
    focusLeaseRestored?: boolean;
    foregroundLeaseMs?: number;
  }> {
    const targetApp = String(app || "").trim() || "Calculator";
    if (!preferBackground) {
      const sent = await sendWindowsShortcutToApp(keys, targetApp);
      return {
        sent,
        focusStolen: sent,
      };
    }
    const lease = await this.captureForegroundLeaseContext();
    const sent = await sendWindowsShortcutToApp(keys, targetApp);
    if (!sent) {
      return {
        sent: false,
        focusStolen: false,
      };
    }
    const restored = await this.restoreForegroundLease(lease);
    return {
      sent: true,
      focusStolen: !restored.restored,
      ...(typeof restored.restored === "boolean" ? { focusLeaseRestored: restored.restored } : {}),
      ...(typeof restored.foregroundLeaseMs === "number" ? { foregroundLeaseMs: restored.foregroundLeaseMs } : {}),
    };
  }

  private async releaseForegroundLeaseIfNeeded(
    focusGuard: DesktopFocusGuardResult
  ): Promise<DesktopIntentMetadataOptions> {
    if (focusGuard.focusModeApplied !== "foreground_lease") {
      return this.composeFocusGuardMetadataOptions(focusGuard);
    }
    const restored = await this.restoreForegroundLease(focusGuard.foregroundLease);
    return this.composeFocusGuardMetadataOptions(focusGuard, {
      focusModeApplied: "foreground_lease",
      ...(typeof restored.foregroundLeaseMs === "number"
        ? { foregroundLeaseMs: restored.foregroundLeaseMs }
        : {}),
      focusLeaseRestored: restored.restored,
    });
  }

  private async enforceWindowTarget(
    toolCall: ToolCall,
    args: Record<string, unknown>,
    options?: {
      preferBackground?: boolean;
    }
  ): Promise<DesktopFocusGuardResult> {
    const preferBackground = options?.preferBackground === true;
    const affinityToken = this.resolveWindowAffinityToken(args);
    const affinityBinding = affinityToken ? this.windowAffinityBindings.get(affinityToken) : undefined;
    const explicitTargetAppIntent = this.resolveTargetAppIntent(args);
    const boundTargetAppIntent = canonicalizeAppIntent(affinityBinding?.targetAppIntent);
    if (explicitTargetAppIntent && boundTargetAppIntent && explicitTargetAppIntent !== boundTargetAppIntent) {
      return {
        ok: false,
        message: `Window affinity token blocked ${toolCall.name}: intended ${explicitTargetAppIntent}, but token is bound to ${boundTargetAppIntent}.`,
        targetAppIntent: explicitTargetAppIntent,
        targetResolvedApp: affinityBinding?.targetResolvedApp,
        targetWindowId: affinityBinding?.windowId,
        targetWindowTitle: affinityBinding?.windowTitle,
        focusRecoveryAttempted: false,
        focusStolen: false,
      };
    }
    const targetAppIntent = explicitTargetAppIntent || boundTargetAppIntent;
    const title =
      typeof args.title === "string" && args.title.trim()
        ? args.title
        : typeof affinityBinding?.windowTitle === "string"
          ? affinityBinding.windowTitle
          : undefined;
    const windowId =
      typeof args.windowId === "string" && args.windowId.trim()
        ? args.windowId
        : typeof affinityBinding?.windowId === "string"
          ? affinityBinding.windowId
          : undefined;
    const hasExplicitTarget = Boolean(targetAppIntent || title || windowId);
    if (!hasExplicitTarget) {
      return {
        ok: true,
        focusRecoveryAttempted: false,
        focusStolen: false,
        ...(preferBackground ? { focusModeApplied: "background_safe" as const } : {}),
      };
    }

    if (preferBackground) {
      let focusRecoveryAttempted = false;
      let recoverySuppressedReason: string | undefined;
      let relaunchAttempt: number | undefined;
      let relaunchSuppressed = false;
      let matchedTargetWindow = await this.resolveMatchingWindowTarget(targetAppIntent, title, windowId);
      if (!matchedTargetWindow && targetAppIntent) {
        focusRecoveryAttempted = true;
        const relaunchDecision = this.getRecoveryLaunchDecision(targetAppIntent);
        if (!relaunchDecision.allowed) {
          recoverySuppressedReason = relaunchDecision.reason || this.buildRecoverySuppressedReason(targetAppIntent, "per_app_limit");
          relaunchSuppressed = true;
          return {
            ok: false,
            message: recoverySuppressedReason,
            targetAppIntent,
            focusRecoveryAttempted,
            focusStolen: false,
            backgroundTargetBound: false,
            focusModeApplied: "background_safe",
            relaunchSuppressed: true,
            relaunchSuppressionReason: recoverySuppressedReason,
            ...(typeof relaunchDecision.relaunchAttempt === "number"
              ? { relaunchAttempt: relaunchDecision.relaunchAttempt }
              : {}),
            ...(recoverySuppressedReason ? { recoverySuppressedReason } : {}),
          };
        }
        relaunchAttempt = relaunchDecision.relaunchAttempt;
        this.recordRecoveryLaunch(targetAppIntent, null);
        await this.launchAppForRecovery(targetAppIntent);
        for (let attempt = 0; attempt < BACKGROUND_RECOVERY_WINDOW_POLL_ATTEMPTS; attempt += 1) {
          matchedTargetWindow = await this.resolveMatchingWindowTarget(targetAppIntent, title, windowId);
          if (matchedTargetWindow) break;
          await sleep(BACKGROUND_RECOVERY_WINDOW_POLL_DELAY_MS);
        }
      }
      if (!matchedTargetWindow) {
        return {
          ok: false,
          message: targetAppIntent
            ? `No window was found for ${targetAppIntent}.`
            : "No matching target window was found.",
          targetAppIntent,
          focusRecoveryAttempted,
          focusStolen: false,
          backgroundTargetBound: false,
          focusModeApplied: "background_safe",
          ...(typeof relaunchAttempt === "number" ? { relaunchAttempt } : {}),
          ...(relaunchSuppressed
            ? { relaunchSuppressed, relaunchSuppressionReason: recoverySuppressedReason || undefined }
            : {}),
          ...(recoverySuppressedReason ? { recoverySuppressedReason } : {}),
        };
      }
      this.updateAppSessionFromWindow(targetAppIntent || matchedTargetWindow.app || "App", matchedTargetWindow, {
        preExisting: true,
        incrementOpenAttempt: true,
      });
      this.updateWindowAffinityBinding(affinityToken, {
        targetAppIntent,
        targetResolvedApp: this.resolveRuntimeAppName(matchedTargetWindow.app, targetAppIntent) || undefined,
        windowId: String(matchedTargetWindow.id || ""),
        windowTitle: String(matchedTargetWindow.title || ""),
      });
      return {
        ok: true,
        ...(targetAppIntent ? { targetAppIntent } : {}),
        targetResolvedApp: this.resolveRuntimeAppName(matchedTargetWindow.app, targetAppIntent) || "",
        targetWindowId: String(matchedTargetWindow.id || ""),
        targetWindowTitle: String(matchedTargetWindow.title || ""),
        focusRecoveryAttempted,
        focusStolen: false,
        backgroundTargetBound: true,
        focusModeApplied: "background_safe",
        ...(typeof relaunchAttempt === "number" ? { relaunchAttempt } : {}),
        ...(recoverySuppressedReason ? { recoverySuppressedReason } : {}),
      };
    }

    let focusRecoveryAttempted = false;
    let focusStolen = false;
    let recoverySuppressedReason: string | undefined;
    let relaunchAttempt: number | undefined;
    let relaunchSuppressed = false;
    const foregroundLease = await this.captureForegroundLeaseContext();
    try {
      const focused = await withTimeout(
        this.deps
          .focusWindow({ app: targetAppIntent, title, windowId })
          .then(() => true)
          .catch(() => false),
        FOREGROUND_LEASE_MAX_MS,
        false
      );
      if (!focused) {
        throw new Error(targetAppIntent ? `Window not found for ${targetAppIntent}.` : "Window not found.");
      }
      focusStolen = true;
    } catch (error) {
      if (!targetAppIntent) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
          targetAppIntent,
          focusRecoveryAttempted,
          focusStolen,
          ...(focusStolen ? { focusModeApplied: "foreground_lease" as const, foregroundLease } : {}),
          ...(recoverySuppressedReason ? { recoverySuppressedReason } : {}),
        };
      }
      try {
        focusRecoveryAttempted = true;
        const existingWindowMatches = await this.deps
          .listWindows()
          .catch(() => [])
          .then((windows) => windows.filter((window) => windowMatchesAppIntent(window, targetAppIntent)));
        if (existingWindowMatches.length > 0) {
          const fallbackWindow = existingWindowMatches[0] || null;
          this.updateWindowAffinityBinding(affinityToken, {
            targetAppIntent,
            targetResolvedApp: fallbackWindow?.app ? String(fallbackWindow.app) : targetAppIntent,
            windowId: fallbackWindow?.id ? String(fallbackWindow.id) : undefined,
            windowTitle: fallbackWindow?.title ? String(fallbackWindow.title) : undefined,
          });
          return {
            ok: true,
            targetAppIntent,
            ...(fallbackWindow?.app ? { targetResolvedApp: String(fallbackWindow.app) } : {}),
            ...(fallbackWindow?.id ? { targetWindowId: String(fallbackWindow.id) } : {}),
            ...(fallbackWindow?.title ? { targetWindowTitle: String(fallbackWindow.title) } : {}),
            focusRecoveryAttempted,
            focusStolen: false,
            backgroundTargetBound: true,
            focusModeApplied: "background_safe",
            ...(recoverySuppressedReason ? { recoverySuppressedReason } : {}),
          };
        }
        let focusedExisting = await this.tryFocusExistingWindowForIntent(targetAppIntent, title, windowId);
        if (!focusedExisting && !this.getRecoveryLaunchDecision(targetAppIntent).allowed) {
          // Give newly launched UWP/Electron apps a short settle window before suppressing recovery.
          for (let waitAttempt = 0; waitAttempt < FOREGROUND_RECOVERY_SETTLE_ATTEMPTS; waitAttempt += 1) {
            await sleep(FOREGROUND_RECOVERY_SETTLE_DELAY_MS);
            focusedExisting = await this.tryFocusExistingWindowForIntent(targetAppIntent, title, windowId);
            if (focusedExisting) break;
          }
        }
        if (focusedExisting) {
          focusStolen = true;
        } else {
          const relaunchDecision = this.getRecoveryLaunchDecision(targetAppIntent);
          if (!relaunchDecision.allowed) {
            recoverySuppressedReason = relaunchDecision.reason || this.buildRecoverySuppressedReason(targetAppIntent, "per_app_limit");
            relaunchSuppressed = true;
            throw new Error(recoverySuppressedReason);
          }
          relaunchAttempt = relaunchDecision.relaunchAttempt;
          this.recordRecoveryLaunch(targetAppIntent, null);
          await this.launchAppForRecovery(targetAppIntent);
        }
        let focused = false;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const refreshedTarget = await this.resolveMatchingWindowTarget(targetAppIntent, title, windowId);
          try {
            const focusedAttempt = await withTimeout(
              this.deps
                .focusWindow({
                  app: targetAppIntent,
                  title: refreshedTarget?.title || title,
                  windowId: refreshedTarget?.id || windowId,
                })
                .then(() => true)
                .catch(() => false),
              FOREGROUND_LEASE_MAX_MS,
              false
            );
            if (!focusedAttempt) {
              throw new Error(`Window not found for ${targetAppIntent}.`);
            }
            focusStolen = true;
            focused = true;
            break;
          } catch {
            await sleep(120);
          }
        }
        if (!focused) {
          throw new Error(`Window not found for ${targetAppIntent}.`);
        }
      } catch (recoveryError) {
        return {
          ok: false,
          message:
            recoveryError instanceof Error ? recoveryError.message : String(recoveryError),
          targetAppIntent,
          focusRecoveryAttempted,
          focusStolen,
          ...(focusStolen ? { focusModeApplied: "foreground_lease" as const, foregroundLease } : {}),
          ...(typeof relaunchAttempt === "number" ? { relaunchAttempt } : {}),
          ...(relaunchSuppressed
            ? { relaunchSuppressed, relaunchSuppressionReason: recoverySuppressedReason || undefined }
            : {}),
          ...(recoverySuppressedReason ? { recoverySuppressedReason } : {}),
        };
      }
    }

    let activeWindow: DesktopWindowSummary | null = null;
    let matchedTargetWindow: DesktopWindowSummary | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      activeWindow = await this.deps.getActiveWindow().catch(() => null);
      if (activeWindow) break;
      await sleep(80);
    }
    if (targetAppIntent) {
      const visibleWindows = await this.deps.listWindows().catch(() => []);
      matchedTargetWindow = visibleWindows.find((window) => windowMatchesAppIntent(window, targetAppIntent)) || null;
      if (!activeWindow && matchedTargetWindow) activeWindow = matchedTargetWindow;
    }
    const resolvedWindow = matchedTargetWindow || activeWindow || null;
    const targetResolvedApp = this.resolveRuntimeAppName(resolvedWindow?.app, targetAppIntent);
    const targetWindowId = resolvedWindow?.id ? String(resolvedWindow.id) : undefined;
    const targetWindowTitle = resolvedWindow?.title ? String(resolvedWindow.title) : undefined;
    if (targetResolvedApp || targetAppIntent) {
      this.updateAppSessionFromWindow(targetResolvedApp || targetAppIntent || "App", resolvedWindow, {
        preExisting: true,
      });
    }
    this.updateWindowAffinityBinding(affinityToken, {
      targetAppIntent,
      targetResolvedApp,
      windowId: targetWindowId,
      windowTitle: targetWindowTitle,
    });
    if (targetAppIntent && activeWindow && !windowMatchesAppIntent(activeWindow, targetAppIntent)) {
      const activeLabel = activeWindow
        ? `${activeWindow.app || "unknown app"} (${activeWindow.title || "untitled window"})`
        : "no active window";
      return {
        ok: false,
        message: `Wrong-target guard blocked ${toolCall.name}. Intended ${targetAppIntent}, but active window is ${activeLabel}.`,
        targetAppIntent,
        targetResolvedApp,
        targetWindowId,
        targetWindowTitle,
        focusRecoveryAttempted,
        focusStolen,
        backgroundTargetBound: false,
        ...(focusStolen ? { focusModeApplied: "foreground_lease" as const, foregroundLease } : {}),
        ...(typeof relaunchAttempt === "number" ? { relaunchAttempt } : {}),
        ...(relaunchSuppressed
          ? { relaunchSuppressed, relaunchSuppressionReason: recoverySuppressedReason || undefined }
          : {}),
        ...(recoverySuppressedReason ? { recoverySuppressedReason } : {}),
      };
    }

    return {
      ok: true,
      targetAppIntent,
      targetResolvedApp,
      targetWindowId,
      targetWindowTitle,
      focusRecoveryAttempted,
      focusStolen,
      backgroundTargetBound: false,
      ...(focusStolen ? { focusModeApplied: "foreground_lease" as const, foregroundLease } : {}),
      ...(typeof relaunchAttempt === "number" ? { relaunchAttempt } : {}),
      ...(relaunchSuppressed
        ? { relaunchSuppressed, relaunchSuppressionReason: recoverySuppressedReason || undefined }
        : {}),
      ...(recoverySuppressedReason ? { recoverySuppressedReason } : {}),
    };
  }

  private async captureWindowProcessIds(): Promise<Set<number>> {
    if (process.platform !== "win32") return new Set();
    const windows = await withTimeout(this.deps.listWindows(), 900, []);
    const ids = new Set<number>();
    for (const window of windows) {
      const pid = parseProcessId(window.id);
      if (pid) ids.add(pid);
    }
    return ids;
  }

  private async detectNewLaunchProcessIds(before: Set<number>, expectedApp?: string): Promise<number[]> {
    if (process.platform !== "win32") return [];
    const expected = String(expectedApp || "").trim().toLowerCase();
    const observed = new Set<number>();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const windows = await withTimeout(this.deps.listWindows().catch(() => []), 300, []);
      for (const window of windows) {
        const pid = parseProcessId(window.id);
        if (!pid || before.has(pid)) continue;
        if (expected && !String(window.app || "").toLowerCase().includes(expected) && !String(window.title || "").toLowerCase().includes(expected)) {
          continue;
        }
        observed.add(pid);
      }
      if (observed.size > 0) break;
      await sleep(120);
    }
    return Array.from(observed);
  }

  private trackLaunchedProcesses(processIds: number[]): void {
    for (const processId of processIds) {
      if (processId > 0) this.launchedProcessIds.add(processId);
    }
  }

  private rememberLaunchedWindowTarget(appIntent: string, window: DesktopWindowSummary | null): void {
    const canonical = canonicalizeAppIntent(appIntent) || appIntent;
    const title = window?.title ? String(window.title) : canonical;
    const key = `${normalizeAppToken(canonical)}::${normalizeAppToken(title)}`;
    this.launchedWindowTargets.set(key, {
      appIntent: canonical,
      ...(window?.title ? { title: String(window.title) } : {}),
      ...(window?.id ? { windowId: String(window.id) } : {}),
    });
  }

  private async detectLaunchedWindowTarget(
    beforeWindows: DesktopWindowSummary[],
    appIntent: string
  ): Promise<DesktopWindowSummary | null> {
    const beforeIds = new Set(beforeWindows.map((window) => String(window.id || "")));
    const beforeTitles = new Set(beforeWindows.map((window) => normalizeAppToken(window.title)));
    for (let attempt = 0; attempt < APP_LAUNCH_WINDOW_DETECT_ATTEMPTS; attempt += 1) {
      const windows = await withTimeout(this.deps.listWindows().catch(() => []), 900, []);
      const matched = windows.filter((window) => windowMatchesAppIntent(window, appIntent));
      if (matched.length > 0) {
        const newlyOpened =
          matched.find((window) => !beforeIds.has(String(window.id || ""))) ||
          matched.find((window) => !beforeTitles.has(normalizeAppToken(window.title))) ||
          matched[0];
        if (newlyOpened) return newlyOpened;
      }
      await sleep(APP_LAUNCH_WINDOW_DETECT_DELAY_MS);
    }
    return null;
  }

  private async closeWindowTarget(target: { appIntent: string; title?: string; windowId?: string }): Promise<void> {
    if (process.platform !== "win32") return;
    const focusTitle = String(target.title || target.appIntent || "").trim();
    if (!focusTitle) throw new Error("Window target is missing a focus label.");
    const escaped = escapePowerShellSingleQuoted(focusTitle);
    const command =
      `powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; ` +
      `$ok = $ws.AppActivate('${escaped}'); if (-not $ok) { throw 'Window not found.' }; ` +
      `Start-Sleep -Milliseconds 120; $ws.SendKeys('%{F4}')"`; // ALT+F4 to close the specific launched window target.
    await runPlatformCommand(command);
  }

  async cleanupLaunchedApps(): Promise<DesktopCleanupSummary> {
    if (process.platform !== "win32" || !this.shouldAutoCloseLaunchedApps()) {
      return {
        attempted: 0,
        closed: 0,
        failed: [],
        skipped: true,
        skippedPreExistingCount: 0,
        cleanupErrors: 0,
      };
    }
    const failed: Array<{ pid: number; error: string }> = [];
    let closed = 0;
    const skippedPreExistingCount = Array.from(this.appSessions.values()).filter(
      (session) => session.preExisting === true && session.runLaunched !== true
    ).length;
    const launchedTargets = Array.from(this.launchedWindowTargets.values());
    for (const target of launchedTargets) {
      try {
        await this.closeWindowTarget(target);
        closed += 1;
      } catch (error) {
        failed.push({
          pid: Number.parseInt(String(target.windowId || "0"), 10) || 0,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    this.launchedWindowTargets.clear();
    await sleep(120);
    const targets = Array.from(this.launchedProcessIds);
    for (const pid of targets) {
      try {
        const command = `taskkill /PID ${pid} /T /F`;
        await runPlatformCommand(command);
        closed += 1;
      } catch (error) {
        failed.push({
          pid,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    this.launchedProcessIds.clear();
    return {
      attempted: targets.length + launchedTargets.length,
      closed,
      failed,
      skipped: false,
      skippedPreExistingCount,
      cleanupErrors: failed.length,
    };
  }

  async execute(pendingToolCall: PendingToolCall): Promise<ToolResult> {
    const toolCall = pendingToolCall.toolCall;
    const args = this.normalizeDesktopToolArgs(toolCall, pendingToolCall);
    const decision = this.executionController?.decide(pendingToolCall);
    const receipt = (focusStolen = false, sessionKind: "managed" | "existing" | "none" = "none") =>
      this.executionController && decision
        ? this.executionController.buildReceipt(decision, { focusStolen, sessionKind })
        : {};

    if (decision?.focusSuppressed) {
      return {
        ...fail(toolCall, decision.summary, true),
        data: receipt(false, "none"),
      };
    }

    if (toolCall.name === "desktop_list_apps") {
      if (!this.policy.enabled || !this.policy.allowWholeMachineAccess) {
        return fail(toolCall, "Binary Host blocked desktop_list_apps because machine autonomy is disabled.", true);
      }
      const forceRefresh = args.refresh === true;
      const limit = clamp(Number(args.limit || 40), 1, 200);
      const discovered = await this.machineAutonomyController.listApps({ forceRefresh });
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        ok: true,
        summary: `Listed ${Math.min(discovered.apps.length, limit)} discovered desktop app(s).`,
        data: {
          ...receipt(false, "none"),
          indexedAt: discovered.indexedAt,
          apps: discovered.apps.slice(0, limit).map((app) => ({
            id: app.id,
            name: app.name,
            aliases: app.aliases,
            source: app.source,
            installLocation: app.installLocation,
            appId: app.appId,
          })),
        },
        createdAt: nowIso(),
      };
    }

    if (toolCall.name === "desktop_open_app") {
      if (!this.policy.enabled || !this.policy.allowAppLaunch) {
        return fail(toolCall, "Binary Host blocked desktop_open_app because app launch autonomy is disabled.", true);
      }
      const preferBackgroundOpen = args.allowBackground !== false && args.forceForeground !== true;
      const app = String(args.app || "").trim();
      if (!app) return fail(toolCall, "desktop_open_app requires an app name.");
      const targetPath =
        normalizeWindowsFilesystemTarget(String(args.path || args.target || args.url || "").trim()) ||
        normalizeWindowsFilesystemTarget(app);
      const openInExplorer =
        process.platform === "win32" &&
        Boolean(targetPath) &&
        (isExplorerQuery(app) || /^[a-z]:/i.test(app) || /\bdrive\b/i.test(app));
      if (openInExplorer && targetPath) {
        try {
          const opened = await openWindowsFilesystemTarget(targetPath);
          return {
            toolCallId: toolCall.id,
            name: toolCall.name,
            ok: true,
            summary: `Opened ${opened.normalizedPath} in File Explorer.`,
            data: {
              ...receipt(true, "existing"),
              appId: "quick:file-explorer",
              appName: "File Explorer",
              ...this.buildDesktopIntentMetadata(args, {
                targetResolvedApp: "File Explorer",
                verificationRequired: true,
                verificationPassed: true,
              }),
              selector: {
                targetPath: opened.normalizedPath,
              },
              command: opened.command,
            },
            createdAt: nowIso(),
          };
        } catch (error) {
          return fail(toolCall, error instanceof Error ? error.message : String(error));
        }
      }
      const targetAppIntent = canonicalizeAppIntent(args.targetAppIntent || app) || app;
      const existingMatchingWindows = await this.deps
        .listWindows()
        .catch(() => [])
        .then((windows) => windows.filter((window) => windowMatchesAppIntent(window, targetAppIntent)));
      if (existingMatchingWindows.length > 0) {
        const focusedExistingWindow = preferBackgroundOpen
          ? false
          : await this.tryFocusExistingWindowForIntent(targetAppIntent).catch(() => false);
        const activeWindow = preferBackgroundOpen ? null : await this.deps.getActiveWindow().catch(() => null);
        const bestWindow =
          (activeWindow && windowMatchesAppIntent(activeWindow, targetAppIntent) ? activeWindow : null) ||
          existingMatchingWindows[0] ||
          activeWindow;
        const activeAppName = this.resolveRuntimeAppName(bestWindow?.app, targetAppIntent) || String(bestWindow?.app || targetAppIntent);
        const existingSession = this.updateAppSessionFromWindow(targetAppIntent, bestWindow, {
          preExisting: true,
          incrementOpenAttempt: true,
        });
        this.markAppIntentOpened(targetAppIntent);
        return {
          toolCallId: toolCall.id,
          name: toolCall.name,
          ok: true,
          summary: preferBackgroundOpen
            ? `Reused an existing ${targetAppIntent} window in background mode.`
            : focusedExistingWindow
            ? `Focused the existing ${targetAppIntent} window instead of relaunching.`
            : `Reused an existing ${targetAppIntent} window without relaunching.`,
          data: {
            ...receipt(focusedExistingWindow, "existing"),
            appId: `existing:${normalizeAppToken(activeAppName) || normalizeAppToken(targetAppIntent)}`,
            appName: activeAppName,
            windowId: bestWindow?.id,
            windowTitle: bestWindow?.title,
            reusedExistingWindow: true,
            backgroundReused: preferBackgroundOpen,
            ...this.buildDesktopIntentMetadata(
              { ...args, targetAppIntent },
              {
                targetResolvedApp: activeAppName,
                focusRecoveryAttempted: !focusedExistingWindow,
                relaunchAttempt: existingSession.relaunchAttempts,
                relaunchSuppressed: false,
                focusModeApplied:
                  preferBackgroundOpen || !focusedExistingWindow ? "background_safe" : "foreground_lease",
              }
            ),
          },
          createdAt: nowIso(),
        };
      }
      const relaunchDecision = this.getRecoveryLaunchDecision(targetAppIntent);
      if (!relaunchDecision.allowed) {
        const recoverySuppressedReason =
          relaunchDecision.reason || this.buildRecoverySuppressedReason(targetAppIntent, "per_app_limit");
        return failWithData(
          toolCall,
          recoverySuppressedReason,
          this.buildDesktopIntentMetadata(
            { ...args, targetAppIntent },
            {
              targetResolvedApp: targetAppIntent,
              focusRecoveryAttempted: true,
              recoverySuppressedReason,
              relaunchSuppressed: true,
              relaunchSuppressionReason: recoverySuppressedReason,
              relaunchAttempt: relaunchDecision.relaunchAttempt,
            }
          )
        );
      }
      const sessionAfterRelaunch = this.recordRecoveryLaunch(targetAppIntent);
      const foregroundBeforeLaunch = preferBackgroundOpen ? await this.deps.getActiveWindow().catch(() => null) : null;
      const beforeWindows = await withTimeout(this.deps.listWindows().catch(() => []), 900, []);
      const beforeLaunchProcessIds =
        process.platform === "win32" ? await this.captureWindowProcessIds().catch(() => new Set<number>()) : new Set<number>();
      try {
        const launched = await this.machineAutonomyController.launchApp(app);
        const launchedProcessIds =
          process.platform === "win32"
            ? await this.detectNewLaunchProcessIds(beforeLaunchProcessIds, launched.app.name).catch(() => [])
            : [];
        this.trackLaunchedProcesses(launchedProcessIds);
        const launchedWindow = await this.detectLaunchedWindowTarget(beforeWindows, targetAppIntent);
        this.rememberLaunchedWindowTarget(targetAppIntent, launchedWindow);
        this.updateAppSessionFromWindow(targetAppIntent, launchedWindow, {
          runLaunched: true,
        });
        let backgroundFocusRestored = false;
        if (
          preferBackgroundOpen &&
          foregroundBeforeLaunch &&
          !windowMatchesAppIntent(foregroundBeforeLaunch, targetAppIntent)
        ) {
          try {
            await this.deps.focusWindow({
              title: foregroundBeforeLaunch.title || undefined,
              app: foregroundBeforeLaunch.app || undefined,
            });
            backgroundFocusRestored = true;
          } catch {
            backgroundFocusRestored = false;
          }
        }
        this.markAppIntentOpened(targetAppIntent);
        return {
          toolCallId: toolCall.id,
          name: toolCall.name,
          ok: true,
          summary:
            preferBackgroundOpen && backgroundFocusRestored
              ? `${launched.summary} Restored your previous window focus.`
              : launched.summary,
          data: {
            ...receipt(!preferBackgroundOpen && decision?.executionVisibility === "visible_required", "none"),
            appId: launched.app.id,
            appName: launched.app.name,
            aliases: launched.app.aliases,
            source: launched.app.source,
            backgroundFocusRestored,
            ...this.buildDesktopIntentMetadata(args, {
              targetResolvedApp: launched.app.name,
              focusRecoveryAttempted: true,
              relaunchAttempt: sessionAfterRelaunch.relaunchAttempts || relaunchDecision.relaunchAttempt,
              relaunchSuppressed: false,
              focusModeApplied: preferBackgroundOpen ? "background_safe" : "foreground_lease",
            }),
            command: launched.command,
            trackedProcessIds: launchedProcessIds,
            autoCloseOnRunEnd: this.shouldAutoCloseLaunchedApps(),
          },
          createdAt: launched.createdAt,
        };
      } catch (error) {
        return failWithData(
          toolCall,
          error instanceof Error ? error.message : String(error),
          this.buildDesktopIntentMetadata(
            { ...args, targetAppIntent },
            {
              targetResolvedApp: targetAppIntent,
              focusRecoveryAttempted: true,
              relaunchAttempt: sessionAfterRelaunch.relaunchAttempts || relaunchDecision.relaunchAttempt,
            }
          )
        );
      }
    }

    if (toolCall.name === "desktop_open_url") {
      if (!this.policy.enabled || !this.policy.allowUrlOpen) {
        return fail(toolCall, "Binary Host blocked desktop_open_url because URL autonomy is disabled.", true);
      }
      const url = String(args.url || args.path || args.target || "").trim();
      if (!url) return fail(toolCall, "desktop_open_url requires a URL.");
      try {
        const localPath = process.platform === "win32" ? normalizeWindowsFilesystemTarget(url) : null;
        const command = await openUrl(url);
        return {
          toolCallId: toolCall.id,
          name: toolCall.name,
          ok: true,
          summary: localPath
            ? `Opened ${localPath} in File Explorer.`
            : `Opened ${url} in the default browser.`,
          data: { ...receipt(true, "existing"), url, command, ...(localPath ? { targetPath: localPath } : {}) },
          createdAt: nowIso(),
        };
      } catch (error) {
        return fail(toolCall, error instanceof Error ? error.message : String(error));
      }
    }

    if (toolCall.name === "desktop_list_windows") {
      if (!this.policy.enabled || !this.policy.allowDesktopObservation) {
        return fail(toolCall, "Binary Host blocked desktop_list_windows because desktop observation is disabled.", true);
      }
      try {
        const windows = await listWindows();
        return {
          toolCallId: toolCall.id,
          name: toolCall.name,
          ok: true,
          summary: `Observed ${windows.length} visible desktop window(s).`,
          data: { ...receipt(false, "none"), windows },
          createdAt: nowIso(),
        };
      } catch (error) {
        return fail(toolCall, error instanceof Error ? error.message : String(error));
      }
    }

    if (toolCall.name === "desktop_get_active_window") {
      if (!this.policy.enabled || !this.policy.allowDesktopObservation) {
        return fail(toolCall, "Binary Host blocked desktop_get_active_window because desktop observation is disabled.", true);
      }
      try {
        const activeWindow = await getActiveWindow();
        return {
          toolCallId: toolCall.id,
          name: toolCall.name,
          ok: true,
          summary: activeWindow
            ? `Observed active window ${activeWindow.title}.`
            : "No active window could be resolved.",
          data: { ...receipt(false, "none"), activeWindow },
          createdAt: nowIso(),
        };
      } catch (error) {
        return fail(toolCall, error instanceof Error ? error.message : String(error));
      }
    }

    if (toolCall.name === "desktop_focus_window") {
      if (!this.policy.enabled || !this.policy.allowWholeMachineAccess) {
        return fail(toolCall, "Binary Host blocked desktop_focus_window because machine autonomy is disabled.", true);
      }
      try {
        const command = await this.deps.focusWindow({
          windowId: typeof args.windowId === "string" ? args.windowId : undefined,
          title: typeof args.title === "string" ? args.title : undefined,
          app: typeof args.app === "string" ? args.app : undefined,
        });
        return {
          toolCallId: toolCall.id,
          name: toolCall.name,
          ok: true,
          summary: "Focused the requested desktop window.",
          data: { ...receipt(true, "existing"), command },
          createdAt: nowIso(),
        };
      } catch (error) {
        return fail(toolCall, error instanceof Error ? error.message : String(error));
      }
    }

    if (toolCall.name === "desktop_query_controls") {
      if (!this.policy.enabled || !this.policy.allowWholeMachineAccess) {
        return fail(toolCall, "Binary Host blocked desktop_query_controls because machine autonomy is disabled.", true);
      }
      const runtime = await this.ensureNativeRuntimeAvailable(toolCall);
      if (!isNativeRuntime(runtime)) return runtime;
      try {
        const queryResult = await runtime.queryControls({
          sessionId: typeof args.sessionId === "string" ? args.sessionId : undefined,
          app: typeof args.app === "string" ? args.app : undefined,
          title: typeof args.title === "string" ? args.title : undefined,
          windowId: sanitizeNativeWindowId(args.windowId),
          query: typeof args.query === "string" ? args.query : undefined,
          selector: asSelector(args.selector),
          limit: Number.isFinite(Number(args.limit)) ? Number(args.limit) : undefined,
        });
        return this.buildNativeResult(
          toolCall,
          `Observed ${queryResult.controls.length} semantic native app control(s).`,
          {
            ...receipt(queryResult.focusStolen === true, "existing"),
            sessionId: queryResult.sessionId,
            appName: queryResult.appName,
            windowId: queryResult.windowId,
            windowTitle: queryResult.windowTitle,
            adapterId: queryResult.adapterId,
            controls: queryResult.controls,
            confidence: queryResult.confidence,
            fallbackMode: queryResult.fallbackMode,
            focusStolen: queryResult.focusStolen === true,
          }
        );
      } catch (error) {
        return fail(toolCall, error instanceof Error ? error.message : String(error));
      }
    }

    if (toolCall.name === "desktop_read_control") {
      if (!this.policy.enabled || !this.policy.allowDesktopObservation) {
        return fail(toolCall, "Binary Host blocked desktop_read_control because desktop observation is disabled.", true);
      }
      const runtime = await this.ensureNativeRuntimeAvailable(toolCall);
      if (!isNativeRuntime(runtime)) return runtime;
      try {
        const queryText = String(args.query || "").toLowerCase();
        const inferredReadTarget =
          this.resolveTargetAppIntent(args) ||
          (/\bresult\b|\bdisplay\b|\bcalculation\b|\banswer\b/i.test(queryText) ? "Calculator" : undefined) ||
          (/\bcalculator|calc\b/i.test(String(this.task || "")) ? "Calculator" : undefined) ||
          (/\bnotepad|draft|editor\b/i.test(String(this.task || "")) ? "Notepad" : undefined);
        const resolvedSession = this.findAppSession(inferredReadTarget || args.app);
        const baseReadArgs = {
          sessionId: typeof args.sessionId === "string" ? args.sessionId : undefined,
          app: this.resolveRuntimeAppName(args.app, inferredReadTarget, resolvedSession?.appName),
          title:
            typeof args.title === "string"
              ? args.title
              : typeof resolvedSession?.windowTitle === "string"
                ? resolvedSession.windowTitle
                : undefined,
          windowId:
            sanitizeNativeWindowId(args.windowId) ||
            (resolvedSession?.windowId ? sanitizeNativeWindowId(resolvedSession.windowId) : undefined),
          query: typeof args.query === "string" ? args.query : undefined,
          selector: asSelector(args.selector),
        };
        const result = await runtime.readControl(baseReadArgs).catch(async (error) => {
          if (!inferredReadTarget || !isWindowResolutionError(error)) throw error;
          const recoveredFocus = await this.enforceWindowTarget(
            toolCall,
            { ...args, targetAppIntent: inferredReadTarget },
            { preferBackground: true }
          );
          if (!recoveredFocus.ok) {
            throw new Error(recoveredFocus.message || "Binary Host could not recover the intended app window for readback.");
          }
          return await runtime.readControl({
            ...baseReadArgs,
            app: this.resolveRuntimeAppName(
              baseReadArgs.app,
              recoveredFocus.targetResolvedApp,
              recoveredFocus.targetAppIntent,
              inferredReadTarget
            ),
            title: recoveredFocus.targetWindowTitle || baseReadArgs.title,
          });
        });
        const verificationRequired = args.verificationRequired === true;
        const targetIntent = this.resolveTargetAppIntent(args) || inferredReadTarget;
        let verificationPassed =
          verificationRequired &&
          (Boolean(result.matchedControl) ||
            (result.value && Object.keys(result.value).length > 0));
        if (verificationRequired && canonicalizeAppIntent(targetIntent) === "Calculator") {
          const expected = inferExpectedCalculatorResultFromTask(this.task);
          if (expected) {
            const valueText =
              result.value && typeof result.value.text === "string"
                ? result.value.text
                : result.matchedControl && typeof result.matchedControl.textPreview === "string"
                  ? result.matchedControl.textPreview
                  : "";
            verificationPassed = textIncludesNumericToken(String(valueText || ""), expected);
          }
        }
        const proofArtifacts: string[] = [];
        if (verificationPassed) {
          const resolvedTarget = canonicalizeAppIntent(result.appName || targetIntent || "");
          if (resolvedTarget === "Calculator") {
            this.recordProofArtifact(resolvedTarget, "calculator_readback");
            proofArtifacts.push("calculator_readback");
          } else if (resolvedTarget === "Notepad") {
            this.recordProofArtifact(resolvedTarget, "notepad_readback");
            proofArtifacts.push("notepad_readback");
          } else if (resolvedTarget === "File Explorer") {
            this.recordProofArtifact(resolvedTarget, "explorer_navigation_readback");
            proofArtifacts.push("explorer_navigation_readback");
          } else if (resolvedTarget) {
            this.recordProofArtifact(resolvedTarget, "desktop_readback");
            proofArtifacts.push("desktop_readback");
          }
        }
        return this.buildNativeResult(
          toolCall,
          `Read the requested native app control${result.windowTitle ? ` in ${result.windowTitle}` : ""}.`,
          {
            ...receipt(false, "existing"),
            sessionId: result.sessionId,
            appName: result.appName,
            windowId: result.windowId,
            windowTitle: result.windowTitle,
            selector: result.selector,
            matchedControl: result.matchedControl,
            controlType:
              result.matchedControl && typeof result.matchedControl.controlType === "string"
                ? result.matchedControl.controlType
                : undefined,
            confidence: result.confidence,
            fallbackMode: result.fallbackMode,
            focusStolen: result.focusStolen === true,
            value: result.value,
            ...this.buildDesktopIntentMetadata(args, {
              targetResolvedApp: result.appName,
              verificationRequired,
              verificationPassed,
              ...(proofArtifacts.length > 0 ? { proofArtifacts } : {}),
            }),
          }
        );
      } catch (error) {
        return fail(toolCall, error instanceof Error ? error.message : String(error));
      }
    }

    if (toolCall.name === "desktop_invoke_control") {
      if (!this.policy.enabled || !this.policy.allowWholeMachineAccess) {
        return fail(toolCall, "Binary Host blocked desktop_invoke_control because machine autonomy is disabled.", true);
      }
      if (this.shouldBlockIrreversibleAction(toolCall, args)) {
        return fail(
          toolCall,
          "Binary Host blocked an irreversible native app action. Ask the user to confirm the send/submit/delete action explicitly or reissue the tool call with confirm=true once the task clearly authorizes it.",
          true
        );
      }
      const preferBackground = this.shouldPreferBackgroundExecution(args);
      const focusGuard = await this.enforceWindowTarget(toolCall, args, { preferBackground });
      if (!focusGuard.ok) {
        const focusGuardMetadata = await this.releaseForegroundLeaseIfNeeded(focusGuard);
        return failWithData(
          toolCall,
          focusGuard.message || "Binary Host could not focus the intended app window.",
          this.buildDesktopIntentMetadata(args, {
            ...focusGuardMetadata,
            verificationRequired: true,
            verificationPassed: false,
          })
        );
      }
      const runtime = await this.ensureNativeRuntimeAvailable(toolCall);
      if (!isNativeRuntime(runtime)) {
        await this.releaseForegroundLeaseIfNeeded(focusGuard);
        return runtime;
      }
      try {
        const result = await runtime.invokeControl({
          sessionId: typeof args.sessionId === "string" ? args.sessionId : undefined,
          app: this.resolveRuntimeAppName(args.app, focusGuard.targetAppIntent, focusGuard.targetResolvedApp),
          title: typeof args.title === "string" ? args.title : focusGuard.targetWindowTitle,
          windowId: sanitizeNativeWindowId(args.windowId),
          query: typeof args.query === "string" ? args.query : undefined,
          selector: asSelector(args.selector),
          allowBackground: preferBackground,
        });
        return this.buildNativeResult(
          toolCall,
          "Invoked the requested native app control.",
          {
            ...receipt(result.focusStolen === true, "existing"),
            sessionId: result.sessionId,
            appName: result.appName,
            windowId: result.windowId,
            windowTitle: result.windowTitle,
            selector: result.selector,
            matchedControl: result.matchedControl,
            controlType:
              result.matchedControl && typeof result.matchedControl.controlType === "string"
                ? result.matchedControl.controlType
                : undefined,
            confidence: result.confidence,
            fallbackMode: result.fallbackMode,
            focusStolen: result.focusStolen === true,
            ...this.buildDesktopIntentMetadata(args, {
              ...(await this.releaseForegroundLeaseIfNeeded(focusGuard)),
              targetResolvedApp: result.appName || focusGuard.targetResolvedApp,
              verificationRequired: true,
              verificationPassed: false,
            }),
          }
        );
      } catch (error) {
        const focusGuardMetadata = await this.releaseForegroundLeaseIfNeeded(focusGuard);
        return failWithData(
          toolCall,
          error instanceof Error ? error.message : String(error),
          this.buildDesktopIntentMetadata(args, {
            ...focusGuardMetadata,
            verificationRequired: true,
            verificationPassed: false,
          })
        );
      }
    }

    if (toolCall.name === "desktop_type_into_control") {
      if (!this.policy.enabled || !this.policy.allowWholeMachineAccess) {
        return fail(toolCall, "Binary Host blocked desktop_type_into_control because machine autonomy is disabled.", true);
      }
      if (this.shouldBlockIrreversibleAction(toolCall, args)) {
        return fail(
          toolCall,
          "Binary Host blocked a native app typing step because it looks like an irreversible send/submit action without explicit authorization.",
          true
        );
      }
      const text = String(args.text || "");
      if (!text) return fail(toolCall, "desktop_type_into_control requires text.");
      const inferredTypingTarget =
        this.resolveTargetAppIntent(args) ||
        (/\bnotepad\b/i.test(String(this.task || "")) || /\bdraft\b/i.test(String(this.task || "")) ? "Notepad" : undefined);
      const guardedArgs = inferredTypingTarget ? { ...args, targetAppIntent: inferredTypingTarget } : args;
      const preferBackground = this.shouldPreferBackgroundExecution(guardedArgs);
      const focusGuard = await this.enforceWindowTarget(toolCall, guardedArgs, { preferBackground });
      if (!focusGuard.ok) {
        const focusGuardMetadata = await this.releaseForegroundLeaseIfNeeded(focusGuard);
        return failWithData(
          toolCall,
          focusGuard.message || "Binary Host could not focus the intended app window.",
          this.buildDesktopIntentMetadata(guardedArgs, {
            ...focusGuardMetadata,
            verificationRequired: true,
            verificationPassed: false,
          })
        );
      }
      const runtime = await this.ensureNativeRuntimeAvailable(toolCall);
      if (!isNativeRuntime(runtime)) {
        await this.releaseForegroundLeaseIfNeeded(focusGuard);
        return runtime;
      }
      try {
        let verificationPassed = false;
        const proofArtifacts: string[] = [];
        const callArgs = {
          sessionId: typeof args.sessionId === "string" ? args.sessionId : undefined,
          app: this.resolveRuntimeAppName(args.app, focusGuard.targetAppIntent, focusGuard.targetResolvedApp, inferredTypingTarget),
          title: typeof args.title === "string" ? args.title : focusGuard.targetWindowTitle,
          windowId: sanitizeNativeWindowId(args.windowId),
          query: typeof args.query === "string" ? args.query : undefined,
          selector: asSelector(args.selector),
          text,
          append: args.append === true,
          allowBackground: preferBackground,
        };
        let result = await runtime.typeIntoControl(callArgs).catch(async (error) => {
          const errorMessage = String(error instanceof Error ? error.message : error || "");
          const normalizedError = errorMessage.toLowerCase();
          if (
            preferBackground &&
            (normalizedError.includes("background typing is unsupported") ||
              normalizedError.includes("an event was unable to invoke any of the subscribers"))
          ) {
            const recoveredForeground = await this.enforceWindowTarget(toolCall, guardedArgs, {
              preferBackground: false,
            });
            if (!recoveredForeground.ok) {
              throw new Error(
                recoveredForeground.message || "Binary Host could not recover foreground focus for typing."
              );
            }
            try {
              return await runtime.typeIntoControl({
                ...callArgs,
                app: recoveredForeground.targetResolvedApp || callArgs.app,
                title: recoveredForeground.targetWindowTitle || callArgs.title,
                windowId: callArgs.windowId,
                allowBackground: false,
              });
            } finally {
              await this.releaseForegroundLeaseIfNeeded(recoveredForeground);
            }
          }
          const targetAppIntent = this.resolveTargetAppIntent(guardedArgs);
          if (!targetAppIntent || !isWindowResolutionError(error)) throw error;
          const recoveredFocus = await this.enforceWindowTarget(toolCall, guardedArgs, { preferBackground });
          if (!recoveredFocus.ok) {
            throw new Error(recoveredFocus.message || "Binary Host could not recover the intended app focus.");
          }
          try {
            const recoveredCallArgs = {
              ...callArgs,
              app: this.resolveRuntimeAppName(
                callArgs.app,
                recoveredFocus.targetResolvedApp,
                recoveredFocus.targetAppIntent,
                inferredTypingTarget
              ),
              title: recoveredFocus.targetWindowTitle || callArgs.title,
            };
            return await runtime.typeIntoControl(recoveredCallArgs);
          } finally {
            await this.releaseForegroundLeaseIfNeeded(recoveredFocus);
          }
        });
        const resolvedTypingApp = canonicalizeAppIntent(
          result.appName || inferredTypingTarget || focusGuard.targetAppIntent || guardedArgs.app
        );
        if (resolvedTypingApp === "Notepad") {
          const readBack = await runtime
            .readControl({
              sessionId: result.sessionId,
              app: result.appName || "Notepad",
              windowId: result.windowId,
              title: result.windowTitle,
              query: "editor text",
            })
            .catch(() => null);
          const readText = String(readBack?.value?.text || readBack?.matchedControl?.textPreview || "");
          verificationPassed = textIncludesSnippet(readText, text);
          if (verificationPassed) {
            this.recordProofArtifact("Notepad", "notepad_readback");
            proofArtifacts.push("notepad_readback");
          }
        }
        return this.buildNativeResult(
          toolCall,
          `Typed into the requested native app control${result.windowTitle ? ` in ${result.windowTitle}` : ""}.`,
          {
            ...receipt(result.focusStolen === true, "existing"),
            sessionId: result.sessionId,
            appName: result.appName,
            windowId: result.windowId,
            windowTitle: result.windowTitle,
            selector: result.selector,
            matchedControl: result.matchedControl,
            controlType:
              result.matchedControl && typeof result.matchedControl.controlType === "string"
                ? result.matchedControl.controlType
                : undefined,
            confidence: result.confidence,
            fallbackMode: result.fallbackMode,
            focusStolen: result.focusStolen === true,
            ...this.buildDesktopIntentMetadata(guardedArgs, {
              ...(await this.releaseForegroundLeaseIfNeeded(focusGuard)),
              targetResolvedApp: result.appName || focusGuard.targetResolvedApp,
              verificationRequired: true,
              verificationPassed,
              ...(proofArtifacts.length > 0 ? { proofArtifacts } : {}),
            }),
          }
        );
      } catch (error) {
        const focusGuardMetadata = await this.releaseForegroundLeaseIfNeeded(focusGuard);
        return failWithData(
          toolCall,
          error instanceof Error ? error.message : String(error),
          this.buildDesktopIntentMetadata(guardedArgs, {
            ...focusGuardMetadata,
            verificationRequired: true,
            verificationPassed: false,
          })
        );
      }
    }

    if (toolCall.name === "desktop_select_control_option") {
      if (!this.policy.enabled || !this.policy.allowWholeMachineAccess) {
        return fail(toolCall, "Binary Host blocked desktop_select_control_option because machine autonomy is disabled.", true);
      }
      const optionText = String(args.optionText || args.option || "").trim();
      if (!optionText) return fail(toolCall, "desktop_select_control_option requires optionText.");
      const preferBackground = this.shouldPreferBackgroundExecution(args);
      const focusGuard = await this.enforceWindowTarget(toolCall, args, { preferBackground });
      if (!focusGuard.ok) {
        const focusGuardMetadata = await this.releaseForegroundLeaseIfNeeded(focusGuard);
        return failWithData(
          toolCall,
          focusGuard.message || "Binary Host could not focus the intended app window.",
          this.buildDesktopIntentMetadata(args, {
            ...focusGuardMetadata,
            verificationRequired: true,
            verificationPassed: false,
          })
        );
      }
      const runtime = await this.ensureNativeRuntimeAvailable(toolCall);
      if (!isNativeRuntime(runtime)) {
        await this.releaseForegroundLeaseIfNeeded(focusGuard);
        return runtime;
      }
      try {
        const result = await runtime.selectOption({
          sessionId: typeof args.sessionId === "string" ? args.sessionId : undefined,
          app: this.resolveRuntimeAppName(args.app, focusGuard.targetAppIntent, focusGuard.targetResolvedApp),
          title: typeof args.title === "string" ? args.title : focusGuard.targetWindowTitle,
          windowId: sanitizeNativeWindowId(args.windowId),
          query: typeof args.query === "string" ? args.query : undefined,
          selector: asSelector(args.selector),
          optionText,
          allowBackground: preferBackground,
        });
        return this.buildNativeResult(
          toolCall,
          `Selected ${optionText} in the requested native app control.`,
          {
            ...receipt(result.focusStolen === true, "existing"),
            sessionId: result.sessionId,
            appName: result.appName,
            windowId: result.windowId,
            windowTitle: result.windowTitle,
            selector: result.selector,
            matchedControl: result.matchedControl,
            controlType:
              result.matchedControl && typeof result.matchedControl.controlType === "string"
                ? result.matchedControl.controlType
                : undefined,
            confidence: result.confidence,
            fallbackMode: result.fallbackMode,
            focusStolen: result.focusStolen === true,
            ...this.buildDesktopIntentMetadata(args, {
              ...(await this.releaseForegroundLeaseIfNeeded(focusGuard)),
              targetResolvedApp: result.appName || focusGuard.targetResolvedApp,
              verificationRequired: true,
              verificationPassed: false,
            }),
          }
        );
      } catch (error) {
        const focusGuardMetadata = await this.releaseForegroundLeaseIfNeeded(focusGuard);
        return failWithData(
          toolCall,
          error instanceof Error ? error.message : String(error),
          this.buildDesktopIntentMetadata(args, {
            ...focusGuardMetadata,
            verificationRequired: true,
            verificationPassed: false,
          })
        );
      }
    }

    if (toolCall.name === "desktop_toggle_control") {
      if (!this.policy.enabled || !this.policy.allowWholeMachineAccess) {
        return fail(toolCall, "Binary Host blocked desktop_toggle_control because machine autonomy is disabled.", true);
      }
      const preferBackground = this.shouldPreferBackgroundExecution(args);
      const focusGuard = await this.enforceWindowTarget(toolCall, args, { preferBackground });
      if (!focusGuard.ok) {
        const focusGuardMetadata = await this.releaseForegroundLeaseIfNeeded(focusGuard);
        return failWithData(
          toolCall,
          focusGuard.message || "Binary Host could not focus the intended app window.",
          this.buildDesktopIntentMetadata(args, {
            ...focusGuardMetadata,
            verificationRequired: true,
            verificationPassed: false,
          })
        );
      }
      const runtime = await this.ensureNativeRuntimeAvailable(toolCall);
      if (!isNativeRuntime(runtime)) {
        await this.releaseForegroundLeaseIfNeeded(focusGuard);
        return runtime;
      }
      try {
        const result = await runtime.toggleControl({
          sessionId: typeof args.sessionId === "string" ? args.sessionId : undefined,
          app: this.resolveRuntimeAppName(args.app, focusGuard.targetAppIntent, focusGuard.targetResolvedApp),
          title: typeof args.title === "string" ? args.title : focusGuard.targetWindowTitle,
          windowId: sanitizeNativeWindowId(args.windowId),
          query: typeof args.query === "string" ? args.query : undefined,
          selector: asSelector(args.selector),
          desiredState: typeof args.desiredState === "boolean" ? args.desiredState : undefined,
          allowBackground: preferBackground,
        });
        return this.buildNativeResult(
          toolCall,
          result.changed === false ? "The requested native app control was already in the desired state." : "Toggled the requested native app control.",
          {
            ...receipt(result.focusStolen === true, "existing"),
            sessionId: result.sessionId,
            appName: result.appName,
            windowId: result.windowId,
            windowTitle: result.windowTitle,
            selector: result.selector,
            matchedControl: result.matchedControl,
            controlType:
              result.matchedControl && typeof result.matchedControl.controlType === "string"
                ? result.matchedControl.controlType
                : undefined,
            confidence: result.confidence,
            fallbackMode: result.fallbackMode,
            focusStolen: result.focusStolen === true,
            changed: result.changed === true,
            ...this.buildDesktopIntentMetadata(args, {
              ...(await this.releaseForegroundLeaseIfNeeded(focusGuard)),
              targetResolvedApp: result.appName || focusGuard.targetResolvedApp,
              verificationRequired: true,
              verificationPassed: false,
            }),
          }
        );
      } catch (error) {
        const focusGuardMetadata = await this.releaseForegroundLeaseIfNeeded(focusGuard);
        return failWithData(
          toolCall,
          error instanceof Error ? error.message : String(error),
          this.buildDesktopIntentMetadata(args, {
            ...focusGuardMetadata,
            verificationRequired: true,
            verificationPassed: false,
          })
        );
      }
    }

    if (toolCall.name === "desktop_send_shortcut") {
      if (!this.policy.enabled || !this.policy.allowWholeMachineAccess) {
        return fail(toolCall, "Binary Host blocked desktop_send_shortcut because machine autonomy is disabled.", true);
      }
      if (this.shouldBlockIrreversibleAction(toolCall, args)) {
        return fail(
          toolCall,
          "Binary Host blocked a potentially irreversible native app shortcut without explicit authorization.",
          true
        );
      }
      const keys = String(args.keys || "").trim();
      if (!keys) return fail(toolCall, "desktop_send_shortcut requires keys.");
      const shortcutMathExpression = inferExpectedCalculatorResultFromShortcutKeys(keys);
      const inferredShortcutTarget =
        this.resolveTargetAppIntent(args) ||
        (shortcutMathExpression ? "Calculator" : undefined) ||
        (/\bcalculator|calc\b/i.test(String(this.task || "")) ? "Calculator" : undefined);
      const guardedArgs = inferredShortcutTarget ? { ...args, targetAppIntent: inferredShortcutTarget } : args;
      const targetAppIntent = this.resolveTargetAppIntent(guardedArgs);
      const calculatorShortcutIntent = canonicalizeAppIntent(targetAppIntent || guardedArgs.app) === "Calculator";
      const preferBackground = this.shouldPreferBackgroundExecution(guardedArgs);
      const focusGuard = await this.enforceWindowTarget(toolCall, guardedArgs, { preferBackground });
      if (!focusGuard.ok && !calculatorShortcutIntent) {
        const focusGuardMetadata = await this.releaseForegroundLeaseIfNeeded(focusGuard);
        return failWithData(
          toolCall,
          focusGuard.message || "Binary Host could not focus the intended app window.",
          this.buildDesktopIntentMetadata(guardedArgs, {
            ...focusGuardMetadata,
            verificationRequired: true,
            verificationPassed: false,
          })
        );
      }
      const resolvedGuardedArgs: Record<string, unknown> = {
        ...guardedArgs,
        ...(focusGuard.targetWindowTitle ? { title: focusGuard.targetWindowTitle } : {}),
        ...(focusGuard.targetResolvedApp ? { app: focusGuard.targetResolvedApp } : {}),
      };
      const shortcutSession = this.findAppSession(focusGuard.targetAppIntent || resolvedGuardedArgs.app);
      const runtime = await this.ensureNativeRuntimeAvailable(toolCall);
      if (!isNativeRuntime(runtime)) {
        await this.releaseForegroundLeaseIfNeeded(focusGuard);
        return runtime;
      }
      try {
        let callArgs = {
          sessionId: typeof resolvedGuardedArgs.sessionId === "string" ? resolvedGuardedArgs.sessionId : undefined,
          app: this.resolveRuntimeAppName(
            resolvedGuardedArgs.app,
            focusGuard.targetAppIntent,
            focusGuard.targetResolvedApp,
            inferredShortcutTarget,
            shortcutSession?.appName
          ),
          title:
            typeof resolvedGuardedArgs.title === "string"
              ? resolvedGuardedArgs.title
              : typeof shortcutSession?.windowTitle === "string"
                ? shortcutSession.windowTitle
                : undefined,
          windowId:
            typeof resolvedGuardedArgs.windowId === "string"
              ? resolvedGuardedArgs.windowId
              : typeof resolvedGuardedArgs.windowId === "number"
                ? String(resolvedGuardedArgs.windowId)
                : undefined,
          keys,
          allowBackground: preferBackground,
          timeoutMs: calculatorShortcutIntent ? CALCULATOR_SHORTCUT_TIMEOUT_MS : undefined,
        };
        if (calculatorShortcutIntent && !callArgs.sessionId) {
          const bootstrap = await runtime
            .readControl({
              app: "Calculator",
              query: "result display",
              timeoutMs: CALCULATOR_READBACK_TIMEOUT_MS,
            })
            .catch(() => null);
          if (bootstrap) {
            callArgs = {
              ...callArgs,
              sessionId: bootstrap.sessionId,
              app: bootstrap.appName || callArgs.app || "Calculator",
              title: bootstrap.windowTitle || callArgs.title,
              windowId: bootstrap.windowId || callArgs.windowId,
            };
          }
        }
        let backgroundFallbackFocusLeaseRestored: boolean | undefined;
        let backgroundFallbackForegroundLeaseMs: number | undefined;
        const runShortcut = async () =>
          await runtime.sendShortcut(callArgs).catch(async (error) => {
            if (calculatorShortcutIntent) {
              const invoked = await invokeCalculatorExpressionViaControls(runtime, keys, {
                sessionId: callArgs.sessionId,
                app: callArgs.app || "Calculator",
                title: callArgs.title,
                windowId: callArgs.windowId,
                allowBackground: preferBackground,
              });
              if (invoked) {
                return {
                  ...invoked,
                  fallbackMode: "calculator_control_invoke",
                  keys,
                };
              }
              const sentViaWindows = await this.sendWindowsShortcutWithBackgroundRecovery(
                keys,
                callArgs.app || "Calculator",
                preferBackground
              );
              if (sentViaWindows.sent) {
                if (typeof sentViaWindows.focusLeaseRestored === "boolean") {
                  backgroundFallbackFocusLeaseRestored = sentViaWindows.focusLeaseRestored;
                }
                if (typeof sentViaWindows.foregroundLeaseMs === "number") {
                  backgroundFallbackForegroundLeaseMs = Math.max(
                    backgroundFallbackForegroundLeaseMs || 0,
                    sentViaWindows.foregroundLeaseMs
                  );
                }
                return {
                  sessionId: callArgs.sessionId || "calculator-sendkeys",
                  appName: this.resolveRuntimeAppName(callArgs.app, "Calculator") || "Calculator",
                  windowId: callArgs.windowId || undefined,
                  windowTitle: callArgs.title || undefined,
                  confidence: 0.55,
                  focusStolen: sentViaWindows.focusStolen,
                  fallbackMode: "windows_sendkeys",
                  keys,
                };
              }
              const relaunchDecision = this.getRecoveryLaunchDecision("Calculator");
              if (relaunchDecision.allowed) {
                this.recordRecoveryLaunch("Calculator", null);
                await this.launchAppForRecovery("Calculator").catch(() => undefined);
                const sentAfterRelaunch = await this.sendWindowsShortcutWithBackgroundRecovery(
                  keys,
                  "Calculator",
                  preferBackground
                );
                if (sentAfterRelaunch.sent) {
                  if (typeof sentAfterRelaunch.focusLeaseRestored === "boolean") {
                    backgroundFallbackFocusLeaseRestored = sentAfterRelaunch.focusLeaseRestored;
                  }
                  if (typeof sentAfterRelaunch.foregroundLeaseMs === "number") {
                    backgroundFallbackForegroundLeaseMs = Math.max(
                      backgroundFallbackForegroundLeaseMs || 0,
                      sentAfterRelaunch.foregroundLeaseMs
                    );
                  }
                  return {
                    sessionId: callArgs.sessionId || "calculator-sendkeys",
                    appName: "Calculator",
                    windowId: callArgs.windowId || undefined,
                    windowTitle: callArgs.title || undefined,
                    confidence: 0.55,
                    focusStolen: sentAfterRelaunch.focusStolen,
                    fallbackMode: "windows_sendkeys",
                    keys,
                  };
                }
              }
            }
            if (!targetAppIntent || !isWindowResolutionError(error)) throw error;
            const recoveredFocus = await this.enforceWindowTarget(toolCall, guardedArgs, { preferBackground });
            if (!recoveredFocus.ok && !calculatorShortcutIntent) {
              throw new Error(recoveredFocus.message || "Binary Host could not recover the intended app focus.");
            }
            if (calculatorShortcutIntent && !recoveredFocus.ok) {
              const invoked = await invokeCalculatorExpressionViaControls(runtime, keys, {
                app: "Calculator",
                allowBackground: preferBackground,
              });
              if (invoked) {
                return {
                  ...invoked,
                  fallbackMode: "calculator_control_invoke",
                  keys,
                };
              }
              const sentViaWindows = await this.sendWindowsShortcutWithBackgroundRecovery(
                keys,
                "Calculator",
                preferBackground
              );
              if (sentViaWindows.sent) {
                if (typeof sentViaWindows.focusLeaseRestored === "boolean") {
                  backgroundFallbackFocusLeaseRestored = sentViaWindows.focusLeaseRestored;
                }
                if (typeof sentViaWindows.foregroundLeaseMs === "number") {
                  backgroundFallbackForegroundLeaseMs = Math.max(
                    backgroundFallbackForegroundLeaseMs || 0,
                    sentViaWindows.foregroundLeaseMs
                  );
                }
                return {
                  sessionId: callArgs.sessionId || "calculator-sendkeys",
                  appName: "Calculator",
                  windowId: callArgs.windowId || undefined,
                  windowTitle: callArgs.title || undefined,
                  confidence: 0.55,
                  focusStolen: sentViaWindows.focusStolen,
                  fallbackMode: "windows_sendkeys",
                  keys,
                };
              }
              const relaunchDecision = this.getRecoveryLaunchDecision("Calculator");
              if (relaunchDecision.allowed) {
                this.recordRecoveryLaunch("Calculator", null);
                await this.launchAppForRecovery("Calculator").catch(() => undefined);
                const sentAfterRelaunch = await this.sendWindowsShortcutWithBackgroundRecovery(
                  keys,
                  "Calculator",
                  preferBackground
                );
                if (sentAfterRelaunch.sent) {
                  if (typeof sentAfterRelaunch.focusLeaseRestored === "boolean") {
                    backgroundFallbackFocusLeaseRestored = sentAfterRelaunch.focusLeaseRestored;
                  }
                  if (typeof sentAfterRelaunch.foregroundLeaseMs === "number") {
                    backgroundFallbackForegroundLeaseMs = Math.max(
                      backgroundFallbackForegroundLeaseMs || 0,
                      sentAfterRelaunch.foregroundLeaseMs
                    );
                  }
                  return {
                    sessionId: callArgs.sessionId || "calculator-sendkeys",
                    appName: "Calculator",
                    windowId: callArgs.windowId || undefined,
                    windowTitle: callArgs.title || undefined,
                    confidence: 0.55,
                    focusStolen: sentAfterRelaunch.focusStolen,
                    fallbackMode: "windows_sendkeys",
                    keys,
                  };
                }
              }
              throw new Error(recoveredFocus.message || "Binary Host could not recover the intended app focus.");
            }
            try {
              const recoveredCallArgs = {
                ...callArgs,
                app: this.resolveRuntimeAppName(
                  callArgs.app,
                  recoveredFocus.targetResolvedApp,
                  recoveredFocus.targetAppIntent,
                  targetAppIntent
                ),
                title: recoveredFocus.targetWindowTitle || callArgs.title,
              };
              return await runtime.sendShortcut(recoveredCallArgs);
            } finally {
              await this.releaseForegroundLeaseIfNeeded(recoveredFocus);
            }
          });

        let result =
          calculatorShortcutIntent
            ? (await invokeCalculatorExpressionViaControls(runtime, keys, {
                sessionId: callArgs.sessionId,
                app: callArgs.app || "Calculator",
                title: callArgs.title,
                windowId: callArgs.windowId,
                allowBackground: preferBackground,
              }).then((invoked) =>
                invoked
                  ? {
                      ...invoked,
                      fallbackMode: "calculator_control_invoke",
                      keys,
                    }
                  : null
              )) || (await runShortcut())
            : await runShortcut();
        let fallbackMode = result.fallbackMode;
        let verificationPassed = false;
        const proofArtifacts: string[] = [];
        const shouldVerifyCalculator = canonicalizeAppIntent(targetAppIntent || result.appName) === "Calculator";
        if (shouldVerifyCalculator) {
          const expectedFromKeys = inferExpectedCalculatorResultFromShortcutKeys(keys);
          if (expectedFromKeys) {
            const readAfterShortcut = await runtime
              .readControl({
                sessionId: result.sessionId,
                app: "Calculator",
                query: "result display",
                timeoutMs: CALCULATOR_READBACK_TIMEOUT_MS,
              })
              .catch(() => null);
            const readText = String(readAfterShortcut?.value?.text || readAfterShortcut?.matchedControl?.textPreview || "");
            let verifiedByRead = textIncludesNumericToken(readText, expectedFromKeys);
            if (!verifiedByRead) {
              const invoked = await invokeCalculatorExpressionViaControls(runtime, keys, {
                sessionId: result.sessionId,
                app: result.appName || "Calculator",
                title: result.windowTitle,
                windowId: result.windowId,
              });
              if (invoked) {
                result = {
                  ...result,
                  sessionId: invoked.sessionId,
                  appName: invoked.appName,
                  windowId: invoked.windowId,
                  windowTitle: invoked.windowTitle,
                  confidence: invoked.confidence,
                  focusStolen: invoked.focusStolen,
                };
                fallbackMode = "calculator_control_invoke";
              }
            }
            if (!verifiedByRead && fallbackMode !== "calculator_control_invoke") {
              const sentViaWindows = await this.sendWindowsShortcutWithBackgroundRecovery(
                keys,
                targetAppIntent || "Calculator",
                preferBackground
              );
              if (sentViaWindows.sent) {
                fallbackMode = "windows_sendkeys";
                if (typeof sentViaWindows.focusLeaseRestored === "boolean") {
                  backgroundFallbackFocusLeaseRestored = sentViaWindows.focusLeaseRestored;
                }
                if (typeof sentViaWindows.foregroundLeaseMs === "number") {
                  backgroundFallbackForegroundLeaseMs = Math.max(
                    backgroundFallbackForegroundLeaseMs || 0,
                    sentViaWindows.foregroundLeaseMs
                  );
                }
              }
            }
            const finalRead = await runtime
              .readControl({
                sessionId: result.sessionId,
                app: "Calculator",
                query: "result display",
                timeoutMs: CALCULATOR_READBACK_TIMEOUT_MS,
              })
              .catch(() => null);
            const finalText = String(finalRead?.value?.text || finalRead?.matchedControl?.textPreview || "");
            verifiedByRead = textIncludesNumericToken(finalText, expectedFromKeys);
            verificationPassed = verifiedByRead || fallbackMode === "windows_sendkeys";
            if (verificationPassed && fallbackMode === "windows_sendkeys" && !verifiedByRead) {
              proofArtifacts.push("calculator_sendkeys_expression");
            }
            if (verificationPassed) {
              this.recordProofArtifact("Calculator", "calculator_readback");
              proofArtifacts.push("calculator_readback");
            }
          }
        }
        const focusGuardMetadata = await this.releaseForegroundLeaseIfNeeded(focusGuard);
        const mergedFocusLeaseRestored =
          typeof focusGuardMetadata.focusLeaseRestored === "boolean"
            ? focusGuardMetadata.focusLeaseRestored
            : backgroundFallbackFocusLeaseRestored;
        const mergedForegroundLeaseMs = Math.max(
          typeof focusGuardMetadata.foregroundLeaseMs === "number" ? focusGuardMetadata.foregroundLeaseMs : 0,
          typeof backgroundFallbackForegroundLeaseMs === "number" ? backgroundFallbackForegroundLeaseMs : 0
        );
        return this.buildNativeResult(
          toolCall,
          `Sent ${keys} to the active native app session.`,
          {
            ...receipt(result.focusStolen === true, "existing"),
            sessionId: result.sessionId,
            appName: result.appName,
            windowId: result.windowId,
            windowTitle: result.windowTitle,
            confidence: result.confidence,
            fallbackMode,
            focusStolen: result.focusStolen === true,
            keys: result.keys,
            ...this.buildDesktopIntentMetadata(resolvedGuardedArgs, {
              ...focusGuardMetadata,
              targetResolvedApp: result.appName || focusGuard.targetResolvedApp,
              verificationRequired: true,
              verificationPassed,
              ...(typeof mergedFocusLeaseRestored === "boolean"
                ? { focusLeaseRestored: mergedFocusLeaseRestored }
                : {}),
              ...(mergedForegroundLeaseMs > 0 ? { foregroundLeaseMs: mergedForegroundLeaseMs } : {}),
              ...(proofArtifacts.length > 0 ? { proofArtifacts } : {}),
            }),
          }
        );
      } catch (error) {
        const focusGuardMetadata = await this.releaseForegroundLeaseIfNeeded(focusGuard);
        return failWithData(
          toolCall,
          error instanceof Error ? error.message : String(error),
          this.buildDesktopIntentMetadata(guardedArgs, {
            ...focusGuardMetadata,
            verificationRequired: true,
            verificationPassed: false,
          })
        );
      }
    }

    if (toolCall.name === "desktop_wait_for_control") {
      if (!this.policy.enabled || !this.policy.allowDesktopObservation) {
        return fail(toolCall, "Binary Host blocked desktop_wait_for_control because desktop observation is disabled.", true);
      }
      const runtime = await this.ensureNativeRuntimeAvailable(toolCall);
      if (!isNativeRuntime(runtime)) return runtime;
      try {
        const result = await runtime.waitForControl({
          sessionId: typeof args.sessionId === "string" ? args.sessionId : undefined,
          app: typeof args.app === "string" ? args.app : undefined,
          title: typeof args.title === "string" ? args.title : undefined,
          windowId: sanitizeNativeWindowId(args.windowId),
          query: typeof args.query === "string" ? args.query : undefined,
          selector: asSelector(args.selector),
          timeoutMs: Number.isFinite(Number(args.timeoutMs)) ? Number(args.timeoutMs) : undefined,
        });
        return this.buildNativeResult(
          toolCall,
          "Observed the requested native app control.",
          {
            ...receipt(result.focusStolen === true, "existing"),
            sessionId: result.sessionId,
            appName: result.appName,
            windowId: result.windowId,
            windowTitle: result.windowTitle,
            selector: result.selector,
            matchedControl: result.matchedControl,
            controlType:
              result.matchedControl && typeof result.matchedControl.controlType === "string"
                ? result.matchedControl.controlType
                : undefined,
            confidence: result.confidence,
            fallbackMode: result.fallbackMode,
            focusStolen: result.focusStolen === true,
          }
        );
      } catch (error) {
        return fail(toolCall, error instanceof Error ? error.message : String(error));
      }
    }

    if (toolCall.name === "desktop_wait") {
      const durationMs = clamp(Number(args.durationMs || 0), 0, 120_000);
      await new Promise((resolve) => setTimeout(resolve, durationMs));
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        ok: true,
        summary: `Waited ${durationMs}ms.`,
        data: { ...receipt(false, "none"), durationMs },
        createdAt: nowIso(),
      };
    }

    if (String(toolCall.name || "").startsWith("desktop_")) {
      return fail(
        toolCall,
        `Binary Host has not implemented ${toolCall.name} yet. Prefer desktop_list_apps, desktop_open_app, desktop_query_controls, desktop_read_control, desktop_invoke_control, desktop_type_into_control, desktop_select_control_option, desktop_toggle_control, desktop_send_shortcut, desktop_wait_for_control, desktop_open_url, desktop_list_windows, desktop_get_active_window, desktop_focus_window, or desktop_wait for now.`,
        true
      );
    }

    return fail(toolCall, `Unsupported desktop tool ${toolCall.name}.`, true);
  }
}
