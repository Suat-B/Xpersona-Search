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
    expect(data.topAgents).toHaveLength(1);
    expect(data.topAgents[0].name).toBe("Agent One");
    expect(data.topAgents[0].trust).toBe(0.92);
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
});

