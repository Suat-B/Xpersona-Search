import { describe, expect, it } from "vitest";

import {
  getRemoteRuntimeHealth,
  resolveExecutionLane,
  resolveOpenHandsPluginPacks,
  resolveOpenHandsSkillSources,
  shouldEnableSampledTracing,
} from "./openhands-capabilities.js";

describe("openhands-capabilities", () => {
  it("routes detached deep work to the headless lane by default", () => {
    const decision = resolveExecutionLane({
      task: "Refactor the build system and run tests",
      workspaceTrustMode: "trusted_full_access",
      taskSpeedClass: "deep_code",
      detach: true,
      remoteConfigured: false,
    });

    expect(decision.lane).toBe("openhands_headless");
  });

  it("prefers the remote lane for isolated long work when remote is available", () => {
    const decision = resolveExecutionLane({
      task: "Audit and repair dependencies in a read-only workspace",
      workspaceTrustMode: "trusted_read_only",
      taskSpeedClass: "tool_heavy",
      detach: true,
      requireIsolation: true,
      remoteConfigured: true,
    });

    expect(decision.lane).toBe("openhands_remote");
  });

  it("keeps native desktop tasks on the local interactive lane", () => {
    const decision = resolveExecutionLane({
      task: "Open Notepad and draft a grocery list",
      workspaceTrustMode: "trusted_full_access",
      taskSpeedClass: "simple_action",
      detach: false,
      remoteConfigured: true,
    });

    expect(decision.lane).toBe("local_interactive");
  });

  it("resolves plugin packs from task intent", () => {
    const packs = resolveOpenHandsPluginPacks({
      task: "Debug the web app and repair the failing QA flow after upgrading dependencies",
    });
    const ids = packs.map((pack) => pack.id);

    expect(ids).toContain("web-debug");
    expect(ids).toContain("qa-repair");
    expect(ids).toContain("dependency-maintenance");
  });

  it("enables sampled tracing for headless and debug work", () => {
    expect(
      shouldEnableSampledTracing({
        lane: "openhands_headless",
      })
    ).toBe(true);
    expect(
      shouldEnableSampledTracing({
        lane: "local_interactive",
      })
    ).toBe(false);
  });

  it("returns unavailable remote health when no remote runtime is configured", async () => {
    const previousRemoteGateway = process.env.OPENHANDS_REMOTE_GATEWAY_URL;
    const previousAgentServer = process.env.OPENHANDS_AGENT_SERVER_URL;
    delete process.env.OPENHANDS_REMOTE_GATEWAY_URL;
    delete process.env.OPENHANDS_AGENT_SERVER_URL;
    try {
      const health = await getRemoteRuntimeHealth();
      expect(health.configured).toBe(false);
      expect(health.available).toBe(false);
    } finally {
      if (previousRemoteGateway) process.env.OPENHANDS_REMOTE_GATEWAY_URL = previousRemoteGateway;
      if (previousAgentServer) process.env.OPENHANDS_AGENT_SERVER_URL = previousAgentServer;
    }
  });

  it("returns lazy skill sources without crashing when folders are missing", () => {
    const sources = resolveOpenHandsSkillSources("C:/does-not-exist");
    expect(sources.length).toBeGreaterThanOrEqual(2);
    expect(sources.every((source) => source.loadedLazily)).toBe(true);
  });
});
