import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

const mockGetAuthUser = vi.hoisted(() => vi.fn());
const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
}));

vi.mock("@/lib/auth-utils", () => ({
  getAuthUser: mockGetAuthUser,
}));

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

describe("GET /api/trading/developer/account", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns PERMANENT_ACCOUNT_REQUIRED for temporary users", async () => {
    mockGetAuthUser.mockResolvedValue({
      user: { id: "temp-user", isPermanent: false, accountType: "human" },
    });

    const req = new Request("http://localhost/api/trading/developer/account", {
      headers: {
        referer: "http://localhost/trading/developer?from=claim",
      },
    });

    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data).toMatchObject({
      success: false,
      error: "PERMANENT_ACCOUNT_REQUIRED",
      accountType: "human",
    });
    expect(data.upgradeUrl).toContain("/auth/signup?link=guest");
    expect(data.upgradeUrl).toContain(
      "callbackUrl=%2Ftrading%2Fdeveloper%3Ffrom%3Dclaim"
    );
    expect(mockDb.select).not.toHaveBeenCalled();
  });
});
