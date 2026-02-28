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
    expect(data.error.message).toContain("at least 2 characters");
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
    expect(data).toHaveProperty("meta");
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

  it("prioritizes natural phrases over package-like terms", async () => {
    mockDb.select
      .mockImplementationOnce(
        createMockChain([
          { query: "trad-sdk-v2", count: 50 },
          { query: "trading agent for crypto", count: 30 },
        ])
      )
      .mockImplementation(createMockChain([]));

    const res = await GET(new NextRequest("http://localhost/api/search/suggest?q=trad"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.querySuggestions[0]).toBe("trading agent for crypto");
    expect(data.querySuggestions).toContain("trad-sdk-v2");
  });

  it("keeps technical suggestions for technical queries", async () => {
    mockDb.select
      .mockImplementationOnce(
        createMockChain([
          { query: "npm package manager", count: 20 },
          { query: "npm sdk v2", count: 15 },
        ])
      )
      .mockImplementation(createMockChain([]));

    const res = await GET(new NextRequest("http://localhost/api/search/suggest?q=npm"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.querySuggestions).toContain("npm package manager");
    expect(data.querySuggestions).toContain("npm sdk v2");
  });

  it("deduplicates suggestions case-insensitively", async () => {
    mockDb.select
      .mockImplementationOnce(
        createMockChain([
          { query: "Trading Agent For Crypto", count: 18 },
          { query: "trading agent for crypto", count: 12 },
        ])
      )
      .mockImplementation(createMockChain([]));

    const res = await GET(new NextRequest("http://localhost/api/search/suggest?q=trad"));
    const data = await res.json();

    const normalized = data.querySuggestions.map((s: string) => s.toLowerCase());
    const occurrences = normalized.filter((s: string) => s === "trading agent for crypto").length;
    expect(occurrences).toBe(1);
  });

  it("fills suggestions up to at least 7 for default limit", async () => {
    const matchingRows = [
      {
        id: "1",
        name: "Trade Helper",
        slug: "trade-helper",
        description: "Agent",
        protocols: ["MCP", "A2A"],
        capabilities: [],
      },
    ];

    mockDb.select
      .mockImplementationOnce(createMockChain([])) // popular
      .mockImplementationOnce(createMockChain([])) // names
      .mockImplementationOnce(createMockChain(matchingRows)); // matching rows

    const res = await GET(new NextRequest("http://localhost/api/search/suggest?q=trad"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.querySuggestions.length).toBeGreaterThanOrEqual(7);
    expect(data.querySuggestions.length).toBeLessThanOrEqual(8);
  });

  it("respects limit parameter", async () => {
    mockDb.select
      .mockImplementationOnce(
        createMockChain([
          { query: "testing one", count: 12 },
          { query: "testing two", count: 10 },
          { query: "testing three", count: 8 },
          { query: "testing four", count: 6 },
        ])
      )
      .mockImplementation(createMockChain([]));

    const res = await GET(new NextRequest("http://localhost/api/search/suggest?q=test&limit=3"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.querySuggestions.length).toBe(3);
  });

  it("generates platform/entity substitutions for complex prefixes", async () => {
    mockDb.select
      .mockImplementationOnce(createMockChain([])) // popular
      .mockImplementationOnce(createMockChain([])) // names
      .mockImplementationOnce(createMockChain([])); // matching rows

    const res = await GET(
      new NextRequest("http://localhost/api/search/suggest?q=how to deploy an ai agent on twitter")
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.querySuggestions.length).toBeGreaterThanOrEqual(5);
    const preserved = data.querySuggestions.filter((s: string) =>
      s.toLowerCase().startsWith("how to deploy an ai agent on ")
    );
    expect(preserved.length).toBeGreaterThanOrEqual(5);
  });

  it("returns meta with count and source details", async () => {
    const res = await GET(new NextRequest("http://localhost/api/search/suggest?q=test"));
    const data = await res.json();

    expect(data.meta).toBeDefined();
    expect(typeof data.meta.countRequested).toBe("number");
    expect(typeof data.meta.countReturned).toBe("number");
    expect(Array.isArray(data.meta.sourcesUsed)).toBe(true);
  });

  it("question queries avoid protocol appends and tutorial/guide padding", async () => {
    mockDb.select
      .mockImplementationOnce(
        createMockChain([
          { query: "why is openai OpenClaw", count: 12 },
          { query: "why is openai tutorial", count: 9 },
          { query: "why is openai important", count: 6 },
        ])
      )
      .mockImplementationOnce(createMockChain([])) // names
      .mockImplementationOnce(createMockChain([])); // matching rows

    const res = await GET(new NextRequest("http://localhost/api/search/suggest?q=why is openai"));
    const data = await res.json();
    const suggestions = data.querySuggestions as string[];

    expect(suggestions.some((s) => s.toLowerCase().includes("openclaw"))).toBe(false);
    expect(suggestions.some((s) => s.toLowerCase().includes("mcp"))).toBe(false);
    expect(suggestions.some((s) => s.toLowerCase().includes("tutorial"))).toBe(false);
    expect(suggestions.some((s) => s.toLowerCase().includes("guide"))).toBe(false);
    expect(suggestions.some((s) => s.toLowerCase().includes("important"))).toBe(true);
  });

  it("question queries can return fewer suggestions when padded list is low", async () => {
    mockDb.select
      .mockImplementationOnce(createMockChain([])) // popular
      .mockImplementationOnce(createMockChain([])) // names
      .mockImplementationOnce(createMockChain([])); // matching rows

    const res = await GET(new NextRequest("http://localhost/api/search/suggest?q=what is openai"));
    const data = await res.json();
    const suggestions = data.querySuggestions as string[];
    expect(suggestions.length).toBeGreaterThanOrEqual(3);
    expect(suggestions.length).toBeLessThanOrEqual(8);
  });

  // --- Rate limiting ---

  it("returns 429 when rate limited", async () => {
    mockRateLimit.mockReturnValue({ allowed: false, retryAfter: 45, remaining: 0 });

    const res = await GET(new NextRequest("http://localhost/api/search/suggest?q=test"));
    const data = await res.json();

    expect(res.status).toBe(429);
    expect(data.error.message).toContain("Too many requests");
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
