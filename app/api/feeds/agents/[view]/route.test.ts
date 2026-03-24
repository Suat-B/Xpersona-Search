import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetPublicAgentFeed = vi.hoisted(() => vi.fn());
const mockRecordApiResponse = vi.hoisted(() => vi.fn());

vi.mock("@/lib/agents/public-collections", () => ({
  getPublicAgentFeed: mockGetPublicAgentFeed,
}));

vi.mock("@/lib/metrics/record", () => ({
  recordApiResponse: mockRecordApiResponse,
}));

import { GET } from "./route";

describe("GET /api/feeds/agents/[view]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the requested public feed", async () => {
    mockGetPublicAgentFeed.mockResolvedValue({
      view: "benchmarked",
      title: "Benchmarked Agents",
      description: "Public benchmark evidence.",
      items: [
        {
          slug: "demo-agent",
          name: "Demo Agent",
          description: "Benchmarked",
          source: "GITHUB_OPENCLEW",
          protocols: ["MCP"],
          capabilities: ["automation"],
          url: "/agent/demo-agent",
          updatedAt: "2026-03-24T12:00:00.000Z",
          whyIncluded: "Public benchmark evidence is available.",
        },
      ],
    });

    const res = await GET(new NextRequest("http://localhost/api/feeds/agents/benchmarked?limit=10"), {
      params: Promise.resolve({ view: "benchmarked" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.view).toBe("benchmarked");
    expect(body.items[0].whyIncluded).toContain("benchmark");
  });

  it("returns 400 for unknown views", async () => {
    const res = await GET(new NextRequest("http://localhost/api/feeds/agents/nope"), {
      params: Promise.resolve({ view: "nope" }),
    });

    expect(res.status).toBe(400);
  });
});
