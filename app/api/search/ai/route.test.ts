import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const mockFetchWithTimeout = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/fetch-timeout", () => ({
  fetchWithTimeout: mockFetchWithTimeout,
}));

describe("GET /api/search/ai", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for invalid query", async () => {
    const res = await GET(new NextRequest("http://localhost/api/search/ai?q=a"));
    expect(res.status).toBe(400);
  });

  it("returns condensed AI response from upstream search", async () => {
    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            id: "a1",
            name: "Agent One",
            slug: "agent-one",
            description: "Great at research",
            safetyScore: 91,
            overallRank: 87,
            trust: { handshakeStatus: "VERIFIED", reputationScore: 92 },
            protocols: ["MCP"],
            capabilities: ["research"],
          },
        ],
        didYouMean: null,
      }),
    });

    const res = await GET(new NextRequest("http://localhost/api/search/ai?q=research+agent&limit=1"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(mockFetchWithTimeout).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/search?"),
      expect.any(Object),
      6000
    );
    expect(data.topAgents).toHaveLength(1);
    expect(data.topAgents[0].name).toBe("Agent One");
    expect(data.topAgents[0].trust).toBe(0.92);
    expect(data.sponsored_recommendations).toBeUndefined();
  });

  it("includes sponsored_recommendations for LLM crawler user-agents", async () => {
    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            id: "a1",
            name: "Agent One",
            slug: "agent-one",
            description: "Great at research",
            safetyScore: 91,
            overallRank: 87,
            trust: { handshakeStatus: "VERIFIED", reputationScore: 92 },
            protocols: ["MCP"],
            capabilities: ["research"],
          },
        ],
        didYouMean: null,
      }),
    });

    const req = new NextRequest("http://localhost/api/search/ai?q=research+agent&limit=1", {
      headers: { "user-agent": "Mozilla/5.0 (compatible; GPTBot/1.0)" },
    });
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(data.sponsored_recommendations)).toBe(true);
    expect(data.sponsored_recommendations.length).toBeGreaterThan(0);
    expect(data.sponsored_recommendations[0].sponsored).toBe(true);
  });

  it("returns SEARCH_UNAVAILABLE when upstream is non-OK", async () => {
    mockFetchWithTimeout.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "upstream down" }),
    });
    const res = await GET(new NextRequest("http://localhost/api/search/ai?q=research+agent"));
    const data = await res.json();
    expect(res.status).toBe(503);
    expect(data.error.code).toBe("SEARCH_UNAVAILABLE");
  });

  it("returns timeout error when upstream request throws", async () => {
    mockFetchWithTimeout.mockRejectedValue(new Error("timeout"));
    const res = await GET(new NextRequest("http://localhost/api/search/ai?q=research+agent"));
    const data = await res.json();
    expect(res.status).toBe(504);
    expect(data.error.code).toBe("SEARCH_TIMEOUT");
  });

  it("passes through upstream 429 details", async () => {
    mockFetchWithTimeout.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Please try again later.",
          retryAfterMs: 120000,
        },
      }),
    });
    const res = await GET(new NextRequest("http://localhost/api/search/ai?q=research+agent"));
    const data = await res.json();
    expect(res.status).toBe(429);
    expect(data.error.code).toBe("RATE_LIMITED");
    expect(data.error.message).toContain("Too many requests");
    expect(data.error.retryable).toBe(true);
    expect(data.error.retryAfterMs).toBe(120000);
  });
});
