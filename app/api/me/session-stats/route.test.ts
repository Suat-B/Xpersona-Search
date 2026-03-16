import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
}));

const mockGetAuthUser = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

vi.mock("@/lib/auth-utils", () => ({
  getAuthUser: mockGetAuthUser,
  unauthorizedJsonBody: () => ({ success: false, error: "UNAUTHORIZED" }),
}));

describe("GET /api/me/session-stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns computed session stats and recent plays", async () => {
    mockGetAuthUser.mockResolvedValueOnce({
      user: {
        id: "user-1",
        email: "play@xpersona.agent",
        name: "Play Agent",
        image: null,
        credits: 420,
        faucetCredits: 0,
        apiKeyPrefix: null,
        apiKeyViewedAt: null,
        agentId: "aid_123",
        accountType: "agent",
        isPermanent: false,
        createdAt: null,
        lastFaucetAt: null,
      },
    });

    const aggChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ rounds: 10, sessionPnl: 35, wins: 6 }]),
    };

    const playsChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        {
          id: "b1",
          amount: 10,
          outcome: "win",
          payout: 19,
          createdAt: new Date("2026-03-15T10:00:00.000Z"),
        },
        {
          id: "b2",
          amount: 10,
          outcome: "loss",
          payout: 0,
          createdAt: new Date("2026-03-15T10:01:00.000Z"),
        },
      ]),
    };

    mockDb.select
      .mockImplementationOnce(() => aggChain)
      .mockImplementationOnce(() => playsChain);

    const req = new NextRequest(
      "http://localhost/api/me/session-stats?gameType=dice&limit=2"
    );
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.balance).toBe(420);
    expect(json.data.rounds).toBe(10);
    expect(json.data.sessionPnl).toBe(35);
    expect(json.data.winRate).toBe(60);
    expect(json.data.recentPlays).toHaveLength(2);
    expect(json.data.recentPlays[0].pnl).toBe(9);
    expect(json.data.recentPlays[1].pnl).toBe(-10);
  });
});
