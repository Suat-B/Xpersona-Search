import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
}));

const mockGetTrustSummary = vi.hoisted(() => vi.fn());
const mockRecordApiResponse = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

vi.mock("@/lib/trust/summary", () => ({
  getTrustSummary: mockGetTrustSummary,
}));

vi.mock("@/lib/metrics/record", () => ({
  recordApiResponse: mockRecordApiResponse,
}));

import { GET } from "./route";

function createSelectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

describe("GET /api/agents/[slug]/snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockImplementation(() => createSelectChain([]));
    mockGetTrustSummary.mockResolvedValue(null);
  });

  it("returns stable JSON shape and cache headers", async () => {
    mockDb.select.mockImplementation(() =>
      createSelectChain([
        {
          id: "agent-1",
          slug: "demo-agent",
          name: "Demo Agent",
          description: "Demo description",
          capabilities: ["planning"],
          protocols: ["MCP", "OPENCLEW"],
          safetyScore: 80,
          overallRank: 72.5,
          source: "GITHUB_OPENCLEW",
          updatedAt: new Date("2026-02-25T12:00:00.000Z"),
        },
      ])
    );
    mockGetTrustSummary.mockResolvedValue({ reputationScore: 91 });

    const req = new NextRequest("http://localhost/api/agents/demo-agent/snapshot");
    const res = await GET(req, { params: Promise.resolve({ slug: "demo-agent" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toMatchObject({
      id: "agent-1",
      slug: "demo-agent",
      name: "Demo Agent",
      protocols: ["MCP", "OPENCLAW"],
      trustScore: 0.91,
      source: "GITHUB_OPENCLEW",
    });
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=300");
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });

  it("returns 404 when agent is missing", async () => {
    const req = new NextRequest("http://localhost/api/agents/missing/snapshot");
    const res = await GET(req, { params: Promise.resolve({ slug: "missing" }) });

    expect(res.status).toBe(404);
  });
});
