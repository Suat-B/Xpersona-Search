import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const mockRecordSearchClick = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockHashQuery = vi.hoisted(() => vi.fn((q: string) => `hash:${q}`));
vi.mock("@/lib/search/click-tracking", () => ({
  recordSearchClick: mockRecordSearchClick,
  hashQuery: mockHashQuery,
}));

const mockRateLimit = vi.hoisted(() => vi.fn().mockResolvedValue({ allowed: true, remaining: 59 }));
vi.mock("@/lib/search/rate-limit", () => ({
  checkSearchRateLimit: mockRateLimit,
  SEARCH_ANON_RATE_LIMIT: 60,
  SEARCH_AUTH_RATE_LIMIT: 120,
}));

const mockGetAuthUser = vi.hoisted(() => vi.fn().mockResolvedValue({ error: "UNAUTHORIZED" }));
vi.mock("@/lib/auth-utils", () => ({
  getAuthUser: mockGetAuthUser,
}));

describe("POST /api/search/click", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimit.mockResolvedValue({ allowed: true, remaining: 59 });
    mockGetAuthUser.mockResolvedValue({ error: "UNAUTHORIZED" });
  });

  it("returns 400 on invalid body", async () => {
    const req = new NextRequest("http://localhost/api/search/click", {
      method: "POST",
      body: JSON.stringify({ query: "", agentId: "not-uuid", position: -1 }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("binds authenticated userId when available", async () => {
    mockGetAuthUser.mockResolvedValue({
      user: { id: "user-123" },
    });

    const req = new NextRequest("http://localhost/api/search/click", {
      method: "POST",
      body: JSON.stringify({
        query: "test",
        agentId: "550e8400-e29b-41d4-a716-446655440000",
        position: 0,
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockRecordSearchClick).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-123",
      })
    );
  });

  it("dedupes duplicate idempotency keys", async () => {
    const headers = {
      "content-type": "application/json",
      "idempotency-key": "click-1",
    };
    const payload = {
      query: "test",
      agentId: "550e8400-e29b-41d4-a716-446655440000",
      position: 0,
    };

    const req1 = new NextRequest("http://localhost/api/search/click", {
      method: "POST",
      body: JSON.stringify(payload),
      headers,
    });
    const req2 = new NextRequest("http://localhost/api/search/click", {
      method: "POST",
      body: JSON.stringify(payload),
      headers,
    });

    const res1 = await POST(req1);
    const res2 = await POST(req2);
    const body2 = await res2.json();

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(body2.deduped).toBe(true);
    expect(mockRecordSearchClick).toHaveBeenCalledTimes(1);
  });
});
