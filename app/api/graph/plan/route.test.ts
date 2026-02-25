import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";

const mockPlanPipeline = vi.hoisted(() => vi.fn());
const mockEnsureTaskSignature = vi.hoisted(() => vi.fn());
const mockBuildCacheKey = vi.hoisted(() => vi.fn().mockReturnValue("graph-plan:test"));
const mockGraphPlanCache = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));
const mockGraphCircuitBreaker = vi.hoisted(() => ({
  isAllowed: vi.fn(),
  recordSuccess: vi.fn(),
  recordFailure: vi.fn(),
}));

vi.mock("@/lib/gpg/recommend", () => ({
  planPipeline: mockPlanPipeline,
}));
vi.mock("@/lib/gpg/task-canonicalization", () => ({
  ensureTaskSignature: mockEnsureTaskSignature,
}));
vi.mock("@/lib/search/cache", () => ({
  buildCacheKey: mockBuildCacheKey,
}));
vi.mock("@/lib/graph/cache", () => ({
  graphPlanCache: mockGraphPlanCache,
}));
vi.mock("@/lib/search/circuit-breaker", () => ({
  graphCircuitBreaker: mockGraphCircuitBreaker,
}));

describe("Graph plan route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGraphPlanCache.get.mockReturnValue(undefined);
    mockGraphCircuitBreaker.isAllowed.mockReturnValue(true);
    mockEnsureTaskSignature.mockResolvedValue({ clusterId: "cluster-1" });
    mockPlanPipeline.mockResolvedValue({
      clusterId: "cluster-1",
      clusterName: "test",
      taskType: "general",
      plan: null,
      alternatives: [],
    });
  });

  it("GET returns 400 for invalid params", async () => {
    const res = await GET(new NextRequest("http://localhost/api/graph/plan"));
    expect(res.status).toBe(400);
  });

  it("POST returns 400 for invalid payload", async () => {
    const req = new NextRequest("http://localhost/api/graph/plan", {
      method: "POST",
      body: JSON.stringify({ foo: "bar" }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns fallback payload when circuit is open", async () => {
    mockGraphCircuitBreaker.isAllowed.mockReturnValue(false);
    const res = await GET(
      new NextRequest("http://localhost/api/graph/plan?q=test&optimizeFor=success_then_cost")
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data._fallback).toBe(true);
    expect(data.fallbackReason).toBe("CIRCUIT_OPEN");
  });
});
