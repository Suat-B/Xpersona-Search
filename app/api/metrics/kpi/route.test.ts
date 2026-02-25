import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const mockGetKpiSnapshot = vi.hoisted(() => vi.fn());

vi.mock("@/lib/metrics/registry", () => ({
  getKpiSnapshot: mockGetKpiSnapshot,
}));

describe("GET /api/metrics/kpi", () => {
  it("returns KPI snapshot payload", async () => {
    mockGetKpiSnapshot.mockReturnValue({
      searchRequests: { success: 1, noResults: 0, error: 0, fallback: 0, total: 1 },
      searchExecutionOutcomes: { success: 1, failure: 0, timeout: 0, total: 1 },
      graphFallbacks: { recommend: 0, plan: 0, top: 0, related: 0, total: 0 },
      clickThroughRate: 0.5,
      noResultRate: 0,
      top404: [],
    });

    const res = await GET(new NextRequest("http://localhost/api/metrics/kpi"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.kpi.searchRequests.total).toBe(1);
  });
});

