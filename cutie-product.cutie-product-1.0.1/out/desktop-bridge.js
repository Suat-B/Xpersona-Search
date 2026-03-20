"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DesktopAutomationBridge = void 0;
const vscode = __importStar(require("vscode"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const vscode_core_1 = require("@xpersona/vscode-core");
const config_1 = require("./config");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
const screenshot = require("screenshot-desktop");
function asRecord(value) {
    return value && typeof value === "object" ? value : {};
}
function safeString(value) {
    const normalized = String(value || "").trim();
    return normalized || undefined;
}
function waitWithAbort(durationMs, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new Error("Request aborted"));
            return;
        }
        const timer = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }, durationMs);
        const onAbort = () => {
            clearTimeout(timer);
            reject(new Error("Request aborted"));
        };
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}
function escapePowerShell(value) {
    return value.replace(/'/g, "''");
}
function escapeAppleScript(value) {
    return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
function normalizeDisplays(displays) {
    return displays.map((display, index) => ({
        id: String(display.id ?? index),
        label: String(display.name ?? display.id ?? `Display ${index + 1}`),
        width: Number(display.width || 1),
        height: Number(display.height || 1),
        isPrimary: Boolean(display.primary ?? display.isPrimary ?? index === 0),
        scaleFactor: typeof display.dpiScale === "number" ? display.dpiScale : undefined,
        left: typeof display.left === "number" ? display.left : typeof display.x === "number" ? display.x : 0,
        top: typeof display.top === "number" ? display.top : typeof display.y === "number" ? display.y : 0,
    }));
}
function buildKeyChord(keys) {
    const modifiers = [];
    let primary = "";
    for (const key of keys.map((item) => item.toLowerCase())) {
        if (key === "ctrl" || key === "control")
            modifiers.push("^");
        else if (key === "alt" || key === "option")
            modifiers.push("%");
        else if (key === "shift")
            modifiers.push("+");
        else if (key === "enter")
            primary = "{ENTER}";
        else if (key === "tab")
            primary = "{TAB}";
        else if (key === "escape" || key === "esc")
            primary = "{ESC}";
        else if (key === "up")
            primary = "{UP}";
        else if (key === "down")
            primary = "{DOWN}";
        else if (key === "left")
            primary = "{LEFT}";
        else if (key === "right")
            primary = "{RIGHT}";
        else if (key === "space")
            primary = " ";
        else
            primary = key.length === 1 ? key : `{${key.toUpperCase()}}`;
    }
    return `${modifiers.join("")}${primary || ""}`;
}
class DesktopAutomationBridge {
    constructor() {
        this.recentSnapshots = [];
    }
    getSupportedTools() {
        return [
            "desktop_capture_screen",
            "desktop_get_active_window",
            "desktop_list_windows",
            "desktop_open_app",
            "desktop_open_url",
            "desktop_focus_window",
            "desktop_click",
            "desktop_type",
            "desktop_keypress",
            "desktop_scroll",
            "desktop_wait",
        ];
    }
    async getDesktopContext() {
        const displays = await this.listDisplays().catch(() => []);
        const activeWindow = await this.getActiveWindow().catch(() => null);
        return {
            platform: process.platform,
            displays,
            activeWindow,
            recentSnapshots: this.recentSnapshots.slice(0, 8),
        };
    }
    async captureAndUploadSnapshot(input) {
        const displays = await this.listDisplays().catch(() => []);
        const targetDisplay = displays.find((display) => display.id === input.displayId) || displays[0];
        const activeWindow = await this.getActiveWindow().catch(() => null);
        const raw = await screenshot({
            format: "png",
            ...(targetDisplay ? { screen: targetDisplay.id } : {}),
        });
        const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw || ""), "utf8");
        const uploaded = await (0, vscode_core_1.requestJson)("POST", `${(0, config_1.getBaseApiUrl)()}/api/v1/playground/desktop/snapshots`, input.auth, {
            sessionId: input.sessionId || undefined,
            displayId: targetDisplay?.id,
            width: targetDisplay?.width || 1,
            height: targetDisplay?.height || 1,
            mimeType: "image/png",
            dataBase64: buffer.toString("base64"),
            activeWindow: activeWindow || undefined,
        });
        const snapshot = {
            snapshotId: uploaded.snapshotId,
            displayId: uploaded.displayId,
            width: uploaded.width,
            height: uploaded.height,
            mimeType: uploaded.mimeType,
            capturedAt: uploaded.capturedAt,
            activeWindow: uploaded.activeWindow,
        };
        this.recentSnapshots = [snapshot, ...this.recentSnapshots.filter((item) => item.snapshotId !== snapshot.snapshotId)].slice(0, 12);
        return snapshot;
    }
    async executeToolCall(input) {
        const tool = input.pendingToolCall.toolCall;
        const args = asRecord(tool.arguments);
        try {
            if (tool.name === "desktop_capture_screen") {
                const snapshot = await this.captureAndUploadSnapshot({
                    auth: input.auth,
                    sessionId: input.sessionId,
                    displayId: safeString(args.displayId),
                });
                return {
                    toolCallId: tool.id,
                    name: tool.name,
                    ok: true,
                    summary: `Captured desktop snapshot ${snapshot.snapshotId}.`,
                    data: snapshot,
                    createdAt: new Date().toISOString(),
                };
            }
            if (tool.name === "desktop_get_active_window") {
                const activeWindow = await this.getActiveWindow();
                return {
                    toolCallId: tool.id,
                    name: tool.name,
                    ok: true,
                    summary: activeWindow?.title ? `Active window: ${activeWindow.title}` : "No active window detected.",
                    data: { activeWindow: activeWindow || null },
                    createdAt: new Date().toISOString(),
                };
            }
            if (tool.name === "desktop_list_windows") {
                const windows = await this.listWindows();
                return {
                    toolCallId: tool.id,
                    name: tool.name,
                    ok: true,
                    summary: `Found ${windows.length} desktop window(s).`,
                    data: { windows },
                    createdAt: new Date().toISOString(),
                };
            }
            if (tool.name === "desktop_wait") {
                const durationMs = Math.max(0, Math.min(Number(args.durationMs || 0), 120000));
                await this.ensureApproved({ type: "desktop_wait", durationMs }, input.auth, input.sessionId, input.workspaceFingerprint);
                await waitWithAbort(durationMs, input.signal);
                return {
                    toolCallId: tool.id,
                    name: tool.name,
                    ok: true,
                    summary: `Waited ${durationMs}ms.`,
                    data: { durationMs },
                    createdAt: new Date().toISOString(),
                };
            }
            if (tool.name === "desktop_open_url") {
                const url = String(args.url || "");
                await this.ensureApproved({ type: "desktop_open_url", url }, input.auth, input.sessionId, input.workspaceFingerprint);
                await vscode.env.openExternal(vscode.Uri.parse(url));
                return {
                    toolCallId: tool.id,
                    name: tool.name,
                    ok: true,
                    summary: `Opened ${url}.`,
                    data: { url },
                    createdAt: new Date().toISOString(),
                };
            }
            if (tool.name === "desktop_open_app") {
                const app = String(args.app || "");
                const appArgs = Array.isArray(args.args) ? args.args.filter((item) => typeof item === "string") : [];
                await this.ensureApproved({ type: "desktop_open_app", app, args: appArgs }, input.auth, input.sessionId, input.workspaceFingerprint);
                await this.openApp(app, appArgs);
                return {
                    toolCallId: tool.id,
                    name: tool.name,
                    ok: true,
                    summary: `Opened app ${app}.`,
                    data: { app, args: appArgs },
                    createdAt: new Date().toISOString(),
                };
            }
            if (tool.name === "desktop_focus_window") {
                const action = {
                    type: "desktop_focus_window",
                    windowId: safeString(args.windowId),
                    title: safeString(args.title),
                    app: safeString(args.app),
                };
                await this.ensureApproved(action, input.auth, input.sessionId, input.workspaceFingerprint);
                await this.focusWindow(action);
                return {
                    toolCallId: tool.id,
                    name: tool.name,
                    ok: true,
                    summary: `Focused ${action.title || action.app || action.windowId || "window"}.`,
                    data: action,
                    createdAt: new Date().toISOString(),
                };
            }
            if (tool.name === "desktop_type") {
                const action = {
                    type: "desktop_type",
                    text: String(args.text || ""),
                };
                await this.ensureApproved(action, input.auth, input.sessionId, input.workspaceFingerprint);
                await this.typeText(action.text);
                return {
                    toolCallId: tool.id,
                    name: tool.name,
                    ok: true,
                    summary: `Typed ${Math.min(action.text.length, 80)} characters.`,
                    data: { length: action.text.length },
                    createdAt: new Date().toISOString(),
                };
            }
            if (tool.name === "desktop_keypress") {
                const action = {
                    type: "desktop_keypress",
                    keys: Array.isArray(args.keys) ? args.keys.filter((item) => typeof item === "string") : [],
                };
                await this.ensureApproved(action, input.auth, input.sessionId, input.workspaceFingerprint);
                await this.keypress(action.keys);
                return {
                    toolCallId: tool.id,
                    name: tool.name,
                    ok: true,
                    summary: `Sent keypress ${action.keys.join("+")}.`,
                    data: { keys: action.keys },
                    createdAt: new Date().toISOString(),
                };
            }
            if (tool.name === "desktop_click") {
                const displays = await this.listDisplays();
                const display = displays.find((item) => item.id === String(args.displayId || ""));
                const action = {
                    type: "desktop_click",
                    displayId: String(args.displayId || ""),
                    normalizedX: Number(args.normalizedX || 0),
                    normalizedY: Number(args.normalizedY || 0),
                    button: safeString(args.button),
                    clickCount: typeof args.clickCount === "number" ? args.clickCount : undefined,
                    viewport: {
                        displayId: String(asRecord(args.viewport).displayId || args.displayId || ""),
                        width: Number(asRecord(args.viewport).width || display?.width || 1),
                        height: Number(asRecord(args.viewport).height || display?.height || 1),
                    },
                };
                await this.ensureApproved(action, input.auth, input.sessionId, input.workspaceFingerprint);
                await this.click(action, display);
                return {
                    toolCallId: tool.id,
                    name: tool.name,
                    ok: true,
                    summary: `Clicked ${action.button || "left"} on ${action.displayId}.`,
                    data: action,
                    createdAt: new Date().toISOString(),
                };
            }
            if (tool.name === "desktop_scroll") {
                const action = {
                    type: "desktop_scroll",
                    displayId: safeString(args.displayId),
                    deltaX: typeof args.deltaX === "number" ? args.deltaX : undefined,
                    deltaY: typeof args.deltaY === "number" ? args.deltaY : undefined,
                };
                await this.ensureApproved(action, input.auth, input.sessionId, input.workspaceFingerprint);
                await this.scroll(action);
                return {
                    toolCallId: tool.id,
                    name: tool.name,
                    ok: true,
                    summary: "Scrolled desktop.",
                    data: action,
                    createdAt: new Date().toISOString(),
                };
            }
            return {
                toolCallId: tool.id,
                name: tool.name,
                ok: false,
                summary: `Unsupported tool ${tool.name}.`,
                error: `Unsupported tool ${tool.name}.`,
                createdAt: new Date().toISOString(),
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                toolCallId: tool.id,
                name: tool.name,
                ok: false,
                blocked: /blocked/i.test(message) || /unsupported/i.test(message),
                summary: message,
                error: message,
                createdAt: new Date().toISOString(),
            };
        }
    }
    async ensureApproved(action, auth, sessionId, workspaceFingerprint) {
        const response = await (0, vscode_core_1.requestJson)("POST", `${(0, config_1.getBaseApiUrl)()}/api/v1/playground/execute`, auth, {
            sessionId: sessionId || undefined,
            workspaceFingerprint,
            actions: [action],
        });
        const result = response.results?.[0];
        if (result?.status === "blocked") {
            throw new Error(result.reason || "Desktop action blocked by policy.");
        }
    }
    async listDisplays() {
        if (typeof screenshot.listDisplays !== "function")
            return [];
        const raw = await screenshot.listDisplays();
        return normalizeDisplays(raw || []);
    }
    async getActiveWindow() {
        if (process.platform === "win32") {
            const script = [
                "Add-Type @'",
                "using System;",
                "using System.Text;",
                "using System.Runtime.InteropServices;",
                "public static class Win32 {",
                "  [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow();",
                "  [DllImport(\"user32.dll\", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);",
                "  [DllImport(\"user32.dll\")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);",
                "}",
                "'@",
                "$hwnd = [Win32]::GetForegroundWindow()",
                "$sb = New-Object System.Text.StringBuilder 1024",
                "[void][Win32]::GetWindowText($hwnd, $sb, $sb.Capacity)",
                "$pid = 0",
                "[void][Win32]::GetWindowThreadProcessId($hwnd, [ref]$pid)",
                "$process = Get-Process -Id $pid -ErrorAction SilentlyContinue",
                "@{ id = [string]$hwnd; title = $sb.ToString(); app = if ($process) { $process.ProcessName } else { '' } } | ConvertTo-Json -Compress",
            ].join("\n");
            return this.runPowerShellJson(script);
        }
        if (process.platform === "darwin") {
            const app = await this.runAppleScript('tell application "System Events" to get name of first application process whose frontmost is true').catch(() => "");
            const title = await this.runAppleScript('tell application "System Events" to tell (first application process whose frontmost is true) to get name of front window').catch(() => "");
            return { app: safeString(app), title: safeString(title) };
        }
        if (await this.commandExists("xdotool")) {
            const title = await this.runProcess("xdotool", ["getactivewindow", "getwindowname"]).catch(() => "");
            return { title: safeString(title) };
        }
        return null;
    }
    async listWindows() {
        if (process.platform === "win32") {
            const script = [
                "Get-Process |",
                "  Where-Object { $_.MainWindowTitle } |",
                "  Select-Object @{Name='id';Expression={[string]$_.Id}}, @{Name='title';Expression={$_.MainWindowTitle}}, @{Name='app';Expression={$_.ProcessName}} |",
                "  ConvertTo-Json -Compress",
            ].join("\n");
            const value = await this.runPowerShellJson(script);
            if (Array.isArray(value))
                return value;
            return value ? [value] : [];
        }
        if (process.platform === "darwin") {
            const app = await this.runAppleScript('tell application "System Events" to get name of every application process whose background only is false').catch(() => "");
            return String(app || "")
                .split(/,\s*/)
                .filter(Boolean)
                .map((name) => ({ app: name, title: name }));
        }
        if (await this.commandExists("wmctrl")) {
            const output = await this.runProcess("wmctrl", ["-lx"]);
            return output
                .split(/\r?\n/)
                .filter(Boolean)
                .map((line) => {
                const parts = line.trim().split(/\s+/, 5);
                return {
                    id: parts[0],
                    app: parts[2],
                    title: parts[4],
                };
            });
        }
        return [];
    }
    async openApp(app, args) {
        if (process.platform === "win32") {
            const script = `Start-Process -FilePath '${escapePowerShell(app)}'${args.length ? ` -ArgumentList ${args.map((arg) => `'${escapePowerShell(arg)}'`).join(", ")}` : ""}`;
            await this.runPowerShell(script);
            return;
        }
        if (process.platform === "darwin") {
            await this.runProcess("open", ["-a", app, ...args]);
            return;
        }
        if (await this.commandExists("gtk-launch")) {
            await this.runProcess("gtk-launch", [app, ...args]);
            return;
        }
        await this.runProcess(app, args);
    }
    async focusWindow(input) {
        if (process.platform === "win32") {
            const target = input.title || input.app || input.windowId || "";
            const script = [
                "$shell = New-Object -ComObject WScript.Shell",
                `$ok = $shell.AppActivate('${escapePowerShell(target)}')`,
                "if (-not $ok) { throw 'Could not activate the requested window.' }",
            ].join("\n");
            await this.runPowerShell(script);
            return;
        }
        if (process.platform === "darwin") {
            const app = input.app || input.title;
            if (!app)
                throw new Error("desktop_focus_window requires an app on macOS.");
            await this.runAppleScript(`tell application "${escapeAppleScript(app)}" to activate`);
            return;
        }
        if (await this.commandExists("wmctrl")) {
            if (input.windowId) {
                await this.runProcess("wmctrl", ["-ia", input.windowId]);
                return;
            }
            if (input.title) {
                await this.runProcess("wmctrl", ["-a", input.title]);
                return;
            }
        }
        throw new Error("desktop_focus_window is unsupported on this platform without wmctrl.");
    }
    async typeText(text) {
        if (process.platform === "win32") {
            const escaped = text.replace(/[+^%~(){}]/g, "{$&}").replace(/\r?\n/g, "{ENTER}");
            const script = [
                "Add-Type -AssemblyName System.Windows.Forms",
                `[System.Windows.Forms.SendKeys]::SendWait('${escapePowerShell(escaped)}')`,
            ].join("\n");
            await this.runPowerShell(script);
            return;
        }
        if (process.platform === "darwin") {
            await this.runAppleScript(`tell application "System Events" to keystroke "${escapeAppleScript(text)}"`);
            return;
        }
        if (await this.commandExists("xdotool")) {
            await this.runProcess("xdotool", ["type", "--delay", "12", text]);
            return;
        }
        throw new Error("desktop_type is unsupported on this platform without xdotool.");
    }
    async keypress(keys) {
        if (!keys.length)
            throw new Error("desktop_keypress requires at least one key.");
        if (process.platform === "win32") {
            const script = [
                "Add-Type -AssemblyName System.Windows.Forms",
                `[System.Windows.Forms.SendKeys]::SendWait('${escapePowerShell(buildKeyChord(keys))}')`,
            ].join("\n");
            await this.runPowerShell(script);
            return;
        }
        if (process.platform === "darwin") {
            const key = keys[keys.length - 1];
            const modifiers = keys.slice(0, -1).map((item) => `${item.toLowerCase()} down`);
            await this.runAppleScript(`tell application "System Events" to keystroke "${escapeAppleScript(key)}"${modifiers.length ? ` using {${modifiers.join(", ")}}` : ""}`);
            return;
        }
        if (await this.commandExists("xdotool")) {
            await this.runProcess("xdotool", ["key", keys.join("+")]);
            return;
        }
        throw new Error("desktop_keypress is unsupported on this platform without xdotool.");
    }
    async click(action, display) {
        const x = Math.round((display?.left || 0) + action.normalizedX * (display?.width || 1));
        const y = Math.round((display?.top || 0) + action.normalizedY * (display?.height || 1));
        const count = Math.max(1, Math.min(action.clickCount || 1, 4));
        if (process.platform === "win32") {
            const flags = action.button === "right"
                ? { down: 0x0008, up: 0x0010 }
                : action.button === "middle"
                    ? { down: 0x0020, up: 0x0040 }
                    : { down: 0x0002, up: 0x0004 };
            const script = [
                "Add-Type @'",
                "using System;",
                "using System.Runtime.InteropServices;",
                "public static class MouseOps {",
                "  [DllImport(\"user32.dll\")] public static extern bool SetCursorPos(int X, int Y);",
                "  [DllImport(\"user32.dll\")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);",
                "}",
                "'@",
                `[MouseOps]::SetCursorPos(${x}, ${y}) | Out-Null`,
                `1..${count} | ForEach-Object { [MouseOps]::mouse_event(${flags.down}, 0, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 30; [MouseOps]::mouse_event(${flags.up}, 0, 0, 0, [UIntPtr]::Zero) }`,
            ].join("\n");
            await this.runPowerShell(script);
            return;
        }
        if (process.platform === "darwin" && (await this.commandExists("cliclick"))) {
            await this.runProcess("cliclick", [`c:${x},${y}`]);
            return;
        }
        if (await this.commandExists("xdotool")) {
            const button = action.button === "right" ? "3" : action.button === "middle" ? "2" : "1";
            await this.runProcess("xdotool", ["mousemove", String(x), String(y), "click", "--repeat", String(count), button]);
            return;
        }
        throw new Error("desktop_click is unsupported on this platform without local click tooling.");
    }
    async scroll(action) {
        if (process.platform === "win32") {
            const amount = Math.round(action.deltaY || 0);
            const script = [
                "Add-Type @'",
                "using System;",
                "using System.Runtime.InteropServices;",
                "public static class MouseOps {",
                "  [DllImport(\"user32.dll\")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);",
                "}",
                "'@",
                `[MouseOps]::mouse_event(0x0800, 0, 0, [uint32]${Math.round(amount * 120)}, [UIntPtr]::Zero)`,
            ].join("\n");
            await this.runPowerShell(script);
            return;
        }
        if (process.platform === "darwin" && (await this.commandExists("cliclick"))) {
            await this.runProcess("cliclick", [`w:${Math.round(action.deltaY || 0)}`]);
            return;
        }
        if (await this.commandExists("xdotool")) {
            const button = (action.deltaY || 0) < 0 ? "5" : "4";
            const repeats = Math.max(1, Math.min(Math.abs(Math.round((action.deltaY || 0) / 120)) || 1, 20));
            await this.runProcess("xdotool", ["click", "--repeat", String(repeats), button]);
            return;
        }
        throw new Error("desktop_scroll is unsupported on this platform without local scroll tooling.");
    }
    async runPowerShell(script) {
        const { stdout, stderr } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], {
            windowsHide: true,
            timeout: 20000,
            maxBuffer: 2000000,
        });
        return String(stdout || stderr || "").trim();
    }
    async runPowerShellJson(script) {
        const raw = await this.runPowerShell(script);
        return JSON.parse(raw || "null");
    }
    async runAppleScript(script) {
        const { stdout } = await execFileAsync("osascript", ["-e", script], {
            timeout: 20000,
            maxBuffer: 2000000,
        });
        return String(stdout || "").trim();
    }
    async runProcess(command, args) {
        const { stdout, stderr } = await execFileAsync(command, args, {
            timeout: 20000,
            maxBuffer: 2000000,
            windowsHide: true,
        });
        return String(stdout || stderr || "").trim();
    }
    async commandExists(command) {
        try {
            if (process.platform === "win32") {
                await this.runProcess("where", [command]);
            }
            else {
                await this.runProcess("which", [command]);
            }
            return true;
        }
        catch {
            return false;
        }
    }
}
exports.DesktopAutomationBridge = DesktopAutomationBridge;
//# sourceMappingURL=desktop-bridge.js.map