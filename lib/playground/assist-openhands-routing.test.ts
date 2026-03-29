import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isPlaygroundAssistGreetingViaGateway,
  isPlaygroundAssistPlanViaGateway,
} from "./assist-openhands-routing";

describe("assist-openhands-routing", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("treats common truthy env values for greeting flag", () => {
    for (const v of ["true", "1", "on", "yes", "TRUE"]) {
      vi.stubEnv("PLAYGROUND_ASSIST_GREETING_VIA_GATEWAY", v);
      expect(isPlaygroundAssistGreetingViaGateway()).toBe(true);
    }
  });

  it("defaults greeting and plan flags to false", () => {
    delete process.env.PLAYGROUND_ASSIST_GREETING_VIA_GATEWAY;
    delete process.env.PLAYGROUND_ASSIST_PLAN_VIA_GATEWAY;
    expect(isPlaygroundAssistGreetingViaGateway()).toBe(false);
    expect(isPlaygroundAssistPlanViaGateway()).toBe(false);
  });

  it("enables plan flag when set", () => {
    vi.stubEnv("PLAYGROUND_ASSIST_PLAN_VIA_GATEWAY", "true");
    expect(isPlaygroundAssistPlanViaGateway()).toBe(true);
  });
});
