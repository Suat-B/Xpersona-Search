import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const mockDb = vi.hoisted(() => ({
  execute: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

const mockGetAuthUser = vi.hoisted(() => vi.fn().mockResolvedValue({ error: "UNAUTHORIZED" }));
vi.mock("@/lib/auth-utils", () => ({
  getAuthUser: mockGetAuthUser,
}));

const mockRateLimit = vi.hoisted(() =>
  vi.fn().mockReturnValue({ allowed: true, remaining: 59 })
);
vi.mock("@/lib/search/rate-limit", () => ({
  checkSearchRateLimit: mockRateLimit,
  SEARCH_ANON_RATE_LIMIT: 60,
  SEARCH_AUTH_RATE_LIMIT: 120,
}));

describe("POST /api/search/outcome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.execute.mockResolvedValue({ rows: [] });
    mockRateLimit.mockReturnValue({ allowed: true, remaining: 59 });
  });

  it("returns 200 for valid outcome payload", async () => {
    const req = new NextRequest("http://localhost/api/search/outcome", {
      method: "POST",
      body: JSON.stringify({
        querySignature: "a".repeat(64),
        selectedResultId: "550e8400-e29b-41d4-a716-446655440000",
        outcome: "success",
        taskType: "retrieval",
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(mockDb.execute).toHaveBeenCalled();
  });

  it("returns 400 for malformed payload", async () => {
    const req = new NextRequest("http://localhost/api/search/outcome", {
      method: "POST",
      body: JSON.stringify({
        querySignature: "short",
        selectedResultId: "bad-id",
        outcome: "unknown",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockRateLimit.mockReturnValue({ allowed: false, retryAfter: 30, remaining: 0 });
    const req = new NextRequest("http://localhost/api/search/outcome", {
      method: "POST",
      body: JSON.stringify({
        querySignature: "a".repeat(64),
        selectedResultId: "550e8400-e29b-41d4-a716-446655440000",
        outcome: "timeout",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(429);
  });
});
