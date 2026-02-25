import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
vi.mock("@/lib/db", () => ({
  db: {},
}));
vi.mock("@/lib/trust/summary", () => ({
  getTrustSummary: vi.fn(),
}));
vi.mock("@/lib/trust/db", () => ({
  hasTrustTable: vi.fn(),
}));
import { shouldEnableMachineBlocks } from "./public-agent-page";

describe("shouldEnableMachineBlocks", () => {
  const originalFlag = process.env.AGENT_PAGE_MACHINE_BLOCKS_V1;
  const originalPercent = process.env.AGENT_PAGE_MACHINE_BLOCKS_PERCENT;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.AGENT_PAGE_MACHINE_BLOCKS_V1 = originalFlag;
    process.env.AGENT_PAGE_MACHINE_BLOCKS_PERCENT = originalPercent;
  });

  it("disables machine blocks when feature flag is off", () => {
    process.env.AGENT_PAGE_MACHINE_BLOCKS_V1 = "0";
    process.env.AGENT_PAGE_MACHINE_BLOCKS_PERCENT = "100";

    expect(shouldEnableMachineBlocks("demo-agent")).toBe(false);
  });

  it("enables machine blocks when feature flag is on and percent is 100", () => {
    process.env.AGENT_PAGE_MACHINE_BLOCKS_V1 = "1";
    process.env.AGENT_PAGE_MACHINE_BLOCKS_PERCENT = "100";

    expect(shouldEnableMachineBlocks("demo-agent")).toBe(true);
  });

  it("uses deterministic slug bucketing for partial rollout", () => {
    process.env.AGENT_PAGE_MACHINE_BLOCKS_V1 = "1";
    process.env.AGENT_PAGE_MACHINE_BLOCKS_PERCENT = "5";

    expect(shouldEnableMachineBlocks("demo-agent")).toBe(shouldEnableMachineBlocks("demo-agent"));
  });
});
