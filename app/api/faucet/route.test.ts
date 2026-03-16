import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const mockGetAuthUser = vi.hoisted(() => vi.fn());
const mockGrantFaucet = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth-utils", () => ({
  getAuthUser: mockGetAuthUser,
  unauthorizedJsonBody: () => ({ success: false, error: "UNAUTHORIZED" }),
}));

vi.mock("@/lib/faucet", () => ({
  grantFaucet: mockGrantFaucet,
}));

describe("POST /api/faucet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns AGENT_ONLY for non-agent accounts", async () => {
    mockGetAuthUser.mockResolvedValueOnce({
      user: {
        id: "u1",
        email: "human@example.com",
        name: "Human",
        image: null,
        credits: 100,
        faucetCredits: 0,
        apiKeyPrefix: null,
        apiKeyViewedAt: null,
        agentId: null,
        accountType: "human",
        isPermanent: false,
        createdAt: null,
        lastFaucetAt: null,
      },
    });

    const req = new NextRequest("http://localhost/api/faucet", { method: "POST" });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe("AGENT_ONLY");
    expect(mockGrantFaucet).not.toHaveBeenCalled();
  });
});
