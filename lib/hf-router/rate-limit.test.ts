import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

import {
  PLAN_LIMITS,
  checkRateLimits,
  estimateMessagesTokens,
  estimateTokens,
  getUserPlan,
  getUserUsageStats,
  incrementUsage,
} from "./rate-limit";

function createSelectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

function createInsertChain() {
  return {
    values: vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    }),
  };
}

describe("hf-router/rate-limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-03T12:00:00.000Z"));
    mockDb.select.mockImplementation(() => createSelectChain([]));
    mockDb.insert.mockImplementation(() => createInsertChain());
  });

  it("returns null plan when user has no subscription", async () => {
    const result = await getUserPlan("user-1");
    expect(result).toBeNull();
  });

  it("marks expired trials as inactive", async () => {
    mockDb.select.mockImplementationOnce(() =>
      createSelectChain([{ planTier: "trial", status: "trial", trialEndsAt: new Date("2026-03-01T00:00:00.000Z") }])
    );
    const result = await getUserPlan("user-1");
    expect(result).toEqual({ plan: "trial", isActive: false });
  });

  it("accepts valid paid tier plans", async () => {
    mockDb.select.mockImplementationOnce(() =>
      createSelectChain([{ planTier: "builder", status: "active", trialEndsAt: null }])
    );
    const result = await getUserPlan("user-1");
    expect(result).toEqual({ plan: "builder", isActive: true });
  });

  it("rejects when max_tokens exceeds plan cap", async () => {
    mockDb.select.mockImplementationOnce(() =>
      createSelectChain([{ planTier: "builder", status: "active", trialEndsAt: null }])
    );
    const result = await checkRateLimits("user-1", PLAN_LIMITS.builder.maxOutputTokens + 1, 100);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("max_tokens");
  });

  it("rejects when context estimate exceeds input cap", async () => {
    mockDb.select.mockImplementationOnce(() =>
      createSelectChain([{ planTier: "starter", status: "active", trialEndsAt: null }])
    );
    const result = await checkRateLimits("user-1", 256, PLAN_LIMITS.starter.maxInputTokensPerRequest + 1);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Context length");
  });

  it("rejects when cycle request limit is reached", async () => {
    mockDb.select
      .mockImplementationOnce(() =>
        createSelectChain([{ planTier: "trial", status: "trial", trialEndsAt: new Date("2026-03-05T00:00:00.000Z") }])
      )
      .mockImplementationOnce(() =>
        createSelectChain([{ requestsCount: PLAN_LIMITS.trial.maxRequestsPerCycle, tokensInput: 0, tokensOutput: 0 }])
      );

    const result = await checkRateLimits("user-1", 128, 100);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("5-hour request limit reached");
  });

  it("rejects when cycle total token budget would be exceeded", async () => {
    mockDb.select
      .mockImplementationOnce(() =>
        createSelectChain([{ planTier: "trial", status: "trial", trialEndsAt: new Date("2026-03-05T00:00:00.000Z") }])
      )
      .mockImplementationOnce(() =>
        createSelectChain([{ requestsCount: 5, tokensInput: 119900, tokensOutput: 0 }])
      );

    const result = await checkRateLimits("user-1", 200, 200);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("5-hour total token budget");
  });

  it("rejects when monthly total token budget would be exceeded", async () => {
    mockDb.select
      .mockImplementationOnce(() =>
        createSelectChain([{ planTier: "trial", status: "trial", trialEndsAt: new Date("2026-03-05T00:00:00.000Z") }])
      )
      .mockImplementationOnce(() =>
        createSelectChain([{ requestsCount: 1, tokensInput: 1000, tokensOutput: 1000 }])
      )
      .mockImplementationOnce(() =>
        createSelectChain([{ tokensInput: 1_499_900, tokensOutput: 0 }])
      );

    const result = await checkRateLimits("user-1", 200, 200);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Monthly total token budget");
  });

  it("allows request when limits pass", async () => {
    mockDb.select
      .mockImplementationOnce(() =>
        createSelectChain([{ planTier: "builder", status: "active", trialEndsAt: null }])
      )
      .mockImplementationOnce(() =>
        createSelectChain([{ requestsCount: 12, tokensInput: 1000, tokensOutput: 2000 }])
      )
      .mockImplementationOnce(() =>
        createSelectChain([{ tokensInput: 4000, tokensOutput: 5000 }])
      );

    const result = await checkRateLimits("user-1", 300, 500);
    expect(result.allowed).toBe(true);
    expect(result.limits).toEqual(PLAN_LIMITS.builder);
  });

  it("returns usage stats from cycle + monthly totals", async () => {
    mockDb.select
      .mockImplementationOnce(() =>
        createSelectChain([{ planTier: "studio", status: "active", trialEndsAt: null }])
      )
      .mockImplementationOnce(() =>
        createSelectChain([{ requestsCount: 4, tokensInput: 700, tokensOutput: 1300 }])
      )
      .mockImplementationOnce(() =>
        createSelectChain([{ tokensInput: 2000, tokensOutput: 5000 }])
      )
      .mockImplementationOnce(() =>
        createSelectChain([{ estimatedCostUsd: 0.123 }])
      );

    const stats = await getUserUsageStats("user-1");
    expect(stats).toEqual({
      plan: "studio",
      cycle: {
        requestsUsed: 4,
        requestsLimit: PLAN_LIMITS.studio.maxRequestsPerCycle,
        tokensTotalUsed: 2000,
        tokensTotalLimit: PLAN_LIMITS.studio.maxTotalTokensPerCycle,
        startsAt: "2026-03-03T10:00:00.000Z",
        endsAt: "2026-03-03T15:00:00.000Z",
      },
      thisMonth: {
        tokensInput: 2000,
        tokensOutput: 5000,
        tokensTotal: 7000,
        tokensLimit: PLAN_LIMITS.studio.maxTotalTokensPerMonth,
        estimatedCost: 0.123,
      },
    });
  });

  it("updates both cycle and monthly counters on incrementUsage", async () => {
    await incrementUsage("user-1", 120, 80, 0.004);
    expect(mockDb.insert).toHaveBeenCalledTimes(2);
  });

  it("estimates tokens consistently", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcdefgh")).toBe(2);
    expect(estimateMessagesTokens([{ content: "Hello" }, { content: "World" }])).toBe(18);
  });
});
