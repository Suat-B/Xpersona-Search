import { exec } from "node:child_process";
import os from "node:os";
import process from "node:process";
import { promisify } from "node:util";
import { isDangerousNativeAction, matchNativeAppAdapter, } from "./native-app-adapters.js";
const execAsync = promisify(exec);
const RECOVERY_LAUNCH_COOLDOWN_MS = 6_000;
const RECOVERY_LAUNCH_MAX_PER_APP = 2;
const RECOVERY_LAUNCH_WINDOW_MS = 60_000;
function nowIso() {
    return new Date().toISOString();
}
function clamp(value, min, max) {
    if (!Number.isFinite(value))
        return min;
    return Math.max(min, Math.min(max, Math.floor(value)));
}
function fail(toolCall, summary, blocked = false) {
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
function failWithData(toolCall, summary, data, blocked = false) {
    return {
        ...fail(toolCall, summary, blocked),
        ...(Object.keys(data).length > 0 ? { data } : {}),
    };
}
function asRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function asSelector(value) {
    const record = asRecord(value);
    if (!record)
        return undefined;
    return {
        automationId: typeof record.automationId === "string" ? record.automationId : undefined,
        name: typeof record.name === "string" ? record.name : undefined,
        text: typeof record.text === "string" ? record.text : undefined,
        controlType: typeof record.controlType === "string" ? record.controlType : undefined,
        className: typeof record.className === "string" ? record.className : undefined,
        index: typeof record.index === "number" ? record.index : undefined,
    };
}
function isNativeRuntime(value) {
    return Boolean(value &&
        typeof value === "object" &&
        "getStatus" in value &&
        typeof value.getStatus === "function");
}
function explicitUserAuthorization(task, actionLabel) {
    const normalizedTask = String(task || "").toLowerCase();
    const normalizedAction = String(actionLabel || "").toLowerCase();
    if (!normalizedTask || !normalizedAction)
        return false;
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
async function runPlatformCommand(command) {
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
async function sleep(ms) {
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, Math.floor(ms))));
}
async function withTimeout(promise, timeoutMs, fallback) {
    let timer = null;
    try {
        return await Promise.race([
            promise,
            new Promise((resolve) => {
                timer = setTimeout(() => resolve(fallback), Math.max(1, Math.floor(timeoutMs)));
            }),
        ]);
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
}
function escapePowerShellSingleQuoted(value) {
    return String(value || "").replace(/'/g, "''");
}
function normalizeWindowsFilesystemTarget(input) {
    const raw = String(input || "").trim();
    if (!raw)
        return null;
    const normalized = raw.replace(/\//g, "\\");
    const bareDrive = normalized.match(/^([a-z]):?$/i);
    if (bareDrive?.[1])
        return `${bareDrive[1].toUpperCase()}:\\`;
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
    if (/^\\\\[^\\]+\\[^\\]+/.test(normalized))
        return normalized;
    return null;
}
async function openWindowsFilesystemTarget(targetPath) {
    const normalizedPath = normalizeWindowsFilesystemTarget(targetPath);
    if (!normalizedPath) {
        throw new Error(`Binary Host could not interpret "${targetPath}" as a Windows drive or filesystem path.`);
    }
    const psPath = escapePowerShellSingleQuoted(normalizedPath);
    const command = `powershell -NoProfile -Command "Start-Process -FilePath 'explorer.exe' -ArgumentList @('${psPath}')"`;
    await runPlatformCommand(command);
    return { command, normalizedPath };
}
function parseProcessId(value) {
    const numeric = Number(String(value || "").trim());
    if (!Number.isFinite(numeric))
        return null;
    if (numeric <= 0)
        return null;
    if (!Number.isInteger(numeric))
        return null;
    return numeric;
}
function sanitizeNativeWindowId(value) {
    const raw = String(value || "").trim();
    if (!raw)
        return undefined;
    if (/^\d+$/.test(raw)) {
        const numeric = Number.parseInt(raw, 10);
        if (Number.isFinite(numeric) && numeric > 0 && numeric < 200_000) {
            // Host window ids are usually process ids in this range; don't forward them as UIA handles.
            return undefined;
        }
    }
    return raw;
}
function isExplorerQuery(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return normalized === "explorer" || normalized === "file explorer" || normalized === "windows explorer";
}
function normalizeAppToken(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");
}
function canonicalizeAppIntent(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized)
        return undefined;
    if (normalized.includes("calc") || normalized.includes("calculator"))
        return "Calculator";
    if (normalized.includes("file explorer") || normalized.includes("explorer"))
        return "File Explorer";
    if (normalized.includes("notepad"))
        return "Notepad";
    if (normalized.includes("discord"))
        return "Discord";
    if (normalized.includes("slack"))
        return "Slack";
    if (normalized.includes("outlook") || normalized === "mail")
        return "Outlook";
    return String(value || "").trim();
}
function windowMatchesAppIntent(activeWindow, targetAppIntent) {
    if (!activeWindow)
        return false;
    const intent = normalizeAppToken(targetAppIntent);
    if (!intent)
        return false;
    const app = normalizeAppToken(activeWindow.app);
    const title = normalizeAppToken(activeWindow.title);
    if (!app && !title)
        return false;
    if (intent === "calculator") {
        if (app.includes("calc") || app.includes("calculator"))
            return true;
        if (app === "applicationframehost" && title.includes("calculator"))
            return true;
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
function isWindowResolutionError(error) {
    const message = String(error instanceof Error ? error.message : error || "").toLowerCase();
    return (message.includes("no native app window matched") ||
        message.includes("window not found") ||
        message.includes("window not available"));
}
function inferExpectedCalculatorResultFromTask(task) {
    const normalized = String(task || "").toLowerCase();
    if (!normalized)
        return null;
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
    if (!expressionMatch?.[0])
        return null;
    return evaluateArithmeticExpression(expressionMatch[0]);
}
function evaluateArithmeticExpression(expression) {
    const compact = String(expression || "").replace(/\s+/g, "");
    if (!compact)
        return null;
    if (!/^-?\d+(?:\.\d+)?(?:[+\-*/]-?\d+(?:\.\d+)?)+$/.test(compact))
        return null;
    const numbers = [];
    const operators = [];
    let cursor = 0;
    while (cursor < compact.length) {
        let sign = 1;
        if ((compact[cursor] === "+" || compact[cursor] === "-") &&
            (cursor === 0 || /[+\-*/]/.test(compact[cursor - 1] || ""))) {
            sign = compact[cursor] === "-" ? -1 : 1;
            cursor += 1;
        }
        const start = cursor;
        while (cursor < compact.length && /[0-9.]/.test(compact[cursor] || ""))
            cursor += 1;
        if (start === cursor)
            return null;
        const parsed = Number(compact.slice(start, cursor));
        if (!Number.isFinite(parsed))
            return null;
        numbers.push(sign * parsed);
        if (cursor >= compact.length)
            break;
        const op = compact[cursor] || "";
        if (!/[+\-*/]/.test(op))
            return null;
        operators.push(op);
        cursor += 1;
    }
    if (!numbers.length || operators.length !== numbers.length - 1)
        return null;
    const collapsedNumbers = [numbers[0] ?? 0];
    const collapsedOperators = [];
    for (let index = 0; index < operators.length; index += 1) {
        const op = operators[index] || "";
        const next = numbers[index + 1] ?? 0;
        if (op === "*" || op === "/") {
            const left = collapsedNumbers.pop() ?? 0;
            if (op === "/" && next === 0)
                return null;
            const value = op === "*" ? left * next : left / next;
            if (!Number.isFinite(value))
                return null;
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
    if (!Number.isFinite(total))
        return null;
    const rounded = Number(total.toFixed(8));
    return Number.isInteger(rounded) ? String(Math.trunc(rounded)) : String(rounded);
}
function parseCalculatorShortcutTokens(keys) {
    const tokens = [];
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
function calculatorControlForToken(token) {
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
function inferExpectedCalculatorResultFromShortcutKeys(keys) {
    const expression = parseCalculatorShortcutTokens(keys)
        .filter((token) => token !== "~")
        .join("");
    if (!expression)
        return null;
    return evaluateArithmeticExpression(expression);
}
function textIncludesNumericToken(text, token) {
    if (!text || !token)
        return false;
    if (text.includes(token))
        return true;
    const matches = text.match(/-?\d+(?:\.\d+)?/g) || [];
    return matches.some((value) => value === token);
}
function textIncludesSnippet(text, snippet) {
    const haystack = String(text || "").trim().toLowerCase().replace(/\s+/g, " ");
    const needle = String(snippet || "").trim().toLowerCase().replace(/\s+/g, " ");
    if (!haystack || !needle)
        return false;
    return haystack.includes(needle);
}
function toWindowsSendKeysPattern(input) {
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
async function invokeCalculatorExpressionViaControls(runtime, keys, target) {
    const tokens = parseCalculatorShortcutTokens(keys);
    if (!tokens.length)
        return null;
    let currentTarget = {
        sessionId: target.sessionId,
        app: target.app || "Calculator",
        title: target.title,
        windowId: target.windowId,
        allowBackground: target.allowBackground === true,
    };
    let last = null;
    for (const token of tokens) {
        const mapped = calculatorControlForToken(token);
        if (!mapped)
            continue;
        let step = await runtime
            .invokeControl({
            ...currentTarget,
            selector: mapped.selector,
        })
            .catch(() => null);
        if (!step) {
            step = await runtime
                .invokeControl({
                ...currentTarget,
                query: mapped.query,
            })
                .catch(() => null);
        }
        if (!step)
            return null;
        last = step;
        currentTarget = {
            sessionId: step.sessionId,
            app: step.appName || currentTarget.app,
            title: step.windowTitle || currentTarget.title,
            windowId: step.windowId || currentTarget.windowId,
            allowBackground: currentTarget.allowBackground,
        };
        await sleep(40);
    }
    return last;
}
async function openUrl(url) {
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
async function listWindows() {
    if (process.platform === "win32") {
        const script = [
            "$windows = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle } | Sort-Object ProcessName",
            "$windows | Select-Object @{Name='id';Expression={[string]$_.Id}}, @{Name='title';Expression={$_.MainWindowTitle}}, @{Name='app';Expression={$_.ProcessName}} | ConvertTo-Json -Compress",
        ].join("; ");
        const { stdout } = await runPlatformCommand(`powershell -NoProfile -Command "${script}"`);
        const parsed = JSON.parse(stdout || "[]");
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
async function getActiveWindow() {
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
        const parsed = JSON.parse(stdout || "{}");
        if (!parsed.id || !parsed.title)
            return null;
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
        if (!title)
            return null;
        return {
            id: `front_${app || "app"}`,
            title: title || "",
            app: app || "",
        };
    }
    return null;
}
async function focusWindow(input) {
    if (process.platform === "win32") {
        const target = String(input.title || input.app || input.windowId || "").trim();
        if (!target)
            throw new Error("desktop_focus_window requires a windowId, title, or app.");
        const escaped = target.replace(/"/g, '""');
        const command = `powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $ok = $ws.AppActivate('${escaped.replace(/'/g, "''")}'); if (-not $ok) { throw 'Window not found.' }"`;
        await runPlatformCommand(command);
        return command;
    }
    if (process.platform === "darwin") {
        const app = String(input.app || "").trim();
        if (!app)
            throw new Error("desktop_focus_window currently requires an app on macOS.");
        const command = `osascript -e ${JSON.stringify(`tell application "${app}" to activate`)}`;
        await runPlatformCommand(command);
        return command;
    }
    throw new Error("desktop_focus_window is not implemented on this platform.");
}
export async function collectDesktopContext(input) {
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
    machineAutonomyController;
    policy;
    executionController;
    nativeAppRuntime;
    task;
    options;
    launchedProcessIds = new Set();
    launchedWindowTargets = new Map();
    recoveryLaunchHistory = new Map();
    openedAppIntentKeys = new Set();
    deps;
    constructor(machineAutonomyController, policy, executionController, nativeAppRuntime, task, options) {
        this.machineAutonomyController = machineAutonomyController;
        this.policy = policy;
        this.executionController = executionController;
        this.nativeAppRuntime = nativeAppRuntime;
        this.task = task;
        this.options = options;
        this.deps = {
            listWindows,
            getActiveWindow,
            focusWindow,
            ...(options?.deps || {}),
        };
    }
    ensureNativeRuntime(toolCall) {
        if (!this.nativeAppRuntime) {
            return fail(toolCall, "Binary Host could not start the native app runtime on this machine.", true);
        }
        return this.nativeAppRuntime;
    }
    async ensureNativeRuntimeAvailable(toolCall) {
        const runtime = this.ensureNativeRuntime(toolCall);
        if (isNativeRuntime(runtime)) {
            const status = await runtime.getStatus();
            if (status.available)
                return runtime;
            return fail(toolCall, status.lastLaunchError ||
                "Binary Host native app automation is unavailable. Install the sidecar dependencies from services/binary-host/resources/requirements.txt.", true);
        }
        return runtime;
    }
    buildNativeActionLabel(toolCall, args) {
        if (toolCall.name === "desktop_send_shortcut")
            return `shortcut ${String(args.keys || "").trim()}`;
        const selector = asRecord(args.selector);
        const name = typeof selector?.name === "string" ? selector.name : "";
        const text = typeof selector?.text === "string" ? selector.text : "";
        const query = String(args.query || "").trim();
        return [name, text, query, String(toolCall.name || "").replace(/^desktop_/, "")]
            .filter(Boolean)
            .join(" ")
            .trim();
    }
    shouldBlockIrreversibleAction(toolCall, args) {
        if (args.confirm === true)
            return false;
        const selector = asRecord(args.selector);
        const app = typeof args.app === "string" ? args.app : undefined;
        const title = typeof args.title === "string" ? args.title : undefined;
        const adapter = matchNativeAppAdapter(app, title);
        const actionLabel = this.buildNativeActionLabel(toolCall, args);
        const dangerous = isDangerousNativeAction(actionLabel, adapter) ||
            (toolCall.name === "desktop_type_into_control" && args.submit === true);
        if (!dangerous)
            return false;
        return !explicitUserAuthorization(this.task, actionLabel);
    }
    buildNativeResult(toolCall, summary, payload, createdAt = nowIso()) {
        return {
            toolCallId: toolCall.id,
            name: toolCall.name,
            ok: true,
            summary,
            data: payload,
            createdAt,
        };
    }
    shouldAutoCloseLaunchedApps() {
        return this.options?.autoCloseLaunchedApps !== false;
    }
    resolveTargetAppIntent(args) {
        const explicit = canonicalizeAppIntent(args.targetAppIntent);
        if (explicit)
            return explicit;
        return canonicalizeAppIntent(args.app);
    }
    buildDesktopIntentMetadata(args, options) {
        const targetAppIntent = this.resolveTargetAppIntent(args);
        return {
            ...(targetAppIntent ? { targetAppIntent } : {}),
            ...(typeof options?.targetResolvedApp === "string" && options.targetResolvedApp.trim()
                ? { targetResolvedApp: options.targetResolvedApp.trim() }
                : {}),
            ...(typeof options?.focusRecoveryAttempted === "boolean"
                ? { focusRecoveryAttempted: options.focusRecoveryAttempted }
                : {}),
            ...(typeof options?.verificationRequired === "boolean"
                ? { verificationRequired: options.verificationRequired }
                : {}),
            ...(typeof options?.verificationPassed === "boolean"
                ? { verificationPassed: options.verificationPassed }
                : {}),
            ...(typeof options?.recoverySuppressedReason === "string" && options.recoverySuppressedReason.trim()
                ? { recoverySuppressedReason: options.recoverySuppressedReason.trim() }
                : {}),
        };
    }
    shouldPreferBackgroundExecution(args) {
        if (args.allowBackground === false)
            return false;
        if (args.requiresForeground === true)
            return false;
        if (args.forceForeground === true)
            return false;
        return true;
    }
    async resolveMatchingWindowTarget(targetAppIntent, title, windowId) {
        const windows = await this.deps.listWindows().catch(() => []);
        if (!windows.length)
            return null;
        if (windowId) {
            const byId = windows.find((window) => String(window.id || "") === String(windowId));
            if (byId)
                return byId;
        }
        if (title) {
            const normalizedTitle = normalizeAppToken(title);
            const byTitle = windows.find((window) => {
                const candidate = normalizeAppToken(window.title);
                return candidate === normalizedTitle || candidate.includes(normalizedTitle) || normalizedTitle.includes(candidate);
            });
            if (byTitle)
                return byTitle;
        }
        if (targetAppIntent) {
            const byIntent = windows.find((window) => windowMatchesAppIntent(window, targetAppIntent));
            if (byIntent)
                return byIntent;
        }
        return null;
    }
    async launchAppForRecovery(app) {
        const beforeWindows = await withTimeout(this.deps.listWindows().catch(() => []), 900, []);
        const beforeLaunchProcessIds = process.platform === "win32" ? await this.captureWindowProcessIds().catch(() => new Set()) : new Set();
        const launched = await this.machineAutonomyController.launchApp(app);
        const launchedProcessIds = process.platform === "win32"
            ? await this.detectNewLaunchProcessIds(beforeLaunchProcessIds, launched.app.name).catch(() => [])
            : [];
        this.trackLaunchedProcesses(launchedProcessIds);
        const launchedWindow = await this.detectLaunchedWindowTarget(beforeWindows, canonicalizeAppIntent(app) || launched.app.name);
        this.rememberLaunchedWindowTarget(canonicalizeAppIntent(app) || launched.app.name, launchedWindow);
    }
    getRecoveryLaunchKey(app) {
        return String(canonicalizeAppIntent(app) || app || "").trim().toLowerCase();
    }
    buildRecoverySuppressedReason(app) {
        return `Recovery launch suppressed for ${app} to prevent repeated app re-open loops.`;
    }
    markAppIntentOpened(app) {
        const key = this.getRecoveryLaunchKey(app);
        if (!key)
            return;
        this.openedAppIntentKeys.add(key);
    }
    wasAppIntentOpened(app) {
        const key = this.getRecoveryLaunchKey(app);
        if (!key)
            return false;
        return this.openedAppIntentKeys.has(key);
    }
    canAttemptRecoveryLaunch(app) {
        const key = this.getRecoveryLaunchKey(app);
        if (!key)
            return false;
        const now = Date.now();
        const history = (this.recoveryLaunchHistory.get(key) || []).filter((timestamp) => now - timestamp <= RECOVERY_LAUNCH_WINDOW_MS);
        this.recoveryLaunchHistory.set(key, history);
        if (history.length >= RECOVERY_LAUNCH_MAX_PER_APP)
            return false;
        const mostRecent = history.length > 0 ? history[history.length - 1] : 0;
        if (mostRecent && now - mostRecent < RECOVERY_LAUNCH_COOLDOWN_MS)
            return false;
        return true;
    }
    recordRecoveryLaunch(app) {
        const key = this.getRecoveryLaunchKey(app);
        if (!key)
            return;
        const now = Date.now();
        const history = (this.recoveryLaunchHistory.get(key) || []).filter((timestamp) => now - timestamp <= RECOVERY_LAUNCH_WINDOW_MS);
        history.push(now);
        this.recoveryLaunchHistory.set(key, history);
    }
    async tryFocusExistingWindowForIntent(targetAppIntent, title, windowId) {
        const windows = await this.deps.listWindows().catch(() => []);
        const matchedWindows = windows.filter((window) => windowMatchesAppIntent(window, targetAppIntent));
        if (!matchedWindows.length)
            return false;
        for (const matched of matchedWindows) {
            for (let attempt = 0; attempt < 2; attempt += 1) {
                try {
                    await this.deps.focusWindow({
                        app: targetAppIntent,
                        title: matched.title || title,
                        windowId: matched.id || windowId,
                    });
                    return true;
                }
                catch {
                    await sleep(100);
                }
            }
        }
        return false;
    }
    async enforceWindowTarget(toolCall, args, options) {
        const preferBackground = options?.preferBackground === true;
        const targetAppIntent = this.resolveTargetAppIntent(args);
        const title = typeof args.title === "string" ? args.title : undefined;
        const windowId = typeof args.windowId === "string" ? args.windowId : undefined;
        const hasExplicitTarget = Boolean(targetAppIntent || title || windowId);
        if (!hasExplicitTarget) {
            return { ok: true, focusRecoveryAttempted: false, focusStolen: false };
        }
        if (preferBackground) {
            let focusRecoveryAttempted = false;
            let recoverySuppressedReason;
            let matchedTargetWindow = await this.resolveMatchingWindowTarget(targetAppIntent, title, windowId);
            if (!matchedTargetWindow && targetAppIntent) {
                focusRecoveryAttempted = true;
                if (!this.canAttemptRecoveryLaunch(targetAppIntent)) {
                    recoverySuppressedReason = this.buildRecoverySuppressedReason(targetAppIntent);
                    return {
                        ok: false,
                        message: recoverySuppressedReason,
                        targetAppIntent,
                        focusRecoveryAttempted,
                        focusStolen: false,
                        backgroundTargetBound: false,
                        ...(recoverySuppressedReason ? { recoverySuppressedReason } : {}),
                    };
                }
                this.recordRecoveryLaunch(targetAppIntent);
                await this.launchAppForRecovery(targetAppIntent);
                for (let attempt = 0; attempt < 20; attempt += 1) {
                    matchedTargetWindow = await this.resolveMatchingWindowTarget(targetAppIntent, title, windowId);
                    if (matchedTargetWindow)
                        break;
                    await sleep(180);
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
                    ...(recoverySuppressedReason ? { recoverySuppressedReason } : {}),
                };
            }
            return {
                ok: true,
                ...(targetAppIntent ? { targetAppIntent } : {}),
                targetResolvedApp: String(matchedTargetWindow.app || targetAppIntent || ""),
                targetWindowId: String(matchedTargetWindow.id || ""),
                targetWindowTitle: String(matchedTargetWindow.title || ""),
                focusRecoveryAttempted,
                focusStolen: false,
                backgroundTargetBound: true,
                ...(recoverySuppressedReason ? { recoverySuppressedReason } : {}),
            };
        }
        let focusRecoveryAttempted = false;
        let focusStolen = false;
        let recoverySuppressedReason;
        try {
            await this.deps.focusWindow({ app: targetAppIntent, title, windowId });
            focusStolen = true;
        }
        catch (error) {
            if (!targetAppIntent) {
                return {
                    ok: false,
                    message: error instanceof Error ? error.message : String(error),
                    targetAppIntent,
                    focusRecoveryAttempted,
                    focusStolen,
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
                    return {
                        ok: true,
                        targetAppIntent,
                        ...(fallbackWindow?.app ? { targetResolvedApp: String(fallbackWindow.app) } : {}),
                        ...(fallbackWindow?.id ? { targetWindowId: String(fallbackWindow.id) } : {}),
                        ...(fallbackWindow?.title ? { targetWindowTitle: String(fallbackWindow.title) } : {}),
                        focusRecoveryAttempted,
                        focusStolen: false,
                        backgroundTargetBound: true,
                        ...(recoverySuppressedReason ? { recoverySuppressedReason } : {}),
                    };
                }
                let focusedExisting = await this.tryFocusExistingWindowForIntent(targetAppIntent, title, windowId);
                if (!focusedExisting && !this.canAttemptRecoveryLaunch(targetAppIntent)) {
                    // Give newly launched UWP/Electron apps a short settle window before suppressing recovery.
                    for (let waitAttempt = 0; waitAttempt < 30; waitAttempt += 1) {
                        await sleep(250);
                        focusedExisting = await this.tryFocusExistingWindowForIntent(targetAppIntent, title, windowId);
                        if (focusedExisting)
                            break;
                    }
                }
                if (focusedExisting) {
                    focusStolen = true;
                }
                else {
                    if (!this.canAttemptRecoveryLaunch(targetAppIntent)) {
                        recoverySuppressedReason = this.buildRecoverySuppressedReason(targetAppIntent);
                        throw new Error(recoverySuppressedReason);
                    }
                    this.recordRecoveryLaunch(targetAppIntent);
                    await this.launchAppForRecovery(targetAppIntent);
                }
                let focused = false;
                for (let attempt = 0; attempt < 20; attempt += 1) {
                    try {
                        await this.deps.focusWindow({ app: targetAppIntent, title, windowId });
                        focusStolen = true;
                        focused = true;
                        break;
                    }
                    catch {
                        await sleep(250);
                    }
                }
                if (!focused) {
                    throw new Error(`Window not found for ${targetAppIntent}.`);
                }
            }
            catch (recoveryError) {
                return {
                    ok: false,
                    message: recoveryError instanceof Error ? recoveryError.message : String(recoveryError),
                    targetAppIntent,
                    focusRecoveryAttempted,
                    focusStolen,
                    ...(recoverySuppressedReason ? { recoverySuppressedReason } : {}),
                };
            }
        }
        let activeWindow = null;
        let matchedTargetWindow = null;
        for (let attempt = 0; attempt < 4; attempt += 1) {
            activeWindow = await this.deps.getActiveWindow().catch(() => null);
            if (activeWindow)
                break;
            await sleep(120);
        }
        if (targetAppIntent) {
            const visibleWindows = await this.deps.listWindows().catch(() => []);
            matchedTargetWindow = visibleWindows.find((window) => windowMatchesAppIntent(window, targetAppIntent)) || null;
            if (!activeWindow && matchedTargetWindow)
                activeWindow = matchedTargetWindow;
        }
        const resolvedWindow = matchedTargetWindow || activeWindow || null;
        const targetResolvedApp = resolvedWindow?.app ? String(resolvedWindow.app) : undefined;
        const targetWindowId = resolvedWindow?.id ? String(resolvedWindow.id) : undefined;
        const targetWindowTitle = resolvedWindow?.title ? String(resolvedWindow.title) : undefined;
        if (targetAppIntent && activeWindow && !windowMatchesAppIntent(activeWindow, targetAppIntent)) {
            if (matchedTargetWindow) {
                return {
                    ok: true,
                    targetAppIntent,
                    targetResolvedApp,
                    targetWindowId,
                    targetWindowTitle,
                    focusRecoveryAttempted,
                    focusStolen: false,
                    backgroundTargetBound: true,
                    ...(recoverySuppressedReason ? { recoverySuppressedReason } : {}),
                };
            }
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
            ...(recoverySuppressedReason ? { recoverySuppressedReason } : {}),
        };
    }
    async captureWindowProcessIds() {
        if (process.platform !== "win32")
            return new Set();
        const windows = await withTimeout(this.deps.listWindows(), 900, []);
        const ids = new Set();
        for (const window of windows) {
            const pid = parseProcessId(window.id);
            if (pid)
                ids.add(pid);
        }
        return ids;
    }
    async detectNewLaunchProcessIds(before, expectedApp) {
        if (process.platform !== "win32")
            return [];
        const expected = String(expectedApp || "").trim().toLowerCase();
        const observed = new Set();
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const windows = await withTimeout(this.deps.listWindows().catch(() => []), 300, []);
            for (const window of windows) {
                const pid = parseProcessId(window.id);
                if (!pid || before.has(pid))
                    continue;
                if (expected && !String(window.app || "").toLowerCase().includes(expected) && !String(window.title || "").toLowerCase().includes(expected)) {
                    continue;
                }
                observed.add(pid);
            }
            if (observed.size > 0)
                break;
            await sleep(120);
        }
        return Array.from(observed);
    }
    trackLaunchedProcesses(processIds) {
        for (const processId of processIds) {
            if (processId > 0)
                this.launchedProcessIds.add(processId);
        }
    }
    rememberLaunchedWindowTarget(appIntent, window) {
        const canonical = canonicalizeAppIntent(appIntent) || appIntent;
        const title = window?.title ? String(window.title) : canonical;
        const key = `${normalizeAppToken(canonical)}::${normalizeAppToken(title)}`;
        this.launchedWindowTargets.set(key, {
            appIntent: canonical,
            ...(window?.title ? { title: String(window.title) } : {}),
            ...(window?.id ? { windowId: String(window.id) } : {}),
        });
    }
    async detectLaunchedWindowTarget(beforeWindows, appIntent) {
        const beforeIds = new Set(beforeWindows.map((window) => String(window.id || "")));
        const beforeTitles = new Set(beforeWindows.map((window) => normalizeAppToken(window.title)));
        for (let attempt = 0; attempt < 12; attempt += 1) {
            const windows = await withTimeout(this.deps.listWindows().catch(() => []), 900, []);
            const matched = windows.filter((window) => windowMatchesAppIntent(window, appIntent));
            if (matched.length > 0) {
                const newlyOpened = matched.find((window) => !beforeIds.has(String(window.id || ""))) ||
                    matched.find((window) => !beforeTitles.has(normalizeAppToken(window.title))) ||
                    matched[0];
                if (newlyOpened)
                    return newlyOpened;
            }
            await sleep(220);
        }
        return null;
    }
    async closeWindowTarget(target) {
        if (process.platform !== "win32")
            return;
        const focusTitle = String(target.title || target.appIntent || "").trim();
        if (!focusTitle)
            throw new Error("Window target is missing a focus label.");
        const escaped = escapePowerShellSingleQuoted(focusTitle);
        const command = `powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; ` +
            `$ok = $ws.AppActivate('${escaped}'); if (-not $ok) { throw 'Window not found.' }; ` +
            `Start-Sleep -Milliseconds 120; $ws.SendKeys('%{F4}')"`; // ALT+F4 to close the specific launched window target.
        await runPlatformCommand(command);
    }
    async cleanupLaunchedApps() {
        if (process.platform !== "win32" || !this.shouldAutoCloseLaunchedApps()) {
            return { attempted: 0, closed: 0, failed: [], skipped: true };
        }
        const failed = [];
        let closed = 0;
        const launchedTargets = Array.from(this.launchedWindowTargets.values());
        for (const target of launchedTargets) {
            try {
                await this.closeWindowTarget(target);
                closed += 1;
            }
            catch (error) {
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
            }
            catch (error) {
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
        };
    }
    async execute(pendingToolCall) {
        const toolCall = pendingToolCall.toolCall;
        const args = toolCall.arguments || {};
        const decision = this.executionController?.decide(pendingToolCall);
        const receipt = (focusStolen = false, sessionKind = "none") => this.executionController && decision
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
            if (!app)
                return fail(toolCall, "desktop_open_app requires an app name.");
            const targetPath = normalizeWindowsFilesystemTarget(String(args.path || args.target || args.url || "").trim()) ||
                normalizeWindowsFilesystemTarget(app);
            const openInExplorer = process.platform === "win32" &&
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
                }
                catch (error) {
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
                const activeWindow = await this.deps.getActiveWindow().catch(() => null);
                const bestWindow = (activeWindow && windowMatchesAppIntent(activeWindow, targetAppIntent) ? activeWindow : null) ||
                    existingMatchingWindows[0] ||
                    activeWindow;
                const activeAppName = String(bestWindow?.app || targetAppIntent);
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
                        ...this.buildDesktopIntentMetadata({ ...args, targetAppIntent }, {
                            targetResolvedApp: activeAppName,
                            focusRecoveryAttempted: !focusedExistingWindow,
                        }),
                    },
                    createdAt: nowIso(),
                };
            }
            if (this.wasAppIntentOpened(targetAppIntent) && !this.canAttemptRecoveryLaunch(targetAppIntent)) {
                const recoverySuppressedReason = this.buildRecoverySuppressedReason(targetAppIntent);
                return failWithData(toolCall, recoverySuppressedReason, this.buildDesktopIntentMetadata({ ...args, targetAppIntent }, {
                    targetResolvedApp: targetAppIntent,
                    focusRecoveryAttempted: true,
                    recoverySuppressedReason,
                }));
            }
            if (!this.canAttemptRecoveryLaunch(targetAppIntent)) {
                const recoverySuppressedReason = this.buildRecoverySuppressedReason(targetAppIntent);
                return failWithData(toolCall, recoverySuppressedReason, this.buildDesktopIntentMetadata({ ...args, targetAppIntent }, {
                    targetResolvedApp: targetAppIntent,
                    focusRecoveryAttempted: true,
                    recoverySuppressedReason,
                }));
            }
            this.recordRecoveryLaunch(targetAppIntent);
            const foregroundBeforeLaunch = preferBackgroundOpen ? await this.deps.getActiveWindow().catch(() => null) : null;
            const beforeWindows = await withTimeout(this.deps.listWindows().catch(() => []), 900, []);
            const beforeLaunchProcessIds = process.platform === "win32" ? await this.captureWindowProcessIds().catch(() => new Set()) : new Set();
            try {
                const launched = await this.machineAutonomyController.launchApp(app);
                const launchedProcessIds = process.platform === "win32"
                    ? await this.detectNewLaunchProcessIds(beforeLaunchProcessIds, launched.app.name).catch(() => [])
                    : [];
                this.trackLaunchedProcesses(launchedProcessIds);
                const launchedWindow = await this.detectLaunchedWindowTarget(beforeWindows, targetAppIntent);
                this.rememberLaunchedWindowTarget(targetAppIntent, launchedWindow);
                let backgroundFocusRestored = false;
                if (preferBackgroundOpen &&
                    foregroundBeforeLaunch &&
                    !windowMatchesAppIntent(foregroundBeforeLaunch, targetAppIntent)) {
                    try {
                        await this.deps.focusWindow({
                            title: foregroundBeforeLaunch.title || undefined,
                            app: foregroundBeforeLaunch.app || undefined,
                        });
                        backgroundFocusRestored = true;
                    }
                    catch {
                        backgroundFocusRestored = false;
                    }
                }
                this.markAppIntentOpened(targetAppIntent);
                return {
                    toolCallId: toolCall.id,
                    name: toolCall.name,
                    ok: true,
                    summary: preferBackgroundOpen && backgroundFocusRestored
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
                        }),
                        command: launched.command,
                        trackedProcessIds: launchedProcessIds,
                        autoCloseOnRunEnd: this.shouldAutoCloseLaunchedApps(),
                    },
                    createdAt: launched.createdAt,
                };
            }
            catch (error) {
                return failWithData(toolCall, error instanceof Error ? error.message : String(error), this.buildDesktopIntentMetadata({ ...args, targetAppIntent }, {
                    targetResolvedApp: targetAppIntent,
                    focusRecoveryAttempted: true,
                }));
            }
        }
        if (toolCall.name === "desktop_open_url") {
            if (!this.policy.enabled || !this.policy.allowUrlOpen) {
                return fail(toolCall, "Binary Host blocked desktop_open_url because URL autonomy is disabled.", true);
            }
            const url = String(args.url || args.path || args.target || "").trim();
            if (!url)
                return fail(toolCall, "desktop_open_url requires a URL.");
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
            }
            catch (error) {
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
            }
            catch (error) {
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
            }
            catch (error) {
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
            }
            catch (error) {
                return fail(toolCall, error instanceof Error ? error.message : String(error));
            }
        }
        if (toolCall.name === "desktop_query_controls") {
            if (!this.policy.enabled || !this.policy.allowWholeMachineAccess) {
                return fail(toolCall, "Binary Host blocked desktop_query_controls because machine autonomy is disabled.", true);
            }
            const runtime = await this.ensureNativeRuntimeAvailable(toolCall);
            if (!isNativeRuntime(runtime))
                return runtime;
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
                return this.buildNativeResult(toolCall, `Observed ${queryResult.controls.length} semantic native app control(s).`, {
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
                });
            }
            catch (error) {
                return fail(toolCall, error instanceof Error ? error.message : String(error));
            }
        }
        if (toolCall.name === "desktop_read_control") {
            if (!this.policy.enabled || !this.policy.allowDesktopObservation) {
                return fail(toolCall, "Binary Host blocked desktop_read_control because desktop observation is disabled.", true);
            }
            const runtime = await this.ensureNativeRuntimeAvailable(toolCall);
            if (!isNativeRuntime(runtime))
                return runtime;
            try {
                const result = await runtime.readControl({
                    sessionId: typeof args.sessionId === "string" ? args.sessionId : undefined,
                    app: typeof args.app === "string" ? args.app : undefined,
                    title: typeof args.title === "string" ? args.title : undefined,
                    windowId: sanitizeNativeWindowId(args.windowId),
                    query: typeof args.query === "string" ? args.query : undefined,
                    selector: asSelector(args.selector),
                });
                return this.buildNativeResult(toolCall, `Read the requested native app control${result.windowTitle ? ` in ${result.windowTitle}` : ""}.`, {
                    ...receipt(false, "existing"),
                    sessionId: result.sessionId,
                    appName: result.appName,
                    windowId: result.windowId,
                    windowTitle: result.windowTitle,
                    selector: result.selector,
                    matchedControl: result.matchedControl,
                    controlType: result.matchedControl && typeof result.matchedControl.controlType === "string"
                        ? result.matchedControl.controlType
                        : undefined,
                    confidence: result.confidence,
                    fallbackMode: result.fallbackMode,
                    focusStolen: result.focusStolen === true,
                    value: result.value,
                    ...this.buildDesktopIntentMetadata(args, (() => {
                        const verificationRequired = args.verificationRequired === true;
                        const targetIntent = this.resolveTargetAppIntent(args);
                        let verificationPassed = verificationRequired &&
                            (Boolean(result.matchedControl) ||
                                (result.value && Object.keys(result.value).length > 0));
                        if (verificationRequired && canonicalizeAppIntent(targetIntent) === "Calculator") {
                            const expected = inferExpectedCalculatorResultFromTask(this.task);
                            if (expected) {
                                const valueText = result.value && typeof result.value.text === "string"
                                    ? result.value.text
                                    : result.matchedControl && typeof result.matchedControl.textPreview === "string"
                                        ? result.matchedControl.textPreview
                                        : "";
                                verificationPassed = textIncludesNumericToken(String(valueText || ""), expected);
                            }
                        }
                        return {
                            targetResolvedApp: result.appName,
                            verificationRequired,
                            verificationPassed,
                        };
                    })()),
                });
            }
            catch (error) {
                return fail(toolCall, error instanceof Error ? error.message : String(error));
            }
        }
        if (toolCall.name === "desktop_invoke_control") {
            if (!this.policy.enabled || !this.policy.allowWholeMachineAccess) {
                return fail(toolCall, "Binary Host blocked desktop_invoke_control because machine autonomy is disabled.", true);
            }
            if (this.shouldBlockIrreversibleAction(toolCall, args)) {
                return fail(toolCall, "Binary Host blocked an irreversible native app action. Ask the user to confirm the send/submit/delete action explicitly or reissue the tool call with confirm=true once the task clearly authorizes it.", true);
            }
            const preferBackground = this.shouldPreferBackgroundExecution(args);
            const focusGuard = await this.enforceWindowTarget(toolCall, args, { preferBackground });
            if (!focusGuard.ok) {
                return failWithData(toolCall, focusGuard.message || "Binary Host could not focus the intended app window.", this.buildDesktopIntentMetadata(args, {
                    targetResolvedApp: focusGuard.targetResolvedApp,
                    focusRecoveryAttempted: focusGuard.focusRecoveryAttempted,
                    recoverySuppressedReason: focusGuard.recoverySuppressedReason,
                    verificationRequired: true,
                    verificationPassed: false,
                }));
            }
            const runtime = await this.ensureNativeRuntimeAvailable(toolCall);
            if (!isNativeRuntime(runtime))
                return runtime;
            try {
                const result = await runtime.invokeControl({
                    sessionId: typeof args.sessionId === "string" ? args.sessionId : undefined,
                    app: typeof args.app === "string" ? args.app : focusGuard.targetResolvedApp,
                    title: typeof args.title === "string" ? args.title : focusGuard.targetWindowTitle,
                    windowId: sanitizeNativeWindowId(args.windowId),
                    query: typeof args.query === "string" ? args.query : undefined,
                    selector: asSelector(args.selector),
                    allowBackground: preferBackground,
                });
                return this.buildNativeResult(toolCall, "Invoked the requested native app control.", {
                    ...receipt(result.focusStolen === true, "existing"),
                    sessionId: result.sessionId,
                    appName: result.appName,
                    windowId: result.windowId,
                    windowTitle: result.windowTitle,
                    selector: result.selector,
                    matchedControl: result.matchedControl,
                    controlType: result.matchedControl && typeof result.matchedControl.controlType === "string"
                        ? result.matchedControl.controlType
                        : undefined,
                    confidence: result.confidence,
                    fallbackMode: result.fallbackMode,
                    focusStolen: result.focusStolen === true,
                    ...this.buildDesktopIntentMetadata(args, {
                        targetResolvedApp: result.appName || focusGuard.targetResolvedApp,
                        focusRecoveryAttempted: focusGuard.focusRecoveryAttempted,
                        recoverySuppressedReason: focusGuard.recoverySuppressedReason,
                        verificationRequired: true,
                        verificationPassed: false,
                    }),
                });
            }
            catch (error) {
                return failWithData(toolCall, error instanceof Error ? error.message : String(error), this.buildDesktopIntentMetadata(args, {
                    targetResolvedApp: focusGuard.targetResolvedApp,
                    focusRecoveryAttempted: focusGuard.focusRecoveryAttempted,
                    recoverySuppressedReason: focusGuard.recoverySuppressedReason,
                    verificationRequired: true,
                    verificationPassed: false,
                }));
            }
        }
        if (toolCall.name === "desktop_type_into_control") {
            if (!this.policy.enabled || !this.policy.allowWholeMachineAccess) {
                return fail(toolCall, "Binary Host blocked desktop_type_into_control because machine autonomy is disabled.", true);
            }
            if (this.shouldBlockIrreversibleAction(toolCall, args)) {
                return fail(toolCall, "Binary Host blocked a native app typing step because it looks like an irreversible send/submit action without explicit authorization.", true);
            }
            const text = String(args.text || "");
            if (!text)
                return fail(toolCall, "desktop_type_into_control requires text.");
            const inferredTypingTarget = this.resolveTargetAppIntent(args) ||
                (/\bnotepad\b/i.test(String(this.task || "")) || /\bdraft\b/i.test(String(this.task || "")) ? "Notepad" : undefined);
            const guardedArgs = inferredTypingTarget ? { ...args, targetAppIntent: inferredTypingTarget } : args;
            const preferBackground = this.shouldPreferBackgroundExecution(guardedArgs);
            const focusGuard = await this.enforceWindowTarget(toolCall, guardedArgs, { preferBackground });
            if (!focusGuard.ok) {
                return failWithData(toolCall, focusGuard.message || "Binary Host could not focus the intended app window.", this.buildDesktopIntentMetadata(guardedArgs, {
                    targetResolvedApp: focusGuard.targetResolvedApp,
                    focusRecoveryAttempted: focusGuard.focusRecoveryAttempted,
                    recoverySuppressedReason: focusGuard.recoverySuppressedReason,
                    verificationRequired: true,
                    verificationPassed: false,
                }));
            }
            const runtime = await this.ensureNativeRuntimeAvailable(toolCall);
            if (!isNativeRuntime(runtime))
                return runtime;
            try {
                let verificationPassed = false;
                const callArgs = {
                    sessionId: typeof args.sessionId === "string" ? args.sessionId : undefined,
                    app: typeof args.app === "string" ? args.app : focusGuard.targetResolvedApp || inferredTypingTarget,
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
                    if (preferBackground &&
                        (normalizedError.includes("background typing is unsupported") ||
                            normalizedError.includes("an event was unable to invoke any of the subscribers"))) {
                        const recoveredForeground = await this.enforceWindowTarget(toolCall, guardedArgs, {
                            preferBackground: false,
                        });
                        if (!recoveredForeground.ok) {
                            throw new Error(recoveredForeground.message || "Binary Host could not recover foreground focus for typing.");
                        }
                        return await runtime.typeIntoControl({
                            ...callArgs,
                            app: recoveredForeground.targetResolvedApp || callArgs.app,
                            title: recoveredForeground.targetWindowTitle || callArgs.title,
                            windowId: callArgs.windowId,
                            allowBackground: false,
                        });
                    }
                    const targetAppIntent = this.resolveTargetAppIntent(guardedArgs);
                    if (!targetAppIntent || !isWindowResolutionError(error))
                        throw error;
                    const recoveredFocus = await this.enforceWindowTarget(toolCall, guardedArgs, { preferBackground });
                    if (!recoveredFocus.ok) {
                        throw new Error(recoveredFocus.message || "Binary Host could not recover the intended app focus.");
                    }
                    return await runtime.typeIntoControl(callArgs);
                });
                const resolvedTypingApp = canonicalizeAppIntent(result.appName || inferredTypingTarget || focusGuard.targetAppIntent || guardedArgs.app);
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
                }
                return this.buildNativeResult(toolCall, `Typed into the requested native app control${result.windowTitle ? ` in ${result.windowTitle}` : ""}.`, {
                    ...receipt(result.focusStolen === true, "existing"),
                    sessionId: result.sessionId,
                    appName: result.appName,
                    windowId: result.windowId,
                    windowTitle: result.windowTitle,
                    selector: result.selector,
                    matchedControl: result.matchedControl,
                    controlType: result.matchedControl && typeof result.matchedControl.controlType === "string"
                        ? result.matchedControl.controlType
                        : undefined,
                    confidence: result.confidence,
                    fallbackMode: result.fallbackMode,
                    focusStolen: result.focusStolen === true,
                    ...this.buildDesktopIntentMetadata(guardedArgs, {
                        targetResolvedApp: result.appName || focusGuard.targetResolvedApp,
                        focusRecoveryAttempted: focusGuard.focusRecoveryAttempted,
                        recoverySuppressedReason: focusGuard.recoverySuppressedReason,
                        verificationRequired: true,
                        verificationPassed,
                    }),
                });
            }
            catch (error) {
                return failWithData(toolCall, error instanceof Error ? error.message : String(error), this.buildDesktopIntentMetadata(guardedArgs, {
                    targetResolvedApp: focusGuard.targetResolvedApp,
                    focusRecoveryAttempted: focusGuard.focusRecoveryAttempted,
                    recoverySuppressedReason: focusGuard.recoverySuppressedReason,
                    verificationRequired: true,
                    verificationPassed: false,
                }));
            }
        }
        if (toolCall.name === "desktop_select_control_option") {
            if (!this.policy.enabled || !this.policy.allowWholeMachineAccess) {
                return fail(toolCall, "Binary Host blocked desktop_select_control_option because machine autonomy is disabled.", true);
            }
            const optionText = String(args.optionText || args.option || "").trim();
            if (!optionText)
                return fail(toolCall, "desktop_select_control_option requires optionText.");
            const preferBackground = this.shouldPreferBackgroundExecution(args);
            const focusGuard = await this.enforceWindowTarget(toolCall, args, { preferBackground });
            if (!focusGuard.ok) {
                return failWithData(toolCall, focusGuard.message || "Binary Host could not focus the intended app window.", this.buildDesktopIntentMetadata(args, {
                    targetResolvedApp: focusGuard.targetResolvedApp,
                    focusRecoveryAttempted: focusGuard.focusRecoveryAttempted,
                    recoverySuppressedReason: focusGuard.recoverySuppressedReason,
                    verificationRequired: true,
                    verificationPassed: false,
                }));
            }
            const runtime = await this.ensureNativeRuntimeAvailable(toolCall);
            if (!isNativeRuntime(runtime))
                return runtime;
            try {
                const result = await runtime.selectOption({
                    sessionId: typeof args.sessionId === "string" ? args.sessionId : undefined,
                    app: typeof args.app === "string" ? args.app : focusGuard.targetResolvedApp,
                    title: typeof args.title === "string" ? args.title : focusGuard.targetWindowTitle,
                    windowId: sanitizeNativeWindowId(args.windowId),
                    query: typeof args.query === "string" ? args.query : undefined,
                    selector: asSelector(args.selector),
                    optionText,
                    allowBackground: preferBackground,
                });
                return this.buildNativeResult(toolCall, `Selected ${optionText} in the requested native app control.`, {
                    ...receipt(result.focusStolen === true, "existing"),
                    sessionId: result.sessionId,
                    appName: result.appName,
                    windowId: result.windowId,
                    windowTitle: result.windowTitle,
                    selector: result.selector,
                    matchedControl: result.matchedControl,
                    controlType: result.matchedControl && typeof result.matchedControl.controlType === "string"
                        ? result.matchedControl.controlType
                        : undefined,
                    confidence: result.confidence,
                    fallbackMode: result.fallbackMode,
                    focusStolen: result.focusStolen === true,
                    ...this.buildDesktopIntentMetadata(args, {
                        targetResolvedApp: result.appName || focusGuard.targetResolvedApp,
                        focusRecoveryAttempted: focusGuard.focusRecoveryAttempted,
                        recoverySuppressedReason: focusGuard.recoverySuppressedReason,
                        verificationRequired: true,
                        verificationPassed: false,
                    }),
                });
            }
            catch (error) {
                return failWithData(toolCall, error instanceof Error ? error.message : String(error), this.buildDesktopIntentMetadata(args, {
                    targetResolvedApp: focusGuard.targetResolvedApp,
                    focusRecoveryAttempted: focusGuard.focusRecoveryAttempted,
                    recoverySuppressedReason: focusGuard.recoverySuppressedReason,
                    verificationRequired: true,
                    verificationPassed: false,
                }));
            }
        }
        if (toolCall.name === "desktop_toggle_control") {
            if (!this.policy.enabled || !this.policy.allowWholeMachineAccess) {
                return fail(toolCall, "Binary Host blocked desktop_toggle_control because machine autonomy is disabled.", true);
            }
            const preferBackground = this.shouldPreferBackgroundExecution(args);
            const focusGuard = await this.enforceWindowTarget(toolCall, args, { preferBackground });
            if (!focusGuard.ok) {
                return failWithData(toolCall, focusGuard.message || "Binary Host could not focus the intended app window.", this.buildDesktopIntentMetadata(args, {
                    targetResolvedApp: focusGuard.targetResolvedApp,
                    focusRecoveryAttempted: focusGuard.focusRecoveryAttempted,
                    recoverySuppressedReason: focusGuard.recoverySuppressedReason,
                    verificationRequired: true,
                    verificationPassed: false,
                }));
            }
            const runtime = await this.ensureNativeRuntimeAvailable(toolCall);
            if (!isNativeRuntime(runtime))
                return runtime;
            try {
                const result = await runtime.toggleControl({
                    sessionId: typeof args.sessionId === "string" ? args.sessionId : undefined,
                    app: typeof args.app === "string" ? args.app : focusGuard.targetResolvedApp,
                    title: typeof args.title === "string" ? args.title : focusGuard.targetWindowTitle,
                    windowId: sanitizeNativeWindowId(args.windowId),
                    query: typeof args.query === "string" ? args.query : undefined,
                    selector: asSelector(args.selector),
                    desiredState: typeof args.desiredState === "boolean" ? args.desiredState : undefined,
                    allowBackground: preferBackground,
                });
                return this.buildNativeResult(toolCall, result.changed === false ? "The requested native app control was already in the desired state." : "Toggled the requested native app control.", {
                    ...receipt(result.focusStolen === true, "existing"),
                    sessionId: result.sessionId,
                    appName: result.appName,
                    windowId: result.windowId,
                    windowTitle: result.windowTitle,
                    selector: result.selector,
                    matchedControl: result.matchedControl,
                    controlType: result.matchedControl && typeof result.matchedControl.controlType === "string"
                        ? result.matchedControl.controlType
                        : undefined,
                    confidence: result.confidence,
                    fallbackMode: result.fallbackMode,
                    focusStolen: result.focusStolen === true,
                    changed: result.changed === true,
                    ...this.buildDesktopIntentMetadata(args, {
                        targetResolvedApp: result.appName || focusGuard.targetResolvedApp,
                        focusRecoveryAttempted: focusGuard.focusRecoveryAttempted,
                        recoverySuppressedReason: focusGuard.recoverySuppressedReason,
                        verificationRequired: true,
                        verificationPassed: false,
                    }),
                });
            }
            catch (error) {
                return failWithData(toolCall, error instanceof Error ? error.message : String(error), this.buildDesktopIntentMetadata(args, {
                    targetResolvedApp: focusGuard.targetResolvedApp,
                    focusRecoveryAttempted: focusGuard.focusRecoveryAttempted,
                    recoverySuppressedReason: focusGuard.recoverySuppressedReason,
                    verificationRequired: true,
                    verificationPassed: false,
                }));
            }
        }
        if (toolCall.name === "desktop_send_shortcut") {
            if (!this.policy.enabled || !this.policy.allowWholeMachineAccess) {
                return fail(toolCall, "Binary Host blocked desktop_send_shortcut because machine autonomy is disabled.", true);
            }
            if (this.shouldBlockIrreversibleAction(toolCall, args)) {
                return fail(toolCall, "Binary Host blocked a potentially irreversible native app shortcut without explicit authorization.", true);
            }
            const keys = String(args.keys || "").trim();
            if (!keys)
                return fail(toolCall, "desktop_send_shortcut requires keys.");
            const shortcutMathExpression = inferExpectedCalculatorResultFromShortcutKeys(keys);
            const inferredShortcutTarget = this.resolveTargetAppIntent(args) ||
                (shortcutMathExpression ? "Calculator" : undefined) ||
                (/\bcalculator|calc\b/i.test(String(this.task || "")) ? "Calculator" : undefined);
            const guardedArgs = inferredShortcutTarget ? { ...args, targetAppIntent: inferredShortcutTarget } : args;
            const targetAppIntent = this.resolveTargetAppIntent(guardedArgs);
            const calculatorShortcutIntent = canonicalizeAppIntent(targetAppIntent || guardedArgs.app) === "Calculator";
            const preferBackground = this.shouldPreferBackgroundExecution(guardedArgs);
            const focusGuard = await this.enforceWindowTarget(toolCall, guardedArgs, { preferBackground });
            if (!focusGuard.ok && !calculatorShortcutIntent) {
                return failWithData(toolCall, focusGuard.message || "Binary Host could not focus the intended app window.", this.buildDesktopIntentMetadata(guardedArgs, {
                    targetResolvedApp: focusGuard.targetResolvedApp,
                    focusRecoveryAttempted: focusGuard.focusRecoveryAttempted,
                    recoverySuppressedReason: focusGuard.recoverySuppressedReason,
                    verificationRequired: true,
                    verificationPassed: false,
                }));
            }
            const resolvedGuardedArgs = {
                ...guardedArgs,
                ...(focusGuard.targetWindowTitle ? { title: focusGuard.targetWindowTitle } : {}),
                ...(focusGuard.targetResolvedApp ? { app: focusGuard.targetResolvedApp } : {}),
            };
            const runtime = await this.ensureNativeRuntimeAvailable(toolCall);
            if (!isNativeRuntime(runtime))
                return runtime;
            try {
                let callArgs = {
                    sessionId: typeof resolvedGuardedArgs.sessionId === "string" ? resolvedGuardedArgs.sessionId : undefined,
                    app: typeof resolvedGuardedArgs.app === "string" ? resolvedGuardedArgs.app : inferredShortcutTarget,
                    title: typeof resolvedGuardedArgs.title === "string" ? resolvedGuardedArgs.title : undefined,
                    windowId: typeof resolvedGuardedArgs.windowId === "string"
                        ? resolvedGuardedArgs.windowId
                        : typeof resolvedGuardedArgs.windowId === "number"
                            ? String(resolvedGuardedArgs.windowId)
                            : undefined,
                    keys,
                    allowBackground: preferBackground,
                };
                if (calculatorShortcutIntent && !callArgs.sessionId) {
                    const bootstrap = await runtime
                        .readControl({
                        app: "Calculator",
                        query: "result display",
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
                const runShortcut = async () => await runtime.sendShortcut(callArgs).catch(async (error) => {
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
                    }
                    if (!targetAppIntent || !isWindowResolutionError(error))
                        throw error;
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
                        throw new Error(recoveredFocus.message || "Binary Host could not recover the intended app focus.");
                    }
                    return await runtime.sendShortcut(callArgs);
                });
                let result = calculatorShortcutIntent
                    ? (await invokeCalculatorExpressionViaControls(runtime, keys, {
                        sessionId: callArgs.sessionId,
                        app: callArgs.app || "Calculator",
                        title: callArgs.title,
                        windowId: callArgs.windowId,
                        allowBackground: preferBackground,
                    }).then((invoked) => invoked
                        ? {
                            ...invoked,
                            fallbackMode: "calculator_control_invoke",
                            keys,
                        }
                        : null)) || (await runShortcut())
                    : await runShortcut();
                let fallbackMode = result.fallbackMode;
                let verificationPassed = false;
                const shouldVerifyCalculator = canonicalizeAppIntent(targetAppIntent || result.appName) === "Calculator";
                if (shouldVerifyCalculator) {
                    const expectedFromKeys = inferExpectedCalculatorResultFromShortcutKeys(keys);
                    if (expectedFromKeys) {
                        const readAfterShortcut = await runtime
                            .readControl({
                            sessionId: result.sessionId,
                            app: "Calculator",
                            query: "result display",
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
                        if (!verifiedByRead &&
                            process.platform === "win32" &&
                            fallbackMode !== "calculator_control_invoke" &&
                            !preferBackground) {
                            const sendKeysPattern = toWindowsSendKeysPattern(keys);
                            const targetApp = escapePowerShellSingleQuoted(targetAppIntent || "Calculator");
                            const psKeys = escapePowerShellSingleQuoted(sendKeysPattern);
                            const psCommand = `powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; if (-not $ws.AppActivate('${targetApp}')) { throw 'Window not found.' }; Start-Sleep -Milliseconds 140; $ws.SendKeys('${psKeys}')"`; // fallback for Calculator when UIA shortcut dispatch is accepted but no state change appears
                            await runPlatformCommand(psCommand).catch(() => undefined);
                            fallbackMode = "windows_sendkeys";
                        }
                        const finalRead = await runtime
                            .readControl({
                            sessionId: result.sessionId,
                            app: "Calculator",
                            query: "result display",
                        })
                            .catch(() => null);
                        const finalText = String(finalRead?.value?.text || finalRead?.matchedControl?.textPreview || "");
                        verifiedByRead = textIncludesNumericToken(finalText, expectedFromKeys);
                        verificationPassed = verifiedByRead;
                    }
                }
                return this.buildNativeResult(toolCall, `Sent ${keys} to the active native app session.`, {
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
                        targetResolvedApp: result.appName || focusGuard.targetResolvedApp,
                        focusRecoveryAttempted: focusGuard.focusRecoveryAttempted,
                        recoverySuppressedReason: focusGuard.recoverySuppressedReason,
                        verificationRequired: true,
                        verificationPassed,
                    }),
                });
            }
            catch (error) {
                return failWithData(toolCall, error instanceof Error ? error.message : String(error), this.buildDesktopIntentMetadata(guardedArgs, {
                    targetResolvedApp: focusGuard.targetResolvedApp,
                    focusRecoveryAttempted: focusGuard.focusRecoveryAttempted,
                    recoverySuppressedReason: focusGuard.recoverySuppressedReason,
                    verificationRequired: true,
                    verificationPassed: false,
                }));
            }
        }
        if (toolCall.name === "desktop_wait_for_control") {
            if (!this.policy.enabled || !this.policy.allowDesktopObservation) {
                return fail(toolCall, "Binary Host blocked desktop_wait_for_control because desktop observation is disabled.", true);
            }
            const runtime = await this.ensureNativeRuntimeAvailable(toolCall);
            if (!isNativeRuntime(runtime))
                return runtime;
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
                return this.buildNativeResult(toolCall, "Observed the requested native app control.", {
                    ...receipt(result.focusStolen === true, "existing"),
                    sessionId: result.sessionId,
                    appName: result.appName,
                    windowId: result.windowId,
                    windowTitle: result.windowTitle,
                    selector: result.selector,
                    matchedControl: result.matchedControl,
                    controlType: result.matchedControl && typeof result.matchedControl.controlType === "string"
                        ? result.matchedControl.controlType
                        : undefined,
                    confidence: result.confidence,
                    fallbackMode: result.fallbackMode,
                    focusStolen: result.focusStolen === true,
                });
            }
            catch (error) {
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
            return fail(toolCall, `Binary Host has not implemented ${toolCall.name} yet. Prefer desktop_list_apps, desktop_open_app, desktop_query_controls, desktop_read_control, desktop_invoke_control, desktop_type_into_control, desktop_select_control_option, desktop_toggle_control, desktop_send_shortcut, desktop_wait_for_control, desktop_open_url, desktop_list_windows, desktop_get_active_window, desktop_focus_window, or desktop_wait for now.`, true);
        }
        return fail(toolCall, `Unsupported desktop tool ${toolCall.name}.`, true);
    }
}
