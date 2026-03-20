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
exports.CutieDesktopAdapter = void 0;
const vscode = __importStar(require("vscode"));
const child_process_1 = require("child_process");
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const util_1 = require("util");
const config_1 = require("./config");
const cutie_policy_1 = require("./cutie-policy");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
const screenshot = require("screenshot-desktop");
function asRecord(value) {
    return value && typeof value === "object" ? value : {};
}
function safeString(value) {
    const normalized = String(value || "").trim();
    return normalized || undefined;
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
class CutieDesktopAdapter {
    constructor() {
        this.recentSnapshots = [];
    }
    async getDesktopContext() {
        const displays = await this.listDisplays().catch(() => []);
        const activeWindow = await this.getActiveWindow().catch(() => null);
        return {
            platform: process.platform,
            displays,
            activeWindow,
            recentSnapshots: this.recentSnapshots.slice(0, 8),
            capabilities: {
                windowsSupported: process.platform === "win32",
                experimentalAdaptersEnabled: (0, config_1.getExperimentalDesktopAdaptersEnabled)(),
            },
        };
    }
    async captureScreen(displayId) {
        const displays = await this.listDisplays().catch(() => []);
        const targetDisplay = displays.find((display) => display.id === displayId) || displays[0];
        const activeWindow = await this.getActiveWindow().catch(() => null);
        const filePath = path.join(os.tmpdir(), `cutie-snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`);
        await screenshot({
            filename: filePath,
            format: "png",
            ...(targetDisplay ? { screen: targetDisplay.id } : {}),
        });
        const snapshot = {
            snapshotId: (0, cutie_policy_1.randomId)("cutie_snapshot"),
            displayId: targetDisplay?.id,
            width: targetDisplay?.width || 1,
            height: targetDisplay?.height || 1,
            mimeType: "image/png",
            capturedAt: (0, cutie_policy_1.nowIso)(),
            filePath,
            activeWindow,
        };
        this.recentSnapshots = [snapshot, ...this.recentSnapshots.filter((item) => item.snapshotId !== snapshot.snapshotId)].slice(0, 12);
        return snapshot;
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
        if (!this.experimentalAdaptersEnabled())
            return null;
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
        if (!this.experimentalAdaptersEnabled())
            return [];
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
        const validation = (0, cutie_policy_1.validateDesktopApp)(app);
        if (!validation.ok)
            throw new Error(validation.reason || "Desktop app launch blocked.");
        if (process.platform === "win32") {
            const script = `Start-Process -FilePath '${escapePowerShell(app)}'${args.length ? ` -ArgumentList ${args.map((arg) => `'${escapePowerShell(arg)}'`).join(", ")}` : ""}`;
            await this.runPowerShell(script);
            return;
        }
        this.ensureExperimentalDesktopSupport();
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
    async openUrl(url) {
        await vscode.env.openExternal(vscode.Uri.parse(url));
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
        this.ensureExperimentalDesktopSupport();
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
        throw new Error("desktop_focus_window is unsupported on this platform.");
    }
    async click(input) {
        const displays = await this.listDisplays();
        const display = displays.find((item) => item.id === input.displayId) || displays[0];
        const x = Math.round((display?.left || 0) + input.normalizedX * (display?.width || 1));
        const y = Math.round((display?.top || 0) + input.normalizedY * (display?.height || 1));
        const count = Math.max(1, Math.min(input.clickCount || 1, 4));
        if (process.platform === "win32") {
            const flags = input.button === "right"
                ? { down: 0x0008, up: 0x0010 }
                : input.button === "middle"
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
        this.ensureExperimentalDesktopSupport();
        if (process.platform === "darwin" && (await this.commandExists("cliclick"))) {
            await this.runProcess("cliclick", [`c:${x},${y}`]);
            return;
        }
        if (await this.commandExists("xdotool")) {
            const button = input.button === "right" ? "3" : input.button === "middle" ? "2" : "1";
            await this.runProcess("xdotool", ["mousemove", String(x), String(y), "click", "--repeat", String(count), button]);
            return;
        }
        throw new Error("desktop_click is unsupported on this platform.");
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
        this.ensureExperimentalDesktopSupport();
        if (process.platform === "darwin") {
            await this.runAppleScript(`tell application "System Events" to keystroke "${escapeAppleScript(text)}"`);
            return;
        }
        if (await this.commandExists("xdotool")) {
            await this.runProcess("xdotool", ["type", "--delay", "12", text]);
            return;
        }
        throw new Error("desktop_type is unsupported on this platform.");
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
        this.ensureExperimentalDesktopSupport();
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
        throw new Error("desktop_keypress is unsupported on this platform.");
    }
    async scroll(input) {
        if (process.platform === "win32") {
            const amount = Math.round(input.deltaY || 0);
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
        this.ensureExperimentalDesktopSupport();
        if (process.platform === "darwin" && (await this.commandExists("cliclick"))) {
            await this.runProcess("cliclick", [`w:${Math.round(input.deltaY || 0)}`]);
            return;
        }
        if (await this.commandExists("xdotool")) {
            const button = (input.deltaY || 0) < 0 ? "5" : "4";
            const repeats = Math.max(1, Math.min(Math.abs(Math.round((input.deltaY || 0) / 120)) || 1, 20));
            await this.runProcess("xdotool", ["click", "--repeat", String(repeats), button]);
            return;
        }
        throw new Error("desktop_scroll is unsupported on this platform.");
    }
    async wait(durationMs, signal) {
        await new Promise((resolve, reject) => {
            if (signal?.aborted) {
                reject(new Error("Request aborted"));
                return;
            }
            const timer = setTimeout(() => {
                signal?.removeEventListener("abort", onAbort);
                resolve();
            }, Math.max(0, Math.min(durationMs, 120000)));
            const onAbort = () => {
                clearTimeout(timer);
                reject(new Error("Request aborted"));
            };
            signal?.addEventListener("abort", onAbort, { once: true });
        });
    }
    async listDisplays() {
        if (typeof screenshot.listDisplays !== "function")
            return [];
        const raw = await screenshot.listDisplays();
        return normalizeDisplays(raw || []);
    }
    experimentalAdaptersEnabled() {
        return (0, config_1.getExperimentalDesktopAdaptersEnabled)();
    }
    ensureExperimentalDesktopSupport() {
        if (process.platform === "win32")
            return;
        if (!this.experimentalAdaptersEnabled()) {
            throw new Error("Non-Windows desktop automation is disabled unless cutie-product.experimentalDesktopAdapters is enabled.");
        }
    }
    async runPowerShell(script) {
        return this.runProcess("powershell.exe", [
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ]);
    }
    async runPowerShellJson(script) {
        const output = await this.runPowerShell(script);
        const trimmed = output.trim();
        if (!trimmed) {
            return null;
        }
        return JSON.parse(trimmed);
    }
    async runAppleScript(script) {
        return this.runProcess("osascript", ["-e", script]);
    }
    async runProcess(command, args) {
        const { stdout, stderr } = await execFileAsync(command, args, {
            windowsHide: true,
            maxBuffer: 2000000,
        });
        const output = String(stdout || "").trim();
        const errorOutput = String(stderr || "").trim();
        if (!output && errorOutput) {
            return errorOutput;
        }
        return output;
    }
    async commandExists(command) {
        try {
            if (process.platform === "win32") {
                await this.runProcess("where.exe", [command]);
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
exports.CutieDesktopAdapter = CutieDesktopAdapter;
//# sourceMappingURL=cutie-desktop-adapter.js.map