import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetPublicAgentPageData = vi.hoisted(() => vi.fn());
const mockResolveEditorialContent = vi.hoisted(() => vi.fn());
const mockRecordApiResponse = vi.hoisted(() => vi.fn());

vi.mock("@/lib/agents/public-agent-page", () => ({
  getPublicAgentPageData: mockGetPublicAgentPageData,
}));

vi.mock("@/lib/agents/editorial-content", () => ({
  resolveEditorialContent: mockResolveEditorialContent,
}));

vi.mock("@/lib/metrics/record", () => ({
  recordApiResponse: mockRecordApiResponse,
}));

import { GET } from "./route";

describe("GET /api/agents/[slug]/content", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns editorial sections and quality", async () => {
    mockGetPublicAgentPageData.mockResolvedValue({
      id: "agent-1",
      slug: "demo-agent",
      name: "Demo Agent",
      description: "Demo description",
      capabilities: ["analysis"],
      protocols: ["MCP"],
      source: "GITHUB_OPENCLEW",
      readmeExcerpt: "Readme excerpt",
      updatedAtIso: "2026-02-28T00:00:00.000Z",
      sourceUrl: "https://github.com/demo/demo-agent",
      homepage: "https://demo.example",
      agentForClient: {
        openclawData: null,
      },
    });

    mockResolveEditorialContent.mockResolvedValue({
      sections: {
        overview: "Overview text",
        bestFor: "Best for text",
        notFor: "Not for text",
        setup: "Setup text",
        workflows: ["A", "B", "C"],
        limitations: "Limits",
        alternatives: "Alternatives",
        faq: [{ q: "Q1", a: "A1" }],
        releaseHighlights: [],
      },
      quality: {
        score: 72,
        threshold: 65,
        status: "ready",
        wordCount: 320,
        uniquenessScore: 74,
        reasons: [],
      },
      setupComplexity: "medium",
      lastReviewedAt: "2026-02-28T00:00:00.000Z",
      dataSources: ["https://github.com/demo/demo-agent"],
      useCases: ["developer-automation"],
    });

    const req = new NextRequest("http://localhost/api/agents/demo-agent/content");
    const res = await GET(req, { params: Promise.resolve({ slug: "demo-agent" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.slug).toBe("demo-agent");
    expect(body.quality.score).toBe(72);
    expect(body.sections.overview).toContain("Overview");
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=300");
  });

  it("returns 404 when agent is missing", async () => {
    mockGetPublicAgentPageData.mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/agents/missing/content");
    const res = await GET(req, { params: Promise.resolve({ slug: "missing" }) });
    expect(res.status).toBe(404);
  });
});

