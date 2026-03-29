import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockLimit = vi.hoisted(() => vi.fn());
const mockOrderBy = vi.hoisted(() => vi.fn(() => ({ limit: mockLimit })));
const mockWhere = vi.hoisted(() => vi.fn(() => ({ orderBy: mockOrderBy, limit: mockLimit })));
const mockFrom = vi.hoisted(() => vi.fn(() => ({ where: mockWhere })));
const mockSelect = vi.hoisted(() => vi.fn(() => ({ from: mockFrom })));

vi.mock("@/lib/db", () => ({
  db: {
    select: mockSelect,
  },
}));

vi.mock("@/lib/trust/db", () => ({
  hasTrustTable: vi.fn()
    .mockResolvedValueOnce(true)
    .mockResolvedValueOnce(true),
}));

vi.mock("@/lib/metrics/record", () => ({
  recordApiResponse: vi.fn(),
}));

import { GET } from "./route";

describe("GET /api/v1/agents/[slug]/trust", () => {
  it("returns 200 for a public active agent without auth", async () => {
    mockLimit
      .mockResolvedValueOnce([{ id: "agent-1" }])
      .mockResolvedValueOnce([
        {
          status: "VERIFIED",
          verifiedAt: new Date("2026-03-29T00:00:00.000Z"),
          expiresAt: null,
          protocolChecks: [],
          capabilityChecks: [],
          latencyProbeMs: 140,
          errorRateProbe: 0.01,
          evidenceRef: "probe",
        },
      ])
      .mockResolvedValueOnce([
        {
          scoreTotal: 91,
          scoreSuccess: 94,
          scoreReliability: 90,
          scoreFallback: 89,
          attempts30d: 120,
          successRate30d: 0.98,
          p95LatencyMs: 440,
          fallbackRate: 0.02,
          computedAt: new Date("2026-03-29T00:00:00.000Z"),
          windowStart: new Date("2026-03-01T00:00:00.000Z"),
          windowEnd: new Date("2026-03-29T00:00:00.000Z"),
        },
      ]);

    const res = await GET(new NextRequest("http://localhost/api/v1/agents/demo-agent/trust"), {
      params: Promise.resolve({ slug: "demo-agent" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.handshake.status).toBe("VERIFIED");
    expect(body.reputation.scoreTotal).toBe(91);
  });
});
