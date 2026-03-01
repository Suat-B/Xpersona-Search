import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const mockResolveAgent = vi.hoisted(() => vi.fn());
const mockBuildCacheKey = vi.hoisted(() => vi.fn().mockReturnValue("graph-related:test"));
const mockGraphRelatedCache = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));
const mockGraphCircuitBreaker = vi.hoisted(() => ({
  isAllowed: vi.fn(),
  recordSuccess: vi.fn(),
  recordFailure: vi.fn(),
}));

vi.mock("@/lib/reliability/lookup", () => ({
  resolveAgentByIdOrSlug: mockResolveAgent,
}));
vi.mock("@/lib/search/cache", () => ({
  buildCacheKey: mockBuildCacheKey,
}));
vi.mock("@/lib/graph/cache", () => ({
  graphRelatedCache: mockGraphRelatedCache,
}));
vi.mock("@/lib/search/circuit-breaker", () => ({
  graphCircuitBreaker: mockGraphCircuitBreaker,
}));
vi.mock("@/lib/db", () => ({
  db: { select: vi.fn() },
}));

describe("GET /api/graph/related/:agentId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGraphRelatedCache.get.mockReturnValue(undefined);
    mockGraphCircuitBreaker.isAllowed.mockReturnValue(true);
  });

  it("returns 404 when agent does not exist", async () => {
    mockResolveAgent.mockResolvedValue(null);
    const res = await GET(new NextRequest("http://localhost/api/graph/related/a1"), {
      params: Promise.resolve({ agentId: "a1" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns fallback payload when circuit is open", async () => {
    mockResolveAgent.mockResolvedValue({ id: "agent-1", slug: "agent-1" });
    mockGraphCircuitBreaker.isAllowed.mockReturnValue(false);
    const res = await GET(new NextRequest("http://localhost/api/graph/related/agent-1"), {
      params: Promise.resolve({ agentId: "agent-1" }),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data._fallback).toBe(true);
    expect(res.headers.get("X-Graph-Related-Fallback")).toBe("1");
  });
});
