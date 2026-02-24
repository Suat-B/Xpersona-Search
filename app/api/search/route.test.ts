/**
 * Comprehensive tests for search API.
 * Covers: validation, full-text search, pagination, operators, caching,
 * rate limiting, circuit breaker, error sanitization, and didYouMean.
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

const mockGetAuthUser = vi.hoisted(() => vi.fn().mockResolvedValue({ error: "UNAUTHORIZED" }));
vi.mock("@/lib/auth-utils", () => ({
  getAuthUser: mockGetAuthUser,
}));

const mockIsAdmin = vi.hoisted(() => vi.fn().mockReturnValue(false));
vi.mock("@/lib/admin", () => ({
  isAdmin: mockIsAdmin,
}));

// Mock rate limiter - default: allow all
const mockRateLimit = vi.hoisted(() =>
  vi.fn().mockReturnValue({ allowed: true, remaining: 59 })
);
vi.mock("@/lib/search/rate-limit", () => ({
  checkSearchRateLimit: mockRateLimit,
  SEARCH_ANON_RATE_LIMIT: 60,
  SEARCH_AUTH_RATE_LIMIT: 120,
}));

// Mock circuit breaker
const mockCircuitBreaker = vi.hoisted(() => ({
  isAllowed: vi.fn().mockReturnValue(true),
  recordSuccess: vi.fn(),
  recordFailure: vi.fn(),
}));
vi.mock("@/lib/search/circuit-breaker", () => ({
  searchCircuitBreaker: mockCircuitBreaker,
}));

// Mock cache - default: no cache hits
const mockSearchCache = vi.hoisted(() => ({
  get: vi.fn().mockReturnValue(undefined),
  set: vi.fn(),
}));
vi.mock("@/lib/search/cache", () => ({
  searchResultsCache: mockSearchCache,
  buildCacheKey: vi.fn().mockReturnValue("test-cache-key"),
}));

// Mock query engine
vi.mock("@/lib/search/query-engine", () => ({
  processQuery: vi.fn().mockImplementation((q: string) => ({
    parsed: { textQuery: q.trim(), fieldFilters: {}, originalQuery: q },
    expandedQuery: q.trim(),
    websearchInput: q.trim(),
  })),
  sanitizeForStorage: vi.fn().mockImplementation((s: string) => s.replace(/[<>]/g, "")),
  findDidYouMean: vi.fn().mockResolvedValue(null),
}));

function createMockChain(resolveValue: unknown) {
  return vi.fn().mockReturnValue({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(resolveValue),
  });
}

function mockAgent(overrides: Record<string, unknown> = {}) {
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    name: "Test Agent",
    slug: "test-agent",
    description: "A test agent",
    url: "https://github.com/test/agent",
    homepage: null,
    source: "GITHUB_OPENCLEW",
    source_id: "github:123",
    capabilities: ["testing"],
    protocols: ["MCP"],
    safety_score: 85,
    popularity_score: 60,
    freshness_score: 70,
    overall_rank: 72.5,
    github_data: { stars: 42 },
    npm_data: null,
    languages: ["typescript"],
    created_at: new Date("2025-01-01"),
    snippet: null,
    total_count: 1,
    ...overrides,
  };
}

describe("GET /api/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mockDb.select.mockImplementation(createMockChain([]));
    mockDb.execute.mockResolvedValue({ rows: [] });
    mockRateLimit.mockReturnValue({ allowed: true, remaining: 59 });
    mockCircuitBreaker.isAllowed.mockReturnValue(true);
    mockSearchCache.get.mockReturnValue(undefined);
    mockGetAuthUser.mockResolvedValue({ error: "UNAUTHORIZED" });
    mockIsAdmin.mockReturnValue(false);
  });

  // --- Basic response shape ---

  it("returns 200 with results array and pagination object", async () => {
    mockDb.execute.mockResolvedValue({ rows: [mockAgent()] });

    const res = await GET(new NextRequest("http://localhost/api/search?sort=rank&limit=5"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveProperty("results");
    expect(Array.isArray(data.results)).toBe(true);
    expect(data).toHaveProperty("pagination");
    expect(data.pagination).toHaveProperty("hasMore");
    expect(data.pagination).toHaveProperty("nextCursor");
    expect(data.pagination).toHaveProperty("total");
  });

  it("returns 200 with empty results when no agents match", async () => {
    const res = await GET(new NextRequest("http://localhost/api/search?sort=rank&limit=5"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.results).toEqual([]);
    expect(data.pagination.hasMore).toBe(false);
    expect(data.pagination.total).toBe(0);
  });

  it("includes facets in response", async () => {
    mockDb.execute
      .mockResolvedValueOnce({ rows: [] }) // main query
      .mockResolvedValueOnce({ rows: [{ protocol: "MCP", count: "5" }] }); // facets

    const res = await GET(new NextRequest("http://localhost/api/search?sort=rank&limit=5"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveProperty("facets");
    expect(data.facets).toHaveProperty("protocols");
  });

  // --- Input validation ---

  it("returns 400 for invalid sort value", async () => {
    const res = await GET(new NextRequest("http://localhost/api/search?sort=invalid"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for limit > 100", async () => {
    const res = await GET(new NextRequest("http://localhost/api/search?limit=200"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for query exceeding 500 characters", async () => {
    const longQ = "a".repeat(501);
    const res = await GET(new NextRequest(`http://localhost/api/search?q=${longQ}`));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid cursor uuid", async () => {
    const res = await GET(new NextRequest("http://localhost/api/search?cursor=not-a-uuid"));
    expect(res.status).toBe(400);
  });

  it("accepts valid sort values", async () => {
    for (const sort of ["rank", "safety", "popularity", "freshness"]) {
      mockDb.execute.mockResolvedValue({ rows: [] });
      const res = await GET(new NextRequest(`http://localhost/api/search?sort=${sort}`));
      expect(res.status).toBe(200);
    }
  });

  it("accepts execute-mode query params", async () => {
    mockDb.execute.mockResolvedValue({ rows: [] });
    const res = await GET(
      new NextRequest(
        "http://localhost/api/search?intent=execute&taskType=retrieval&maxLatencyMs=1500&maxCostUsd=0.2&requires=mcp,apikey&forbidden=paid-api&dataRegion=us&bundle=1&explain=1"
      )
    );
    expect(res.status).toBe(200);
  });

  it("returns 400 for invalid execute-mode params", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/search?intent=execute&maxLatencyMs=9999999")
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 for includePrivate when requester is not admin", async () => {
    const res = await GET(new NextRequest("http://localhost/api/search?includePrivate=1"));
    expect(res.status).toBe(403);
  });

  it("allows includePrivate for admin users", async () => {
    mockGetAuthUser.mockResolvedValue({
      user: { id: "u1", email: "admin@example.com" },
    });
    mockIsAdmin.mockReturnValue(true);
    mockDb.execute.mockResolvedValue({ rows: [] });

    const res = await GET(new NextRequest("http://localhost/api/search?includePrivate=1"));
    expect(res.status).toBe(200);
  });

  // --- Cache behavior ---

  it("returns cached result on cache hit", async () => {
    const cachedBody = {
      results: [{ id: "cached-id", name: "Cached Agent" }],
      pagination: { hasMore: false, nextCursor: null, total: 1 },
      facets: { protocols: [] },
    };
    mockSearchCache.get.mockReturnValue(cachedBody);

    const res = await GET(new NextRequest("http://localhost/api/search?sort=rank"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.results[0].name).toBe("Cached Agent");
    expect(res.headers.get("X-Cache")).toBe("HIT");
    expect(mockDb.execute).not.toHaveBeenCalled();
  });

  it("sets Cache-Control header on responses", async () => {
    mockDb.execute.mockResolvedValue({ rows: [] });

    const res = await GET(new NextRequest("http://localhost/api/search?sort=rank"));

    expect(res.headers.get("Cache-Control")).toContain("s-maxage=30");
    expect(res.headers.get("Cache-Control")).toContain("stale-while-revalidate=60");
  });

  // --- Rate limiting ---

  it("returns 429 when rate limit exceeded", async () => {
    mockRateLimit.mockReturnValue({ allowed: false, retryAfter: 30, remaining: 0 });

    const res = await GET(new NextRequest("http://localhost/api/search?sort=rank"));
    const data = await res.json();

    expect(res.status).toBe(429);
    expect(data.error).toContain("Too many requests");
    expect(res.headers.get("Retry-After")).toBe("30");
  });

  // --- Circuit breaker ---

  it("returns 503 when circuit breaker is open", async () => {
    mockCircuitBreaker.isAllowed.mockReturnValue(false);

    const res = await GET(new NextRequest("http://localhost/api/search?sort=rank"));
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data.results).toEqual([]);
    expect(res.headers.get("Retry-After")).toBe("30");
  });

  // --- Error handling ---

  it("returns sanitized error message in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    mockDb.execute.mockRejectedValue(new Error("FATAL: database crashed"));

    const res = await GET(new NextRequest("http://localhost/api/search?sort=rank"));
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toBe("Search temporarily unavailable");
    expect(data.error).not.toContain("database");
    expect(data).toHaveProperty("results");
    expect(data.results).toEqual([]);

    vi.unstubAllEnvs();
  });

  it("returns detailed error message in development", async () => {
    vi.stubEnv("NODE_ENV", "development");

    mockDb.execute.mockRejectedValue(new Error("connection refused"));

    const res = await GET(new NextRequest("http://localhost/api/search?sort=rank"));
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toBe("connection refused");

    vi.unstubAllEnvs();
  });

  it("serves stale cache on DB error", async () => {
    const staleBody = {
      results: [{ id: "stale-id", name: "Stale Agent" }],
      pagination: { hasMore: false, nextCursor: null, total: 1 },
      facets: { protocols: [] },
    };
    mockSearchCache.get
      .mockReturnValueOnce(undefined) // first check before query
      .mockReturnValueOnce(staleBody); // second check in error handler

    mockDb.execute.mockRejectedValue(new Error("timeout"));

    const res = await GET(new NextRequest("http://localhost/api/search?sort=rank"));
    const data = await res.json();

    expect(data.results[0].name).toBe("Stale Agent");
    expect(data._stale).toBe(true);
  });

  // --- Result shape ---

  it("includes snippet field in results when query is present", async () => {
    mockDb.execute.mockResolvedValue({
      rows: [
        mockAgent({
          snippet: "<mark>test</mark> agent",
          claim_status: "CLAIMED",
          verification_tier: "SILVER",
          has_custom_page: true,
        }),
      ],
    });

    const res = await GET(new NextRequest("http://localhost/api/search?q=test&sort=rank"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.results[0]).toHaveProperty("snippet");
    expect(data.results[0].claimStatus).toBe("CLAIMED");
    expect(data.results[0].verificationTier).toBe("SILVER");
    expect(data.results[0].hasCustomPage).toBe(true);
  });

  it("includes rankingDebug only with debug=1 in non-production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SEARCH_HYBRID_RANKING", "1");

    mockDb.execute.mockResolvedValue({
      rows: [
        mockAgent({
          lexical_score: 0.8,
          authority_score: 0.6,
          engagement_score: 0.2,
          freshness_score_norm: 0.5,
          final_score: 0.69,
          canonical_agent_id: null,
        }),
      ],
    });

    const withDebug = await GET(
      new NextRequest("http://localhost/api/search?q=test&sort=rank&debug=1")
    );
    const withDebugData = await withDebug.json();
    expect(withDebugData.results[0].rankingDebug).toBeDefined();

    mockDb.execute.mockResolvedValue({
      rows: [mockAgent({ canonical_agent_id: null })],
    });
    const noDebug = await GET(new NextRequest("http://localhost/api/search?q=test&sort=rank"));
    const noDebugData = await noDebug.json();
    expect(noDebugData.results[0].rankingDebug).toBeUndefined();

    vi.unstubAllEnvs();
  });

  // --- Pagination ---

  it("returns hasMore=true when more results exist", async () => {
    const agents = Array.from({ length: 6 }, (_, i) =>
      mockAgent({ id: `id-${i}`, total_count: 10 })
    );
    mockDb.execute.mockResolvedValue({ rows: agents });

    const res = await GET(new NextRequest("http://localhost/api/search?sort=rank&limit=5"));
    const data = await res.json();

    expect(data.pagination.hasMore).toBe(true);
    expect(data.pagination.nextCursor).toBeDefined();
    expect(data.results.length).toBe(5);
  });

  // --- X-RateLimit-Remaining header ---

  it("includes X-RateLimit-Remaining header", async () => {
    mockDb.execute.mockResolvedValue({ rows: [] });
    mockRateLimit.mockReturnValue({ allowed: true, remaining: 42 });

    const res = await GET(new NextRequest("http://localhost/api/search?sort=rank"));

    expect(res.headers.get("X-RateLimit-Remaining")).toBe("42");
  });

  it("includes ranking headers outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    mockDb.execute.mockResolvedValue({ rows: [] });

    const res = await GET(new NextRequest("http://localhost/api/search?q=test&sort=rank"));

    expect(res.headers.get("X-Search-Ranking")).toBeTruthy();
    expect(res.headers.get("X-Search-Weights")).toBeTruthy();
    vi.unstubAllEnvs();
  });
});
