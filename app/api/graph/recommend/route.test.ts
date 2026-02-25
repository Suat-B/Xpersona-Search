import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const mockRecommendAgents = vi.hoisted(() => vi.fn());
const mockEnsureTaskSignature = vi.hoisted(() => vi.fn());
const mockBuildCacheKey = vi.hoisted(() => vi.fn().mockReturnValue("graph-recommend:test"));
const mockGraphRecommendCache = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));
const mockGraphCircuitBreaker = vi.hoisted(() => ({
  isAllowed: vi.fn(),
  recordSuccess: vi.fn(),
  recordFailure: vi.fn(),
}));

vi.mock("@/lib/gpg/recommend", () => ({
  recommendAgents: mockRecommendAgents,
}));
vi.mock("@/lib/gpg/task-canonicalization", () => ({
  ensureTaskSignature: mockEnsureTaskSignature,
}));
vi.mock("@/lib/search/cache", () => ({
  buildCacheKey: mockBuildCacheKey,
}));
vi.mock("@/lib/graph/cache", () => ({
  graphRecommendCache: mockGraphRecommendCache,
}));
vi.mock("@/lib/search/circuit-breaker", () => ({
  graphCircuitBreaker: mockGraphCircuitBreaker,
}));

describe("GET /api/graph/recommend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGraphRecommendCache.get.mockReturnValue(undefined);
    mockGraphCircuitBreaker.isAllowed.mockReturnValue(true);
    mockEnsureTaskSignature.mockResolvedValue({ clusterId: "cluster-1" });
    mockRecommendAgents.mockResolvedValue({
      clusterId: "cluster-1",
      clusterName: "test",
      taskType: "general",
      topAgents: [],
      alternatives: [],
    });
  });

  it("returns 400 for invalid query params", async () => {
    const res = await GET(new NextRequest("http://localhost/api/graph/recommend"));
    expect(res.status).toBe(400);
  });

  it("returns cached payload on cache hit", async () => {
    mockGraphRecommendCache.get.mockReturnValue({
      success: true,
      data: { clusterId: "cached", topAgents: [] },
    });

    const res = await GET(new NextRequest("http://localhost/api/graph/recommend?q=test"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("X-Cache")).toBe("HIT");
    expect(data.data.clusterId).toBe("cached");
    expect(mockRecommendAgents).not.toHaveBeenCalled();
  });

  it("returns fallback payload when circuit is open", async () => {
    mockGraphCircuitBreaker.isAllowed.mockReturnValue(false);

    const res = await GET(new NextRequest("http://localhost/api/graph/recommend?q=test"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data._fallback).toBe(true);
    expect(data.fallbackReason).toBe("CIRCUIT_OPEN");
  });
});

