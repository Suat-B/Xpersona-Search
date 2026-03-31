import { describe, expect, it } from "vitest";
import {
  findBestAppMatch,
  parseMachineAutonomyTask,
  parseSteamAppManifest,
  type DiscoveredApp,
} from "./machine-autonomy.js";

function buildApp(input: Partial<DiscoveredApp> & Pick<DiscoveredApp, "id" | "name" | "source" | "launch">): DiscoveredApp {
  return {
    platform: "win32",
    aliases: [input.name],
    ...input,
  };
}

describe("machine-autonomy", () => {
  it("parses natural app launch tasks", () => {
    expect(parseMachineAutonomyTask("Open Dota")).toEqual({
      kind: "launch_app",
      query: "Dota",
      originalTask: "Open Dota",
    });
    expect(parseMachineAutonomyTask("launch Discord please.")).toEqual({
      kind: "launch_app",
      query: "Discord please",
      originalTask: "launch Discord please.",
    });
    expect(parseMachineAutonomyTask("Summarize my repo")).toBeNull();
  });

  it("parses steam app manifests", () => {
    const raw = `"AppState"\n{\n  "appid" "570"\n  "name" "Dota 2"\n}\n`;
    expect(parseSteamAppManifest(raw)).toEqual({
      appId: "570",
      name: "Dota 2",
    });
  });

  it("prefers exact and alias matches for app launch queries", () => {
    const apps: DiscoveredApp[] = [
      buildApp({
        id: "steam:570",
        name: "Dota 2",
        aliases: ["Dota", "Dota 2", "Dota 2 Steam"],
        source: "windows_steam",
        launch: { kind: "shell", target: "steam://rungameid/570" },
      }),
      buildApp({
        id: "start:discord",
        name: "Discord",
        aliases: ["Discord"],
        source: "windows_start_apps",
        launch: { kind: "shell", target: "shell:AppsFolder\\Discord" },
      }),
    ];

    expect(findBestAppMatch(apps, "Open Dota".replace(/^Open\s+/i, ""))?.id).toBe("steam:570");
    expect(findBestAppMatch(apps, "discord")?.id).toBe("start:discord");
  });
});
