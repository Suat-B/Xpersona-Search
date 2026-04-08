import { describe, expect, it } from "vitest";
import { DesktopToolExecutor } from "./desktop-tool-executor.js";
import type { MachineAutonomyController, MachineAutonomyPolicy } from "./machine-autonomy.js";
import type { NativeAppRuntime } from "./native-app-runtime.js";

function buildPolicy(overrides: Partial<MachineAutonomyPolicy> = {}): MachineAutonomyPolicy {
  return {
    enabled: true,
    alwaysOn: true,
    allowAppLaunch: true,
    allowShellCommands: true,
    allowUrlOpen: true,
    allowFileOpen: true,
    allowDesktopObservation: true,
    allowBrowserNative: true,
    allowEventAgents: true,
    allowWholeMachineAccess: true,
    allowElevation: true,
    focusPolicy: "never_steal",
    sessionPolicy: "attach_carefully",
    allowVisibleFallback: false,
    autonomyPosture: "near_total",
    suppressForegroundWhileTyping: true,
    focusLeaseTtlMs: 4000,
    preferTerminalForCoding: true,
    browserAttachMode: "existing_or_managed",
    allowedBrowsers: ["chrome", "edge", "brave", "arc", "chromium"],
    blockedDomains: [],
    elevatedTrustDomains: [],
    updatedAt: new Date("2026-03-31T00:00:00.000Z").toISOString(),
    ...overrides,
  };
}

function buildPendingToolCall(name: string, args: Record<string, unknown> = {}) {
  return {
    step: 1,
    adapter: "test",
    requiresClientExecution: true,
    createdAt: new Date("2026-03-31T00:00:00.000Z").toISOString(),
    toolCall: {
      id: `${name}_1`,
      name,
      arguments: args,
    },
  };
}

