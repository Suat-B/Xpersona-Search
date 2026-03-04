import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
}));

const mockEq = vi.hoisted(() => vi.fn(() => "eq-clause"));
const mockGetUserUsageStats = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

vi.mock("@/lib/db/schema", () => ({
  users: {
    id: "id",
    apiKeyHash: "apiKeyHash",
  },
}));

vi.mock("@/lib/db/playground-schema", () => ({
  playgroundSubscriptions: {
    status: "status",
    trialEndsAt: "trialEndsAt",
    currentPeriodEnd: "currentPeriodEnd",
    cancelAtPeriodEnd: "cancelAtPeriodEnd",
    userId: "userId",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: mockEq,
}));

vi.mock("@/lib/hf-router/rate-limit", () => ({
  PLAN_LIMITS: {
    trial: {
      contextCap: 8192,
      maxOutputTokens: 256,
      maxRequestsPerDay: 30,
      maxOutputTokensPerMonth: 50000,
    },
    paid: {
      contextCap: 16384,
      maxOutputTokens: 512,
      maxRequestsPerDay: 100,
      maxOutputTokensPerMonth: 300000,
    },
  },
  getUserUsageStats: mockGetUserUsageStats,
}));

import { GET, POST } from "./route";

function createSelectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

describe("GET /api/v1/hf/usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when API key is missing", async () => {
    const req = new NextRequest("http://localhost/api/v1/hf/usage");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 404 when user has no subscription stats", async () => {
    mockDb.select.mockImplementationOnce(() => createSelectChain([{ id: "user-1" }]));
    mockGetUserUsageStats.mockResolvedValueOnce(null);

    const req = new NextRequest("http://localhost/api/v1/hf/usage", {
      headers: { "X-API-Key": "key" },
    });
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("No subscription found");
  });

  it("returns usage payload for authenticated users", async () => {
    mockDb.select
      .mockImplementationOnce(() => createSelectChain([{ id: "user-1" }]))
      .mockImplementationOnce(() =>
        createSelectChain([
          {
            status: "active",
            trialEndsAt: new Date("2026-03-05T00:00:00.000Z"),
            currentPeriodEnd: new Date("2026-04-01T00:00:00.000Z"),
            cancelAtPeriodEnd: false,
          },
        ])
      );

    mockGetUserUsageStats.mockResolvedValueOnce({
      plan: "paid",
      today: {
        requestsUsed: 12,
        requestsLimit: 100,
        tokensOutput: 0,
      },
      thisMonth: {
        tokensOutput: 2400,
        tokensLimit: 300000,
        estimatedCost: 0.42,
      },
    });

    const req = new NextRequest("http://localhost/api/v1/hf/usage", {
      headers: { "X-API-Key": "key" },
    });
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.plan).toBe("paid");
    expect(body.today.requestsRemaining).toBe(88);
    expect(body.thisMonth.tokensRemaining).toBe(297600);
  });
});

describe("POST /api/v1/hf/usage", () => {
  it("returns 405", async () => {
    const res = await POST();
    expect(res.status).toBe(405);
  });
});

