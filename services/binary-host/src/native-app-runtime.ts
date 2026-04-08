import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, execFile, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { matchNativeAppAdapter, type NativeAppAdapter } from "./native-app-adapters.js";

const execFileAsync = promisify(execFile);

type NativeAppMethod =
  | "ping"
  | "list_windows"
  | "get_active_window"
  | "query_controls"
  | "read_control"
  | "invoke_control"
  | "type_into_control"
  | "select_option"
  | "toggle_control"
  | "send_shortcut"
  | "wait_for_control";

type PendingResponse = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

type SidecarResponse = {
  id?: string;
  ok?: boolean;
  result?: Record<string, unknown>;
  error?: { message?: string };
};

type NativeAppSession = {
  id: string;
  appName?: string;
  windowId?: string;
  windowTitle?: string;
  adapterId?: string;
  lastSeenAt: string;
};

export type NativeAppStatus = {
  platform: string;
  available: boolean;
  version: string;
  pythonCommand?: string;
  pythonVersion?: string;
  lastLaunchError?: string;
  scriptPath?: string;
};

export type NativeAppControlSelector = {
  automationId?: string;
  name?: string;
  text?: string;
  controlType?: string;
  className?: string;
  index?: number;
};

export type NativeAppWindowTarget = {
  sessionId?: string;
  app?: string;
  title?: string;
  windowId?: string;
  allowBackground?: boolean;
};

export type NativeAppQueryResult = {
  sessionId: string;
  appName?: string;
  windowId?: string;
  windowTitle?: string;
  adapterId?: string;
  controls: Array<Record<string, unknown>>;
  confidence?: number;
  fallbackMode?: string;
  focusStolen?: boolean;
};

