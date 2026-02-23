/**
 * Comprehensive tests for the trending search queries API.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

const mockRateLimit = vi.hoisted(() =>
  vi.fn().mockReturnValue({ allowed: true, remaining: 59 })
);
vi.mock("@/lib/search/rate-limit", () => ({
  checkSearchRateLimit: mockRateLimit,
}));

const mockSuggestCB = vi.hoisted(() => ({
  isAllowed: vi.fn().mockReturnValue(true),
  recordSuccess: vi.fn(),
  recordFailure: vi.fn(),
}));
vi.mock("@/lib/search/circuit-breaker", () => ({
  suggestCircuitBreaker: mockSuggestCB,
}));

const mockTrendingCache = vi.hoisted(() => ({
  get: vi.fn().mockReturnValue(undefined),
  set: vi.fn(),
}));
vi.mock("@/lib/search/cache", () => ({
  trendingCache: mockTrendingCache,
}));

function createMockChain(resolveValue: unknown) {
  return vi.fn().mockReturnValue({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(resolveValue),
  });
}

describe("GET /api/search/trending", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockImplementation(createMockChain([]));
    mockDb.execute.mockResolvedValue({ rows: [] });
    mockRateLimit.mockReturnValue({ allowed: true, remaining: 59 });
    mockSuggestCB.isAllowed.mockReturnValue(true);
    mockTrendingCache.get.mockReturnValue(undefined);
  });

  // --- Successful response ---

  it("returns 200 with trending array", async () => {
    mockDb.select.mockImplementation(
      createMockChain([
        { query: "crypto trading", count: 15 },
        { query: "code review agent", count: 12 },
        { query: "mcp server", count: 8 },
      ])
    );

    const res = await GET(new NextRequest("http://localhost/api/search/trending"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveProperty("trending");
    expect(Array.isArray(data.trending)).toBe(true);
  });

  it("returns trending queries ordered by count", async () => {
    mockDb.select.mockImplementation(
      createMockChain([
        { query: "most popular", count: 100 },
        { query: "second popular", count: 50 },
      ])
    );

    const res = await GET(new NextRequest("http://localhost/api/search/trending"));
    const data = await res.json();

    expect(data.trending[0]).toBe("most popular");
    expect(data.trending[1]).toBe("second popular");
  });

  it("limits to 8 trending results", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      query: `query-${i}`,
      count: 100 - i,
    }));
    mockDb.select.mockImplementation(createMockChain(many));

    const res = await GET(new NextRequest("http://localhost/api/search/trending"));
    const data = await res.json();

    expect(data.trending.length).toBeLessThanOrEqual(8);
  });

  // --- Fallback to top agents ---

  it("supplements with top agent names when few trending queries", async () => {
    mockDb.select.mockImplementation(createMockChain([
      { query: "only one", count: 5 },
    ]));
    mockDb.execute.mockResolvedValue({
      rows: [
        { name: "Popular Agent" },
        { name: "Another Agent" },
      ],
    });

    const res = await GET(new NextRequest("http://localhost/api/search/trending"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.trending).toContain("only one");
  });

  // --- Incomplete phrase filtering ---

  it("filters out incomplete phrases ending with stopwords", async () => {
    mockDb.select.mockImplementation(
      createMockChain([
        { query: "trading for", count: 10 },
        { query: "crypto agent", count: 8 },
      ])
    );

    const res = await GET(new NextRequest("http://localhost/api/search/trending"));
    const data = await res.json();

    expect(data.trending).not.toContain("trading for");
    expect(data.trending).toContain("crypto agent");
  });

  // --- Rate limiting ---

  it("returns 429 when rate limited", async () => {
    mockRateLimit.mockReturnValue({ allowed: false, retryAfter: 20, remaining: 0 });

    const res = await GET(new NextRequest("http://localhost/api/search/trending"));
    const data = await res.json();

    expect(res.status).toBe(429);
    expect(data.error).toContain("Too many requests");
  });

  // --- Circuit breaker ---

  it("returns 503 when circuit breaker is open", async () => {
    mockSuggestCB.isAllowed.mockReturnValue(false);

    const res = await GET(new NextRequest("http://localhost/api/search/trending"));
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data.trending).toEqual([]);
  });

  // --- Caching ---

  it("returns cached result on cache hit", async () => {
    mockTrendingCache.get.mockReturnValue({ trending: ["cached trending"] });

    const res = await GET(new NextRequest("http://localhost/api/search/trending"));
    const data = await res.json();

    expect(data.trending).toEqual(["cached trending"]);
    expect(res.headers.get("X-Cache")).toBe("HIT");
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=300");
  });

  it("caches results with 5 minute TTL", async () => {
    mockDb.select.mockImplementation(createMockChain([
      { query: "fresh trend", count: 5 },
    ]));

    await GET(new NextRequest("http://localhost/api/search/trending"));

    expect(mockTrendingCache.set).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ trending: expect.any(Array) })
    );
  });

  // --- Error handling ---

  it("returns empty trending on DB error", async () => {
    mockDb.select.mockImplementation(() => {
      throw new Error("DB error");
    });

    const res = await GET(new NextRequest("http://localhost/api/search/trending"));
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.trending).toEqual([]);
  });

  it("serves stale cache on error", async () => {
    mockTrendingCache.get
      .mockReturnValueOnce(undefined) // first check
      .mockReturnValueOnce({ trending: ["stale trend"] }); // error handler check
    mockDb.select.mockImplementation(() => {
      throw new Error("DB error");
    });

    const res = await GET(new NextRequest("http://localhost/api/search/trending"));
    const data = await res.json();

    expect(data.trending).toEqual(["stale trend"]);
    expect(res.headers.get("X-Cache")).toBe("STALE");
  });
});
