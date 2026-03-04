import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

import {
  checkRateLimits,
  estimateMessagesTokens,
  estimateTokens,
  getUserPlan,
  getUserUsageStats,
  incrementUsage,
  PLAN_LIMITS,
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
    mockDb.select.mockImplementationOnce(() => createSelectChain([]));
    const result = await getUserPlan("user-1");
    expect(result).toBeNull();
  });

  it("marks expired trials as inactive", async () => {
    mockDb.select.mockImplementationOnce(() =>
      createSelectChain([
        {
          planTier: "trial",
          status: "trial",
          trialEndsAt: new Date("2026-03-01T00:00:00.000Z"),
        },
      ])
    );

    const result = await getUserPlan("user-1");
    expect(result).toEqual({ plan: "trial", isActive: false });
  });

  it("rejects when there is no active playground subscription", async () => {
    mockDb.select.mockImplementationOnce(() => createSelectChain([]));

    const result = await checkRateLimits("user-1", 128, 200);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("No active playground subscription");
  });

  it("rejects when request max_tokens exceeds plan cap", async () => {
    mockDb.select.mockImplementationOnce(() =>
      createSelectChain([
        {
          planTier: "trial",
          status: "trial",
          trialEndsAt: new Date("2026-03-05T00:00:00.000Z"),
        },
      ])
    );

    const result = await checkRateLimits("user-1", PLAN_LIMITS.trial.maxOutputTokens + 1, 100);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("exceeds your plan limit");
  });

  it("rejects when context estimate exceeds plan cap", async () => {
    mockDb.select.mockImplementationOnce(() =>
      createSelectChain([
        {
          planTier: "trial",
          status: "trial",
          trialEndsAt: new Date("2026-03-05T00:00:00.000Z"),
        },
      ])
    );

    const result = await checkRateLimits("user-1", 128, PLAN_LIMITS.trial.contextCap + 1);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Context length");
  });

  it("rejects when daily request limit is reached", async () => {
    mockDb.select
      .mockImplementationOnce(() =>
        createSelectChain([
          {
            planTier: "trial",
            status: "trial",
            trialEndsAt: new Date("2026-03-05T00:00:00.000Z"),
          },
        ])
      )
      .mockImplementationOnce(() =>
        createSelectChain([{ requestsCount: PLAN_LIMITS.trial.maxRequestsPerDay }])
      );

    const result = await checkRateLimits("user-1", 128, 100);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Daily request limit reached");
  });

  it("rejects when monthly output cap would be exceeded", async () => {
    mockDb.select
      .mockImplementationOnce(() =>
        createSelectChain([
          {
            planTier: "trial",
            status: "trial",
            trialEndsAt: new Date("2026-03-05T00:00:00.000Z"),
          },
        ])
      )
      .mockImplementationOnce(() => createSelectChain([{ requestsCount: 0 }]))
      .mockImplementationOnce(() =>
        createSelectChain([{ tokensOutput: PLAN_LIMITS.trial.maxOutputTokensPerMonth - 20 }])
      );

    const result = await checkRateLimits("user-1", 50, 100);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Monthly output token limit would be exceeded");
  });

  it("allows request when all limits pass", async () => {
    mockDb.select
      .mockImplementationOnce(() =>
        createSelectChain([
          {
            planTier: "paid",
            status: "active",
            trialEndsAt: null,
          },
        ])
      )
      .mockImplementationOnce(() => createSelectChain([{ requestsCount: 12 }]))
      .mockImplementationOnce(() => createSelectChain([{ tokensOutput: 1000 }]));

    const result = await checkRateLimits("user-1", 300, 500);
    expect(result.allowed).toBe(true);
    expect(result.currentUsage).toEqual({ dailyRequests: 12, monthlyOutputTokens: 1000 });
    expect(result.limits).toEqual(PLAN_LIMITS.paid);
  });

  it("returns usage stats with derived limits and monthly estimated cost", async () => {
    mockDb.select
      .mockImplementationOnce(() =>
        createSelectChain([
          {
            planTier: "paid",
            status: "active",
            trialEndsAt: null,
          },
        ])
      )
      .mockImplementationOnce(() => createSelectChain([{ requestsCount: 4 }]))
      .mockImplementationOnce(() => createSelectChain([{ tokensOutput: 900 }]))
      .mockImplementationOnce(() => createSelectChain([{ estimatedCostUsd: 0.123 }]));

    const stats = await getUserUsageStats("user-1");
    expect(stats).toEqual({
      plan: "paid",
      today: {
        requestsUsed: 4,
        requestsLimit: PLAN_LIMITS.paid.maxRequestsPerDay,
        tokensOutput: 0,
      },
      thisMonth: {
        tokensOutput: 900,
        tokensLimit: PLAN_LIMITS.paid.maxOutputTokensPerMonth,
        estimatedCost: 0.123,
      },
    });
  });

  it("updates both daily and monthly counters on incrementUsage", async () => {
    await incrementUsage("user-1", 120, 80, 0.004);
    expect(mockDb.insert).toHaveBeenCalledTimes(2);
  });

  it("estimates tokens and message tokens consistently", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcdefgh")).toBe(2);

    const total = estimateMessagesTokens([
      { content: "Hello" },
      { content: "World" },
    ]);
    expect(total).toBeGreaterThan(0);
    expect(total).toBe(15);
  });
});

