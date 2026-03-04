import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
}));

const mockIsAdminEmail = vi.hoisted(() => vi.fn().mockReturnValue(false));
const mockCheckRateLimits = vi.hoisted(() => vi.fn());
const mockGetUserPlan = vi.hoisted(() => vi.fn());
const mockIncrementUsage = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockEstimateMessagesTokens = vi.hoisted(() => vi.fn().mockReturnValue(100));
const mockEq = vi.hoisted(() => vi.fn(() => "eq-clause"));

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

vi.mock("@/lib/db/schema", () => ({
  users: {
    id: "id",
    email: "email",
    apiKeyPrefix: "apiKeyPrefix",
    apiKeyHash: "apiKeyHash",
  },
}));

vi.mock("@/lib/db/playground-schema", () => ({
  hfUsageLogs: {},
}));

vi.mock("@/lib/admin", () => ({
  isAdminEmail: mockIsAdminEmail,
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
  checkRateLimits: mockCheckRateLimits,
  getUserPlan: mockGetUserPlan,
  incrementUsage: mockIncrementUsage,
  estimateMessagesTokens: mockEstimateMessagesTokens,
}));

import { GET, POST } from "./route";

function createSelectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

function createInsertChain() {
  return {
    values: vi.fn().mockResolvedValue(undefined),
  };
}

describe("POST /api/v1/hf/chat/completions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.HF_ROUTER_TOKEN = "hf_test_token";
    mockDb.select.mockImplementation(() =>
      createSelectChain([{ id: "user-1", email: "user@example.com", apiKeyPrefix: "xprs" }])
    );
    mockDb.insert.mockImplementation(() => createInsertChain());
    mockGetUserPlan.mockResolvedValue({ plan: "paid", isActive: true });
    mockCheckRateLimits.mockResolvedValue({
      allowed: true,
      limits: {
        contextCap: 16384,
        maxOutputTokens: 512,
        maxRequestsPerDay: 100,
        maxOutputTokensPerMonth: 300000,
      },
    });
    vi.stubGlobal("fetch", vi.fn());
  });

  it("returns 500 when HF router token is not configured", async () => {
    delete process.env.HF_ROUTER_TOKEN;
    delete process.env.HF_TOKEN;
    delete process.env.HUGGINGFACE_TOKEN;

    const req = new NextRequest("http://localhost/api/v1/hf/chat/completions", {
      method: "POST",
      body: JSON.stringify({ model: "x", messages: [{ role: "user", content: "hi" }] }),
      headers: { "Content-Type": "application/json", "X-API-Key": "key" },
    });

    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toBe("HF router not configured");
  });

  it("returns 401 when API key is missing", async () => {
    const req = new NextRequest("http://localhost/api/v1/hf/chat/completions", {
      method: "POST",
      body: JSON.stringify({ model: "x", messages: [{ role: "user", content: "hi" }] }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 402 when user has no active playground subscription", async () => {
    mockGetUserPlan.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/v1/hf/chat/completions", {
      method: "POST",
      body: JSON.stringify({ model: "x", messages: [{ role: "user", content: "hi" }] }),
      headers: { "Content-Type": "application/json", "X-API-Key": "key" },
    });

    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(402);
    expect(body.error).toBe("PLAYGROUND_SUBSCRIPTION_REQUIRED");
  });

  it("returns 429 when rate limit check fails", async () => {
    mockCheckRateLimits.mockResolvedValue({
      allowed: false,
      reason: "Daily request limit reached",
      currentUsage: { dailyRequests: 30, monthlyOutputTokens: 1200 },
      limits: {
        contextCap: 8192,
        maxOutputTokens: 256,
        maxRequestsPerDay: 30,
        maxOutputTokensPerMonth: 50000,
      },
    });

    const req = new NextRequest("http://localhost/api/v1/hf/chat/completions", {
      method: "POST",
      body: JSON.stringify({ model: "x", messages: [{ role: "user", content: "hi" }] }),
      headers: { "Content-Type": "application/json", "X-API-Key": "key" },
    });

    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(429);
    expect(body.error).toBe("Rate Limit Exceeded");
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
  });

  it("returns 400 for invalid request payload", async () => {
    const req = new NextRequest("http://localhost/api/v1/hf/chat/completions", {
      method: "POST",
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
      headers: { "Content-Type": "application/json", "X-API-Key": "key" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("proxies non-streaming requests and returns upstream JSON", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "Hello from HF" } }],
          usage: { completion_tokens: 12 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const req = new NextRequest("http://localhost/api/v1/hf/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model: "Qwen/Qwen3-4B-Instruct-2507:nscale",
        messages: [{ role: "user", content: "hello" }],
        max_tokens: 100,
      }),
      headers: { "Content-Type": "application/json", "X-API-Key": "key" },
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.choices[0].message.content).toBe("Hello from HF");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mockIncrementUsage).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/v1/hf/chat/completions", () => {
  it("returns 405", async () => {
    const res = await GET();
    expect(res.status).toBe(405);
  });
});

