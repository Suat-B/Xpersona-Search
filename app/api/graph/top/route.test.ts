import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const mockFetchWithTimeout = vi.hoisted(() => vi.fn());
const mockBuildCacheKey = vi.hoisted(() => vi.fn().mockReturnValue("graph-top:test"));
const mockGraphTopCache = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));
const mockGraphCircuitBreaker = vi.hoisted(() => ({
  isAllowed: vi.fn(),
  recordSuccess: vi.fn(),
  recordFailure: vi.fn(),
}));

vi.mock("@/lib/api/fetch-timeout", () => ({
  fetchWithTimeout: mockFetchWithTimeout,
}));
vi.mock("@/lib/search/cache", () => ({
  buildCacheKey: mockBuildCacheKey,
}));
vi.mock("@/lib/graph/cache", () => ({
  graphTopCache: mockGraphTopCache,
}));
vi.mock("@/lib/search/circuit-breaker", () => ({
  graphCircuitBreaker: mockGraphCircuitBreaker,
}));

describe("GET /api/graph/top", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGraphTopCache.get.mockReturnValue(undefined);
    mockGraphCircuitBreaker.isAllowed.mockReturnValue(true);
  });

  it("returns fallback payload when circuit is open", async () => {
    mockGraphCircuitBreaker.isAllowed.mockReturnValue(false);
    const res = await GET(new NextRequest("http://localhost/api/graph/top"));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data._fallback).toBe(true);
    expect(res.headers.get("X-Graph-Top-Fallback")).toBe("1");
  });

  it("returns upstream fallback when upstream fails", async () => {
    mockFetchWithTimeout.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ error: "bad gateway" }),
    });
    const res = await GET(new NextRequest("http://localhost/api/graph/top"));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data._fallback).toBe(true);
    expect(res.headers.get("X-Graph-Top-Fallback")).toBe("1");
  });

  it("returns successful payload on healthy upstream", async () => {
    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [{ id: "a1" }], count: 1 }),
    });
    const res = await GET(new NextRequest("http://localhost/api/graph/top"));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.count).toBe(1);
    expect(res.headers.get("X-Cache")).toBe("MISS");
  });
});
