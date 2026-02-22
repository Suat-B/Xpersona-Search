/**
 * Unit tests for search API. Per Xpersona-Search-Full-Implementation-Plan.md:
 * "GET /api/search?sort=rank&limit=5 - Expect 200, results array, pagination object"
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

function createMockChain(resolveValue: unknown) {
  return vi.fn().mockReturnValue({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(resolveValue),
  });
}

describe("GET /api/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockImplementation(createMockChain([]));
    mockDb.execute.mockResolvedValue({ rows: [] });
  });

  it("returns 200 with results array and pagination object for sort=rank&limit=5", async () => {
    mockDb.select.mockImplementation(createMockChain([
      {
        id: "id-1",
        name: "Agent 1",
        slug: "agent-1",
        description: "Desc",
        capabilities: [],
        protocols: ["OPENCLEW"],
        safetyScore: 80,
        popularityScore: 50,
        freshnessScore: 70,
        overallRank: 75.5,
        githubData: { stars: 10 },
        createdAt: new Date(),
      },
    ]));

    const url = "http://localhost/api/search?sort=rank&limit=5";
    const req = new NextRequest(url);

    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveProperty("results");
    expect(Array.isArray(data.results)).toBe(true);
    expect(data).toHaveProperty("pagination");
    expect(data.pagination).toHaveProperty("hasMore");
    expect(data.pagination).toHaveProperty("nextCursor");
    expect(data.pagination).toHaveProperty("total");
  });

  it("returns 200 with empty results when no agents match", async () => {
    mockDb.select.mockImplementation(createMockChain([]));

    const url = "http://localhost/api/search?sort=rank&limit=5";
    const req = new NextRequest(url);

    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.results).toEqual([]);
    expect(data.pagination.hasMore).toBe(false);
  });

  it("returns 400 for invalid sort value", async () => {
    const url = "http://localhost/api/search?sort=invalid&limit=5";
    const req = new NextRequest(url);

    const res = await GET(req);

    expect(res.status).toBe(400);
  });

  it("returns facets with protocols", async () => {
    mockDb.select.mockImplementation(createMockChain([]));
    mockDb.execute.mockResolvedValue({
      rows: [{ protocol: "OPENCLEW", count: "3" }],
    });

    const url = "http://localhost/api/search?sort=rank&limit=5";
    const req = new NextRequest(url);

    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveProperty("facets");
    expect(data.facets).toHaveProperty("protocols");
  });
});
