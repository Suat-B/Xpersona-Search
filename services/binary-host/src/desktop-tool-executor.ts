import { exec } from "node:child_process";
import os from "node:os";
import process from "node:process";
import { promisify } from "node:util";
import {
  MachineAutonomyController,
  type MachineAutonomyPolicy,
} from "./machine-autonomy.js";
import { AutonomyExecutionController } from "./autonomy-execution-controller.js";

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

async function openUrl(url: string): Promise<string> {
  if (process.platform === "win32") {
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
    ].join(" ");
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
  constructor(
    private readonly machineAutonomyController: MachineAutonomyController,
    private readonly policy: MachineAutonomyPolicy,
    private readonly executionController?: AutonomyExecutionController
  ) {}

  async execute(pendingToolCall: PendingToolCall): Promise<ToolResult> {
    const toolCall = pendingToolCall.toolCall;
    const args = toolCall.arguments || {};
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
      const app = String(args.app || "").trim();
      if (!app) return fail(toolCall, "desktop_open_app requires an app name.");
      try {
        const launched = await this.machineAutonomyController.launchApp(app);
        return {
          toolCallId: toolCall.id,
          name: toolCall.name,
          ok: true,
          summary: launched.summary,
          data: {
            ...receipt(decision?.executionVisibility === "visible_required", "none"),
            appId: launched.app.id,
            appName: launched.app.name,
            aliases: launched.app.aliases,
            source: launched.app.source,
            command: launched.command,
          },
          createdAt: launched.createdAt,
        };
      } catch (error) {
        return fail(toolCall, error instanceof Error ? error.message : String(error));
      }
    }

    if (toolCall.name === "desktop_open_url") {
      if (!this.policy.enabled || !this.policy.allowUrlOpen) {
        return fail(toolCall, "Binary Host blocked desktop_open_url because URL autonomy is disabled.", true);
      }
      const url = String(args.url || "").trim();
      if (!url) return fail(toolCall, "desktop_open_url requires a URL.");
      try {
        const command = await openUrl(url);
        return {
          toolCallId: toolCall.id,
          name: toolCall.name,
          ok: true,
          summary: `Opened ${url} in the default browser.`,
          data: { ...receipt(true, "existing"), url, command },
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
        const command = await focusWindow({
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
        `Binary Host has not implemented ${toolCall.name} yet. Prefer desktop_list_apps, desktop_open_app, desktop_open_url, desktop_list_windows, desktop_get_active_window, desktop_focus_window, or desktop_wait for now.`,
        true
      );
    }

    return fail(toolCall, `Unsupported desktop tool ${toolCall.name}.`, true);
  }
}
