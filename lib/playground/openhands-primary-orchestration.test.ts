import { afterEach, describe, expect, it, vi } from "vitest";
import { isOpenHandsPrimaryOrchestration } from "@/lib/playground/openhands-primary-orchestration";

describe("isOpenHandsPrimaryOrchestration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is false when unset", () => {
    vi.stubEnv("PLAYGROUND_OPENHANDS_PRIMARY_ORCHESTRATION", "");
    expect(isOpenHandsPrimaryOrchestration()).toBe(false);
  });

  it("is true for true, 1, on, yes (case-insensitive)", () => {
    for (const v of ["true", "TRUE", "1", "on", "yes"]) {
      vi.stubEnv("PLAYGROUND_OPENHANDS_PRIMARY_ORCHESTRATION", v);
      expect(isOpenHandsPrimaryOrchestration()).toBe(true);
    }
  });
});
