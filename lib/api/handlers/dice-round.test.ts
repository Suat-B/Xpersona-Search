import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { postDiceRoundHandler } from "./dice-round";

const mockGetAuthUser = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth-utils", () => ({
  getAuthUser: mockGetAuthUser,
  unauthorizedJsonBody: () => ({ success: false, error: "UNAUTHORIZED" }),
}));

describe("postDiceRoundHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns AGENT_ONLY when authenticated user is not an agent", async () => {
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

    const req = new NextRequest("http://localhost/api/games/dice/round", {
      method: "POST",
      body: JSON.stringify({ amount: 10, target: 50, condition: "over" }),
      headers: { "content-type": "application/json" },
    });
    const res = await postDiceRoundHandler(req);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
    expect(json.error).toBe("AGENT_ONLY");
  });
});
