import { describe, expect, it } from "vitest";
import { DesktopToolExecutor } from "./desktop-tool-executor.js";
import type { MachineAutonomyController, MachineAutonomyPolicy } from "./machine-autonomy.js";

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
});
