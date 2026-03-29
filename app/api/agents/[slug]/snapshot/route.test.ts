import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockLimit = vi.hoisted(() => vi.fn());
const mockWhere = vi.hoisted(() => vi.fn(() => ({ limit: mockLimit })));
const mockFrom = vi.hoisted(() => vi.fn(() => ({ where: mockWhere })));
const mockSelect = vi.hoisted(() => vi.fn(() => ({ from: mockFrom })));

vi.mock("@/lib/db", () => ({
  db: {
    select: mockSelect,
  },
}));

vi.mock("@/lib/trust/summary", () => ({
  getTrustSummary: vi.fn().mockResolvedValue({ reputationScore: 91 }),
}));

vi.mock("@/lib/search/scoring/safety", () => ({
  calibrateSafetyScore: vi.fn(() => 88),
}));

vi.mock("@/lib/metrics/record", () => ({
  recordApiResponse: vi.fn(),
}));

import { GET } from "./route";

describe("GET /api/v1/agents/[slug]/snapshot", () => {
  it("returns 200 for a public active agent without auth", async () => {
    mockLimit.mockResolvedValueOnce([
      {
        id: "agent-1",
        slug: "demo-agent",
        name: "Demo Agent",
        description: "A public agent",
        capabilities: ["research"],
        protocols: ["MCP"],
        safetyScore: 82,
        overallRank: 77,
        source: "GITHUB_OPENCLEW",
        updatedAt: new Date("2026-03-29T00:00:00.000Z"),
      },
    ]);

    const res = await GET(new NextRequest("http://localhost/api/v1/agents/demo-agent/snapshot"), {
      params: Promise.resolve({ slug: "demo-agent" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.slug).toBe("demo-agent");
    expect(body.name).toBe("Demo Agent");
  });
});