describe("DesktopToolExecutor", () => {
  it("lists discovered apps for orchestration", async () => {
    const controller = {
      listApps: async () => ({
        indexedAt: "2026-03-31T00:00:00.000Z",
        apps: [
          {
            id: "steam:570",
            name: "Dota 2",
            aliases: ["Dota", "Dota 2"],
            source: "windows_steam",
            platform: "win32",
            launch: { kind: "shell", target: "steam://rungameid/570" },
          },
        ],
      }),
      launchApp: async () => {
        throw new Error("unused");
      },
    } as unknown as MachineAutonomyController;

    const executor = new DesktopToolExecutor(controller, buildPolicy());
    const result = await executor.execute(buildPendingToolCall("desktop_list_apps", { limit: 10 }));

    expect(result.ok).toBe(true);
    expect(result.data?.apps).toEqual([
      expect.objectContaining({
        id: "steam:570",
        name: "Dota 2",
        aliases: ["Dota", "Dota 2"],
      }),
    ]);
  });

  it("launches discovered apps when autonomy is enabled", async () => {
    const controller = {
      listApps: async () => ({ indexedAt: "2026-03-31T00:00:00.000Z", apps: [] }),
      launchApp: async (query: string) => ({
        createdAt: "2026-03-31T00:00:00.000Z",
        summary: `Launched ${query}.`,
        command: "steam://rungameid/570",
        app: {
          id: "steam:570",
          name: "Dota 2",
          aliases: ["Dota", "Dota 2"],
          source: "windows_steam",
          platform: "win32",
          launch: { kind: "shell", target: "steam://rungameid/570" },
        },
      }),
    } as unknown as MachineAutonomyController;

    const executor = new DesktopToolExecutor(controller, buildPolicy());
    const result = await executor.execute(buildPendingToolCall("desktop_open_app", { app: "Dota" }));

    expect(result.ok).toBe(true);
    expect(result.summary).toContain("Launched Dota");
    expect(result.data).toMatchObject({
      appName: "Dota 2",
      source: "windows_steam",
    });
  });

  it("blocks app launches when app-launch autonomy is disabled", async () => {
    const controller = {
      listApps: async () => ({ indexedAt: "2026-03-31T00:00:00.000Z", apps: [] }),
      launchApp: async () => {
        throw new Error("unused");
      },
    } as unknown as MachineAutonomyController;

    const executor = new DesktopToolExecutor(controller, buildPolicy({ allowAppLaunch: false }));
    const result = await executor.execute(buildPendingToolCall("desktop_open_app", { app: "Dota" }));

    expect(result.ok).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.summary).toContain("app launch autonomy is disabled");
  });

  it("returns a clear blocked result for unsupported desktop tools", async () => {
    const controller = {
      listApps: async () => ({ indexedAt: "2026-03-31T00:00:00.000Z", apps: [] }),
      launchApp: async () => {
        throw new Error("unused");
      },
    } as unknown as MachineAutonomyController;

    const executor = new DesktopToolExecutor(controller, buildPolicy());
    const result = await executor.execute(buildPendingToolCall("desktop_click", { normalizedX: 0.5, normalizedY: 0.5 }));

    expect(result.ok).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.summary).toContain("has not implemented desktop_click yet");
  });

  it("queries semantic native app controls through the native runtime", async () => {
    const controller = {
      listApps: async () => ({ indexedAt: "2026-03-31T00:00:00.000Z", apps: [] }),
      launchApp: async () => {
        throw new Error("unused");
      },
    } as unknown as MachineAutonomyController;
    const nativeRuntime = {
      getStatus: async () => ({
        platform: "win32",
        available: true,
        version: "0.1.0",
      }),
      queryControls: async () => ({
        sessionId: "session-1",
        appName: "Notepad",
        windowId: "100",
        windowTitle: "Untitled - Notepad",
        adapterId: "notepad",
        controls: [
          {
            name: "Text Editor",
            controlType: "Edit",
            selector: { controlType: "Edit", name: "Text Editor", index: 0 },
            confidence: 1,
          },
        ],
        confidence: 1,
        fallbackMode: "native_uia",
      }),
    } as unknown as NativeAppRuntime;

    const executor = new DesktopToolExecutor(controller, buildPolicy(), undefined, nativeRuntime, "Open Notepad and write groceries");
    const result = await executor.execute(buildPendingToolCall("desktop_query_controls", { app: "Notepad", query: "editor" }));

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      sessionId: "session-1",
      appName: "Notepad",
      controls: [expect.objectContaining({ controlType: "Edit" })],
      fallbackMode: "native_uia",
    });
  });

  it("blocks dangerous native invoke actions without explicit user authorization", async () => {
    const controller = {
      listApps: async () => ({ indexedAt: "2026-03-31T00:00:00.000Z", apps: [] }),
      launchApp: async () => {
        throw new Error("unused");
      },
    } as unknown as MachineAutonomyController;
    const nativeRuntime = {
      getStatus: async () => ({
        platform: "win32",
        available: true,
        version: "0.1.0",
      }),
      invokeControl: async () => ({
        sessionId: "session-1",
        appName: "Discord",
        windowId: "300",
        windowTitle: "Discord",
        matchedControl: { name: "Send", controlType: "Button" },
        selector: { name: "Send", controlType: "Button" },
        confidence: 0.98,
        fallbackMode: "native_uia",
        focusStolen: true,
      }),
    } as unknown as NativeAppRuntime;

    const executor = new DesktopToolExecutor(controller, buildPolicy(), undefined, nativeRuntime, "Open Discord and draft a note");
    const result = await executor.execute(
      buildPendingToolCall("desktop_invoke_control", {
        app: "Discord",
        selector: { name: "Send", controlType: "Button" },
      })
    );

    expect(result.ok).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.summary).toContain("irreversible native app action");
  });

  it("allows dangerous native invoke actions when the task explicitly authorizes them", async () => {
    const controller = {
      listApps: async () => ({ indexedAt: "2026-03-31T00:00:00.000Z", apps: [] }),
      launchApp: async () => {
        throw new Error("unused");
      },
    } as unknown as MachineAutonomyController;
    const nativeRuntime = {
      getStatus: async () => ({
        platform: "win32",
        available: true,
        version: "0.1.0",
      }),
      invokeControl: async () => ({
        sessionId: "session-1",
        appName: "Discord",
        windowId: "300",
        windowTitle: "Discord",
        matchedControl: { name: "Send", controlType: "Button" },
        selector: { name: "Send", controlType: "Button" },
        confidence: 0.98,
        fallbackMode: "native_uia",
        focusStolen: true,
      }),
    } as unknown as NativeAppRuntime;

    const executor = new DesktopToolExecutor(
      controller,
      buildPolicy(),
      undefined,
      nativeRuntime,
      'Launch Discord and message Sam "Hi thanks for dinner last night"'
    );
    const result = await executor.execute(
      buildPendingToolCall("desktop_invoke_control", {
        app: "Discord",
        selector: { name: "Send", controlType: "Button" },
      })
    );

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      appName: "Discord",
      controlType: "Button",
      focusStolen: true,
    });
  });

  it("marks calculator verification as failed when display does not match expected result", async () => {
    const controller = {
      listApps: async () => ({ indexedAt: "2026-03-31T00:00:00.000Z", apps: [] }),
      launchApp: async () => {
        throw new Error("unused");
      },
    } as unknown as MachineAutonomyController;
    const nativeRuntime = {
      getStatus: async () => ({
        platform: "win32",
        available: true,
        version: "0.1.0",
      }),
      readControl: async () => ({
        sessionId: "session-1",
        appName: "Calculator",
        windowId: "300",
        windowTitle: "Calculator",
        matchedControl: { name: "Display", controlType: "Text", textPreview: "Display is 0" },
        selector: { automationId: "CalculatorResults", controlType: "Text" },
        confidence: 1,
        fallbackMode: "native_uia",
        focusStolen: true,
        value: { text: "Display is 0" },
      }),
    } as unknown as NativeAppRuntime;

    const executor = new DesktopToolExecutor(
      controller,
      buildPolicy(),
      undefined,
      nativeRuntime,
      "Launch Calculator and tell me what 9*9 is"
    );
    const result = await executor.execute(
      buildPendingToolCall("desktop_read_control", {
        app: "Calculator",
        targetAppIntent: "Calculator",
        query: "result display",
        verificationRequired: true,
      })
    );

    expect(result.ok).toBe(true);
    expect(result.data?.verificationRequired).toBe(true);
    expect(result.data?.verificationPassed).toBe(false);
  });

  it("marks calculator verification as passed when display matches expected result", async () => {
    const controller = {
      listApps: async () => ({ indexedAt: "2026-03-31T00:00:00.000Z", apps: [] }),
      launchApp: async () => {
        throw new Error("unused");
      },
    } as unknown as MachineAutonomyController;
    const nativeRuntime = {
      getStatus: async () => ({
        platform: "win32",
        available: true,
        version: "0.1.0",
      }),
      readControl: async () => ({
        sessionId: "session-1",
        appName: "Calculator",
        windowId: "300",
        windowTitle: "Calculator",
        matchedControl: { name: "Display", controlType: "Text", textPreview: "Display is 81" },
        selector: { automationId: "CalculatorResults", controlType: "Text" },
        confidence: 1,
        fallbackMode: "native_uia",
        focusStolen: true,
        value: { text: "Display is 81" },
      }),
    } as unknown as NativeAppRuntime;

    const executor = new DesktopToolExecutor(
      controller,
      buildPolicy(),
      undefined,
      nativeRuntime,
      "Launch Calculator and tell me what 9*9 is"
    );
    const result = await executor.execute(
      buildPendingToolCall("desktop_read_control", {
        app: "Calculator",
        targetAppIntent: "Calculator",
        query: "result display",
        verificationRequired: true,
      })
    );

    expect(result.ok).toBe(true);
    expect(result.data?.verificationRequired).toBe(true);
    expect(result.data?.verificationPassed).toBe(true);
  });

  it("supports chained calculator task phrasing for verification", async () => {
    const controller = {
      listApps: async () => ({ indexedAt: "2026-03-31T00:00:00.000Z", apps: [] }),
      launchApp: async () => {
        throw new Error("unused");
      },
    } as unknown as MachineAutonomyController;
    const nativeRuntime = {
      getStatus: async () => ({
        platform: "win32",
        available: true,
        version: "0.1.0",
      }),
      readControl: async () => ({
        sessionId: "session-1",
        appName: "Calculator",
        windowId: "300",
        windowTitle: "Calculator",
        matchedControl: { name: "Display", controlType: "Text", textPreview: "Display is 154" },
        selector: { automationId: "CalculatorResults", controlType: "Text" },
        confidence: 1,
        fallbackMode: "native_uia",
        focusStolen: true,
        value: { text: "Display is 154" },
      }),
    } as unknown as NativeAppRuntime;

    const executor = new DesktopToolExecutor(
      controller,
      buildPolicy(),
      undefined,
      nativeRuntime,
      "Open Calculator and compute 12*12, then plus 10, and tell me the final result."
    );
    const result = await executor.execute(
      buildPendingToolCall("desktop_read_control", {
        app: "Calculator",
        targetAppIntent: "Calculator",
        query: "result display",
        verificationRequired: true,
      })
    );

    expect(result.ok).toBe(true);
    expect(result.data?.verificationRequired).toBe(true);
    expect(result.data?.verificationPassed).toBe(true);
  });
});
