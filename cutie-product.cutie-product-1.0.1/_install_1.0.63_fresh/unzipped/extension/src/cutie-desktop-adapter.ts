import * as vscode from "vscode";
import { execFile } from "child_process";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { promisify } from "util";
import { getExperimentalDesktopAdaptersEnabled } from "./config";
import { nowIso, randomId, validateDesktopApp } from "./cutie-policy";
import type { DesktopContextState, DesktopDisplay, DesktopSnapshotRef, DesktopWindow } from "./types";

const execFileAsync = promisify(execFile);
const screenshot = require("screenshot-desktop") as {
  (options?: { screen?: string | number; format?: string; filename?: string }): Promise<Buffer | string>;
  listDisplays?: () => Promise<Array<Record<string, unknown>>>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function safeString(value: unknown): string | undefined {
  const normalized = String(value || "").trim();
  return normalized || undefined;
}

function escapePowerShell(value: string): string {
  return value.replace(/'/g, "''");
}

function escapeAppleScript(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function normalizeDisplays(displays: Array<Record<string, unknown>>): DesktopDisplay[] {
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

function buildKeyChord(keys: string[]): string {
  const modifiers: string[] = [];
  let primary = "";
  for (const key of keys.map((item) => item.toLowerCase())) {
    if (key === "ctrl" || key === "control") modifiers.push("^");
    else if (key === "alt" || key === "option") modifiers.push("%");
    else if (key === "shift") modifiers.push("+");
    else if (key === "enter") primary = "{ENTER}";
    else if (key === "tab") primary = "{TAB}";
    else if (key === "escape" || key === "esc") primary = "{ESC}";
    else if (key === "up") primary = "{UP}";
    else if (key === "down") primary = "{DOWN}";
    else if (key === "left") primary = "{LEFT}";
    else if (key === "right") primary = "{RIGHT}";
    else if (key === "space") primary = " ";
    else primary = key.length === 1 ? key : `{${key.toUpperCase()}}`;
  }
  return `${modifiers.join("")}${primary || ""}`;
}

const DESKTOP_CONTEXT_CACHE_TTL_MS = 3_000;

export class CutieDesktopAdapter {
  private recentSnapshots: DesktopSnapshotRef[] = [];
  private desktopContextCache: { at: number; value: DesktopContextState } | null = null;

  /** Drops cached getDesktopContext() so the next call re-queries displays and active window. */
  invalidateDesktopContextCache(): void {
    this.desktopContextCache = null;
  }

  async getDesktopContext(): Promise<DesktopContextState> {
    const now = Date.now();
    if (
      this.desktopContextCache &&
      now - this.desktopContextCache.at < DESKTOP_CONTEXT_CACHE_TTL_MS
    ) {
      return {
        ...this.desktopContextCache.value,
        recentSnapshots: this.recentSnapshots.slice(0, 8),
      };
    }
    const displays = await this.listDisplays().catch(() => []);
    const activeWindow = await this.getActiveWindow().catch(() => null);
    const value: DesktopContextState = {
      platform: process.platform,
      displays,
      activeWindow,
      recentSnapshots: this.recentSnapshots.slice(0, 8),
      capabilities: {
        windowsSupported: process.platform === "win32",
        experimentalAdaptersEnabled: getExperimentalDesktopAdaptersEnabled(),
      },
    };
    this.desktopContextCache = { at: now, value };
    return value;
  }

  async captureScreen(displayId?: string): Promise<DesktopSnapshotRef> {
    const displays = await this.listDisplays().catch(() => []);
    const targetDisplay = displays.find((display) => display.id === displayId) || displays[0];
    const activeWindow = await this.getActiveWindow().catch(() => null);
    const filePath = path.join(os.tmpdir(), `cutie-snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`);
    await screenshot({
      filename: filePath,
      format: "png",
      ...(targetDisplay ? { screen: targetDisplay.id } : {}),
    });
    const snapshot: DesktopSnapshotRef = {
      snapshotId: randomId("cutie_snapshot"),
      displayId: targetDisplay?.id,
      width: targetDisplay?.width || 1,
      height: targetDisplay?.height || 1,
      mimeType: "image/png",
      capturedAt: nowIso(),
      filePath,
      activeWindow,
    };
    this.recentSnapshots = [snapshot, ...this.recentSnapshots.filter((item) => item.snapshotId !== snapshot.snapshotId)].slice(0, 12);
    this.invalidateDesktopContextCache();
    return snapshot;
  }

  async getActiveWindow(): Promise<DesktopWindow | null> {
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
      return this.runPowerShellJson<DesktopWindow>(script);
    }

    if (!this.experimentalAdaptersEnabled()) return null;

    if (process.platform === "darwin") {
      const app = await this.runAppleScript('tell application "System Events" to get name of first application process whose frontmost is true').catch(() => "");
      const title = await this.runAppleScript(
        'tell application "System Events" to tell (first application process whose frontmost is true) to get name of front window'
      ).catch(() => "");
      return { app: safeString(app), title: safeString(title) };
    }

    if (await this.commandExists("xdotool")) {
      const title = await this.runProcess("xdotool", ["getactivewindow", "getwindowname"]).catch(() => "");
      return { title: safeString(title) };
    }

    return null;
  }

  async listWindows(): Promise<DesktopWindow[]> {
    if (process.platform === "win32") {
      const script = [
        "Get-Process |",
        "  Where-Object { $_.MainWindowTitle } |",
        "  Select-Object @{Name='id';Expression={[string]$_.Id}}, @{Name='title';Expression={$_.MainWindowTitle}}, @{Name='app';Expression={$_.ProcessName}} |",
        "  ConvertTo-Json -Compress",
      ].join("\n");
      const value = await this.runPowerShellJson<DesktopWindow[] | DesktopWindow>(script);
      if (Array.isArray(value)) return value;
      return value ? [value] : [];
    }

    if (!this.experimentalAdaptersEnabled()) return [];

    if (process.platform === "darwin") {
      const app = await this.runAppleScript(
        'tell application "System Events" to get name of every application process whose background only is false'
      ).catch(() => "");
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

  async openApp(app: string, args: string[]): Promise<void> {
    const validation = validateDesktopApp(app);
    if (!validation.ok) throw new Error(validation.reason || "Desktop app launch blocked.");

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

  async openUrl(url: string): Promise<void> {
    await vscode.env.openExternal(vscode.Uri.parse(url));
  }

  async focusWindow(input: { windowId?: string; title?: string; app?: string }): Promise<void> {
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
      if (!app) throw new Error("desktop_focus_window requires an app on macOS.");
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

  async click(input: {
    displayId: string;
    normalizedX: number;
    normalizedY: number;
    button?: "left" | "right" | "middle";
    clickCount?: number;
  }): Promise<void> {
    const displays = await this.listDisplays();
    const display = displays.find((item) => item.id === input.displayId) || displays[0];
    const x = Math.round((display?.left || 0) + input.normalizedX * (display?.width || 1));
    const y = Math.round((display?.top || 0) + input.normalizedY * (display?.height || 1));
    const count = Math.max(1, Math.min(input.clickCount || 1, 4));

    if (process.platform === "win32") {
      const flags =
        input.button === "right"
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

  async typeText(text: string): Promise<void> {
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

  async keypress(keys: string[]): Promise<void> {
    if (!keys.length) throw new Error("desktop_keypress requires at least one key.");

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
      await this.runAppleScript(
        `tell application "System Events" to keystroke "${escapeAppleScript(key)}"${modifiers.length ? ` using {${modifiers.join(", ")}}` : ""}`
      );
      return;
    }
    if (await this.commandExists("xdotool")) {
      await this.runProcess("xdotool", ["key", keys.join("+")]);
      return;
    }

    throw new Error("desktop_keypress is unsupported on this platform.");
  }

  async scroll(input: { deltaX?: number; deltaY?: number }): Promise<void> {
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

  async wait(durationMs: number, signal?: AbortSignal): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error("Request aborted"));
        return;
      }
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, Math.max(0, Math.min(durationMs, 120_000)));
      const onAbort = () => {
        clearTimeout(timer);
        reject(new Error("Request aborted"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  private async listDisplays(): Promise<DesktopDisplay[]> {
    if (typeof screenshot.listDisplays !== "function") return [];
    const raw = await screenshot.listDisplays();
    return normalizeDisplays(raw || []);
  }

  private experimentalAdaptersEnabled(): boolean {
    return getExperimentalDesktopAdaptersEnabled();
  }

  private ensureExperimentalDesktopSupport(): void {
    if (process.platform === "win32") return;
    if (!this.experimentalAdaptersEnabled()) {
      throw new Error("Non-Windows desktop automation is disabled unless cutie-product.experimentalDesktopAdapters is enabled.");
    }
  }

  private async runPowerShell(script: string): Promise<string> {
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

  private async runPowerShellJson<T>(script: string): Promise<T> {
    const output = await this.runPowerShell(script);
    const trimmed = output.trim();
    if (!trimmed) {
      return null as T;
    }
    return JSON.parse(trimmed) as T;
  }

  private async runAppleScript(script: string): Promise<string> {
    return this.runProcess("osascript", ["-e", script]);
  }

  private async runProcess(command: string, args: string[]): Promise<string> {
    const { stdout, stderr } = await execFileAsync(command, args, {
      windowsHide: true,
      maxBuffer: 2_000_000,
    });
    const output = String(stdout || "").trim();
    const errorOutput = String(stderr || "").trim();
    if (!output && errorOutput) {
      return errorOutput;
    }
    return output;
  }

  private async commandExists(command: string): Promise<boolean> {
    try {
      if (process.platform === "win32") {
        await this.runProcess("where.exe", [command]);
      } else {
        await this.runProcess("which", [command]);
      }
      return true;
    } catch {
      return false;
    }
  }
}
