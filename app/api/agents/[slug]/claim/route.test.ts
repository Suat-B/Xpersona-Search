import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const mockGetAuthUser = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth-utils", () => ({
  getAuthUser: mockGetAuthUser,
}));

vi.mock("@/lib/claim/rate-limit", () => ({
  checkClaimInitRateLimit: vi.fn(),
}));

describe("POST /api/agents/[slug]/claim", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns PERMANENT_ACCOUNT_REQUIRED for temporary users", async () => {
    mockGetAuthUser.mockResolvedValue({
      user: { id: "temp-user", isPermanent: false, accountType: "human" },
    });

    const req = new NextRequest("http://localhost/api/agents/frieren/claim", {
      method: "POST",
      headers: {
        referer: "http://localhost/agent/frieren/claim?step=start",
      },
    });

    const res = await POST(req, { params: Promise.resolve({ slug: "frieren" }) });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data).toMatchObject({
      success: false,
      error: "PERMANENT_ACCOUNT_REQUIRED",
      accountType: "human",
    });
    expect(data.upgradeUrl).toContain("/auth/signup?link=guest");
    expect(data.upgradeUrl).toContain(
      "callbackUrl=%2Fagent%2Ffrieren%2Fclaim%3Fstep%3Dstart"
    );
  });
});
