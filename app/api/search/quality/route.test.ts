import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

describe("GET /api/search/quality", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const whereMock = vi.fn().mockResolvedValue([
      {
        attempts: 10,
        successCount: 8,
        timeoutCount: 1,
        failureCount: 1,
        fallbackSwitches: 2,
        avgBudgetExceededRate: 0.1,
      },
    ]);
    const fromMock = vi.fn().mockReturnValue({ where: whereMock });
    mockDb.select.mockReturnValue({ from: fromMock });
  });

  it("returns aggregate metrics", async () => {
    const req = new NextRequest("http://localhost/api/search/quality?window=7d&intent=execute");
    const res = await GET(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.metrics.successRate).toBe(0.8);
    expect(json.metrics.fallbackSwitchRate).toBe(0.2);
  });

  it("rejects invalid window", async () => {
    const req = new NextRequest("http://localhost/api/search/quality?window=90d");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });
});