type NativeAppActionResult = {
  sessionId: string;
  appName?: string;
  windowId?: string;
  windowTitle?: string;
  adapterId?: string;
  selector?: NativeAppControlSelector;
  matchedControl?: Record<string, unknown>;
  confidence?: number;
  fallbackMode?: string;
  focusStolen?: boolean;
  value?: Record<string, unknown>;
  changed?: boolean;
  keys?: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function dirnameFromImportMeta(metaUrl: string): string {
  return path.dirname(fileURLToPath(metaUrl));
}

function buildScriptPath(): string {
  const currentDir = dirnameFromImportMeta(import.meta.url);
  const resourcePath = path.resolve(currentDir, "../resources/native_app_sidecar.py");
  if (existsSync(resourcePath)) return resourcePath;
  return path.resolve(currentDir, "../src/../resources/native_app_sidecar.py");
}

function buildRequirementsPath(): string {
  const currentDir = dirnameFromImportMeta(import.meta.url);
  const resourcePath = path.resolve(currentDir, "../resources/requirements.txt");
  if (existsSync(resourcePath)) return resourcePath;
  return path.resolve(currentDir, "../src/../resources/requirements.txt");
}

function buildAdapterPayload(adapter: NativeAppAdapter | null): Record<string, unknown> | undefined {
  if (!adapter) return undefined;
  return {
    id: adapter.id,
    preferredControlTypes: adapter.preferredControlTypes,
    semanticAreas: adapter.semanticAreas,
  };
}

export class NativeAppRuntime {
  private child: ChildProcessWithoutNullStreams | null = null;
  private readBuffer = "";
  private readonly pending = new Map<string, PendingResponse>();
  private readonly sessions = new Map<string, NativeAppSession>();
  private status: NativeAppStatus = {
    platform: process.platform,
    available: false,
    version: "0.1.0",
  };
  private readonly pythonSitePackages = path.join(os.homedir(), ".binary-ide", "host", "python-site-packages");

  async getStatus(): Promise<NativeAppStatus> {
    if (process.platform !== "win32") {
      return {
        platform: process.platform,
        available: false,
        version: this.status.version,
        lastLaunchError: "Native app automation is only implemented on Windows in v1.",
      };
    }
    try {
      await this.ensureStarted();
      await this.ping();
    } catch (error) {
      this.status.available = false;
      this.status.lastLaunchError = error instanceof Error ? error.message : String(error);
    }
    return { ...this.status, scriptPath: buildScriptPath() };
  }

  async listWindows(): Promise<Record<string, unknown>> {
    return (await this.call("list_windows", {})) as Record<string, unknown>;
  }

  async getActiveWindow(): Promise<Record<string, unknown>> {
    return (await this.call("get_active_window", {})) as Record<string, unknown>;
  }

  async queryControls(input: NativeAppWindowTarget & { query?: string; selector?: NativeAppControlSelector; limit?: number }): Promise<NativeAppQueryResult> {
    const session = this.resolveSession(input);
    const adapter = matchNativeAppAdapter(session?.appName || input.app, session?.windowTitle || input.title);
    const result = (await this.call("query_controls", {
      ...this.buildTargetPayload(input, session),
      ...(input.query ? { query: input.query } : {}),
      ...(input.selector ? { selector: input.selector } : {}),
      ...(input.limit ? { limit: input.limit } : {}),
      ...(buildAdapterPayload(adapter) ? { adapter: buildAdapterPayload(adapter) } : {}),
    })) as Record<string, unknown>;
    const nextSession = this.upsertSession({
      ...session,
      id: session?.id || randomUUID(),
      appName: typeof result.appName === "string" ? result.appName : session?.appName || input.app,
      windowId: typeof result.windowId === "string" ? result.windowId : session?.windowId || input.windowId,
      windowTitle: typeof result.windowTitle === "string" ? result.windowTitle : session?.windowTitle || input.title,
      adapterId: typeof result.adapterId === "string" ? result.adapterId : adapter?.id,
      lastSeenAt: nowIso(),
    });
    return {
      sessionId: nextSession.id,
      appName: nextSession.appName,
      windowId: nextSession.windowId,
      windowTitle: nextSession.windowTitle,
      adapterId: nextSession.adapterId,
      controls: Array.isArray(result.controls) ? (result.controls as Array<Record<string, unknown>>) : [],
      confidence: typeof result.confidence === "number" ? result.confidence : undefined,
      fallbackMode: typeof result.fallbackMode === "string" ? result.fallbackMode : undefined,
      focusStolen: result.focusStolen === true,
    };
  }

  async readControl(input: NativeAppWindowTarget & { query?: string; selector?: NativeAppControlSelector }): Promise<NativeAppActionResult> {
    return this.callAction("read_control", input);
  }

  async invokeControl(input: NativeAppWindowTarget & { query?: string; selector?: NativeAppControlSelector }): Promise<NativeAppActionResult> {
    return this.callAction("invoke_control", input);
  }

  async typeIntoControl(
    input: NativeAppWindowTarget & { query?: string; selector?: NativeAppControlSelector; text: string; append?: boolean }
  ): Promise<NativeAppActionResult> {
    return this.callAction("type_into_control", input);
  }

  async selectOption(
    input: NativeAppWindowTarget & { query?: string; selector?: NativeAppControlSelector; optionText: string }
  ): Promise<NativeAppActionResult> {
    return this.callAction("select_option", input);
  }

  async toggleControl(
    input: NativeAppWindowTarget & { query?: string; selector?: NativeAppControlSelector; desiredState?: boolean }
  ): Promise<NativeAppActionResult> {
    return this.callAction("toggle_control", input);
  }

  async sendShortcut(input: NativeAppWindowTarget & { keys: string }): Promise<NativeAppActionResult> {
    return this.callAction("send_shortcut", input);
  }

  async waitForControl(
    input: NativeAppWindowTarget & { query?: string; selector?: NativeAppControlSelector; timeoutMs?: number }
  ): Promise<NativeAppActionResult> {
    return this.callAction("wait_for_control", input);
  }

  private async callAction(method: NativeAppMethod, input: Record<string, unknown>): Promise<NativeAppActionResult> {
    const session = this.resolveSession(input as NativeAppWindowTarget);
    const adapter = matchNativeAppAdapter(session?.appName || String(input.app || ""), session?.windowTitle || String(input.title || ""));
    const result = (await this.call(method, {
      ...this.buildTargetPayload(input as NativeAppWindowTarget, session),
      ...input,
      ...(buildAdapterPayload(adapter) ? { adapter: buildAdapterPayload(adapter) } : {}),
    })) as Record<string, unknown>;
    const nextSession = this.upsertSession({
      ...session,
      id: session?.id || randomUUID(),
      appName: typeof result.appName === "string" ? result.appName : session?.appName || String(input.app || "") || undefined,
      windowId: typeof result.windowId === "string" ? result.windowId : session?.windowId || String(input.windowId || "") || undefined,
      windowTitle: typeof result.windowTitle === "string" ? result.windowTitle : session?.windowTitle || String(input.title || "") || undefined,
      adapterId: typeof result.adapterId === "string" ? result.adapterId : adapter?.id,
      lastSeenAt: nowIso(),
    });
    return {
      sessionId: nextSession.id,
      appName: nextSession.appName,
      windowId: nextSession.windowId,
      windowTitle: nextSession.windowTitle,
      adapterId: nextSession.adapterId,
      selector: this.toSelector(result.selector),
      matchedControl: this.toRecord(result.matchedControl) || undefined,
      confidence: typeof result.confidence === "number" ? result.confidence : undefined,
      fallbackMode: typeof result.fallbackMode === "string" ? result.fallbackMode : undefined,
      focusStolen: result.focusStolen === true,
      value: this.toRecord(result.value) || undefined,
      changed: result.changed === true,
      keys: typeof result.keys === "string" ? result.keys : undefined,
    };
  }

  private resolveSession(input: NativeAppWindowTarget): NativeAppSession | null {
    if (input.sessionId && this.sessions.has(input.sessionId)) {
      return this.sessions.get(input.sessionId) || null;
    }
    return null;
  }

  private upsertSession(session: NativeAppSession): NativeAppSession {
    this.sessions.set(session.id, session);
    for (const [id, existing] of this.sessions.entries()) {
      if (id === session.id) continue;
      if (
        existing.windowId &&
        session.windowId &&
        existing.windowId === session.windowId
      ) {
        this.sessions.delete(id);
      }
    }
    return session;
  }

  private buildTargetPayload(input: NativeAppWindowTarget, session: NativeAppSession | null): Record<string, unknown> {
    return {
      ...(session?.windowId || input.windowId ? { windowId: session?.windowId || input.windowId } : {}),
      ...(session?.windowTitle || input.title ? { title: session?.windowTitle || input.title } : {}),
      ...(session?.appName || input.app ? { app: session?.appName || input.app } : {}),
    };
  }

  private toRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  }

  private toSelector(value: unknown): NativeAppControlSelector | undefined {
    const record = this.toRecord(value);
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

  private async ping(): Promise<void> {
    const result = (await this.call("ping", {})) as Record<string, unknown>;
    this.status = {
      platform: process.platform,
      available: result.available === true,
      version: typeof result.version === "string" ? result.version : this.status.version,
      pythonCommand: this.status.pythonCommand,
      pythonVersion: typeof result.pythonVersion === "string" ? result.pythonVersion : this.status.pythonVersion,
      lastLaunchError: typeof result.importError === "string" && result.importError.trim() ? result.importError : undefined,
      scriptPath: buildScriptPath(),
    };
    if (!this.status.available) {
      throw new Error(
        this.status.lastLaunchError ||
          "Native app sidecar did not report itself as available."
      );
    }
  }

  private async ensureStarted(): Promise<void> {
    if (process.platform !== "win32") {
      throw new Error("Native app automation is only implemented on Windows in v1.");
    }
    if (this.child && !this.child.killed && this.child.exitCode === null) {
      return;
    }

    const scriptPath = buildScriptPath();
    await this.ensurePythonDependenciesInstalled();
    const child = spawn("python", ["-u", scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      cwd: path.dirname(scriptPath),
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        PYTHONPATH: [
          this.pythonSitePackages,
          process.env.PYTHONPATH || "",
        ]
          .filter(Boolean)
          .join(path.delimiter),
      },
    });
    this.status.pythonCommand = "python";
    this.status.scriptPath = scriptPath;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      this.readBuffer += chunk;
      while (true) {
        const boundary = this.readBuffer.indexOf("\n");
        if (boundary < 0) break;
        const line = this.readBuffer.slice(0, boundary).trim();
        this.readBuffer = this.readBuffer.slice(boundary + 1);
        if (!line) continue;
        this.handleResponseLine(line);
      }
    });
    child.stderr.on("data", (chunk: string) => {
      this.status.lastLaunchError = String(chunk || "").trim() || this.status.lastLaunchError;
    });
    child.on("exit", () => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error(this.status.lastLaunchError || "Native app sidecar exited unexpectedly."));
      }
      this.pending.clear();
      this.child = null;
      this.status.available = false;
    });
    child.on("error", (error) => {
      this.status.lastLaunchError = error instanceof Error ? error.message : String(error);
    });
    this.child = child;
  }

  private handleResponseLine(line: string): void {
    let payload: SidecarResponse;
    try {
      payload = JSON.parse(line) as SidecarResponse;
    } catch {
      this.status.lastLaunchError = `Invalid sidecar response: ${line.slice(0, 200)}`;
      return;
    }
    const id = typeof payload.id === "string" ? payload.id : "";
    if (!id || !this.pending.has(id)) return;
    const pending = this.pending.get(id) as PendingResponse;
    clearTimeout(pending.timeout);
    this.pending.delete(id);
    if (payload.ok) {
      pending.resolve(payload.result || {});
      return;
    }
    pending.reject(new Error(payload.error?.message || "Unknown native app sidecar error."));
  }

  private async call(method: NativeAppMethod, params: Record<string, unknown>): Promise<unknown> {
    await this.ensureStarted();
    const child = this.child;
    if (!child) {
      throw new Error("Native app sidecar failed to start.");
    }
    const id = randomUUID();
    const timeoutMs = this.resolveMethodTimeoutMs(method, params);
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Native app sidecar timed out while handling ${method} after ${timeoutMs}ms.`));
      }, timeoutMs);
      timeout.unref?.();
      this.pending.set(id, {
        resolve,
        reject,
        timeout,
      });
      child.stdin.write(
        `${JSON.stringify({
          id,
          method,
          params,
        })}\n`
      );
    });
  }

  private resolveMethodTimeoutMs(method: NativeAppMethod, params: Record<string, unknown>): number {
    if (method === "wait_for_control") {
      const requested =
        typeof params.timeoutMs === "number" && Number.isFinite(params.timeoutMs)
          ? params.timeoutMs
          : Number.NaN;
      if (Number.isFinite(requested)) {
        return Math.max(2_500, Math.min(Math.round(requested + 1_200), 12_000));
      }
      return 7_500;
    }
    if (method === "query_controls" || method === "read_control" || method === "get_active_window" || method === "list_windows") {
      return 6_000;
    }
    if (method === "ping") return 4_000;
    return 9_000;
  }

  private async ensurePythonDependenciesInstalled(): Promise<void> {
    const moduleAvailable = await this.checkPythonModuleAvailable("pywinauto", {
      PYTHONPATH: [this.pythonSitePackages, process.env.PYTHONPATH || ""].filter(Boolean).join(path.delimiter),
    });
    if (moduleAvailable) return;

    const requirementsPath = buildRequirementsPath();
    try {
      await execFileAsync(
        "python",
        [
          "-m",
          "pip",
          "install",
          "--disable-pip-version-check",
          "--upgrade",
          "--target",
          this.pythonSitePackages,
          "-r",
          requirementsPath,
        ],
        {
          windowsHide: true,
          maxBuffer: 10_000_000,
        }
      );
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? `Binary Host could not install native app sidecar dependencies automatically: ${error.message}`
          : "Binary Host could not install native app sidecar dependencies automatically."
      );
    }
  }

  private async checkPythonModuleAvailable(moduleName: string, extraEnv?: Record<string, string>): Promise<boolean> {
    try {
      await execFileAsync(
        "python",
        ["-c", `import importlib.util, sys; sys.exit(0 if importlib.util.find_spec(${JSON.stringify(moduleName)}) else 1)`],
        {
          windowsHide: true,
          env: {
            ...process.env,
            ...(extraEnv || {}),
          },
        }
      );
      return true;
    } catch {
      return false;
    }
  }
}
