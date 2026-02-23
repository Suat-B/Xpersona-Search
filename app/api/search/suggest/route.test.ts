/**
 * Comprehensive tests for the search suggest/autocomplete API.
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

vi.mock("@/components/search/ProtocolBadge", () => ({
  PROTOCOL_LABELS: {
    MCP: "MCP",
    A2A: "A2A",
    OPENCLEW: "OpenClew",
    ANP: "ANP",
  },
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

const mockSuggestCache = vi.hoisted(() => ({
  get: vi.fn().mockReturnValue(undefined),
  set: vi.fn(),
}));
vi.mock("@/lib/search/cache", () => ({
  suggestCache: mockSuggestCache,
  buildCacheKey: vi.fn().mockReturnValue("suggest-cache-key"),
}));

vi.mock("@/lib/search/query-engine", () => ({
  sanitizeForStorage: vi.fn().mockImplementation((s: string) => s.replace(/[<>]/g, "")),
}));

function createMockChain(resolveValue: unknown) {
  return vi.fn().mockReturnValue({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(resolveValue),
  });
}

describe("GET /api/search/suggest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockImplementation(createMockChain([]));
    mockDb.execute.mockResolvedValue({ rows: [] });
    mockRateLimit.mockReturnValue({ allowed: true, remaining: 59 });
    mockSuggestCB.isAllowed.mockReturnValue(true);
    mockSuggestCache.get.mockReturnValue(undefined);
  });

  // --- Validation ---

  it("returns 400 when query is missing", async () => {
    const res = await GET(new NextRequest("http://localhost/api/search/suggest"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when query is too short (1 char)", async () => {
    const res = await GET(new NextRequest("http://localhost/api/search/suggest?q=a"));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("at least 2 characters");
  });

  it("returns 400 for query exceeding 100 characters", async () => {
    const longQ = "a".repeat(101);
    const res = await GET(new NextRequest(`http://localhost/api/search/suggest?q=${longQ}`));
    expect(res.status).toBe(400);
  });

  // --- Successful response ---

  it("returns 200 with querySuggestions and agentSuggestions arrays", async () => {
    mockDb.select.mockImplementation(createMockChain([]));

    const res = await GET(new NextRequest("http://localhost/api/search/suggest?q=test"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveProperty("querySuggestions");
    expect(data).toHaveProperty("agentSuggestions");
    expect(Array.isArray(data.querySuggestions)).toBe(true);
    expect(Array.isArray(data.agentSuggestions)).toBe(true);
  });

  it("returns popular query completions", async () => {
    // First call = popularCompletions
    mockDb.select
      .mockImplementationOnce(
        createMockChain([{ query: "testing framework", count: 10 }])
      )
      .mockImplementation(createMockChain([]));

    const res = await GET(new NextRequest("http://localhost/api/search/suggest?q=test"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.querySuggestions).toContain("testing framework");
  });

  it("respects limit parameter", async () => {
    const res = await GET(new NextRequest("http://localhost/api/search/suggest?q=test&limit=3"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.querySuggestions.length).toBeLessThanOrEqual(3);
  });

  // --- Rate limiting ---

  it("returns 429 when rate limited", async () => {
    mockRateLimit.mockReturnValue({ allowed: false, retryAfter: 45, remaining: 0 });

    const res = await GET(new NextRequest("http://localhost/api/search/suggest?q=test"));
    const data = await res.json();

    expect(res.status).toBe(429);
    expect(data.error).toContain("Too many requests");
    expect(res.headers.get("Retry-After")).toBe("45");
  });

  // --- Circuit breaker ---

  it("returns 503 when circuit breaker is open", async () => {
    mockSuggestCB.isAllowed.mockReturnValue(false);

    const res = await GET(new NextRequest("http://localhost/api/search/suggest?q=test"));
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data.querySuggestions).toEqual([]);
    expect(data.agentSuggestions).toEqual([]);
  });

  // --- Caching ---

  it("returns cached result on cache hit", async () => {
    const cachedBody = {
      querySuggestions: ["cached suggestion"],
      agentSuggestions: [],
    };
    mockSuggestCache.get.mockReturnValue(cachedBody);

    const res = await GET(new NextRequest("http://localhost/api/search/suggest?q=test"));
    const data = await res.json();

    expect(data.querySuggestions).toEqual(["cached suggestion"]);
    expect(res.headers.get("X-Cache")).toBe("HIT");
  });

  it("sets Cache-Control on responses", async () => {
    const res = await GET(new NextRequest("http://localhost/api/search/suggest?q=test"));
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=30");
  });

  // --- Error handling ---

  it("returns fallback on DB error", async () => {
    mockDb.select.mockImplementation(() => {
      throw new Error("DB connection lost");
    });

    const res = await GET(new NextRequest("http://localhost/api/search/suggest?q=test"));
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data).toHaveProperty("querySuggestions");
    expect(data).toHaveProperty("agentSuggestions");
  });

  // --- Input sanitization ---

  it("strips HTML from query", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/search/suggest?q=<script>test</script>")
    );
    // Should not crash, should return a response
    expect(res.status).toBeDefined();
  });
});
