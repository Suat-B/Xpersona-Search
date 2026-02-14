import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { gameBets } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";

type GameStats = {
  bets: number;
  wagered: number;
  pnl: number;
  wins: number;
  winRate: number;
};

/**
 * GET /api/me/profile-stats
 * Aggregate stats for dice (the only game).
 * Returns balance, total stats, and per-game breakdown.
 */
export async function GET(request: Request) {
  const authResult = await getAuthUser(request as NextRequest);
  if ("error" in authResult) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: 401 }
    );
  }

  const userId = authResult.user.id;

  const gameBetsAgg = await db
    .select({
      gameType: gameBets.gameType,
      totalBets: sql<number>`count(*)::int`,
      totalWagered: sql<number>`coalesce(sum(${gameBets.amount}), 0)::int`,
      totalPnl: sql<number>`coalesce(sum(${gameBets.payout} - ${gameBets.amount}), 0)::int`,
      wins: sql<number>`coalesce(sum(case when ${gameBets.outcome} = 'win' then 1 else 0 end), 0)::int`,
    })
    .from(gameBets)
    .where(eq(gameBets.userId, userId))
    .groupBy(gameBets.gameType);

  const [lastGameBet] = await db
    .select({ createdAt: gameBets.createdAt })
    .from(gameBets)
    .where(eq(gameBets.userId, userId))
    .orderBy(desc(gameBets.createdAt))
    .limit(1);

  const byGame: Record<string, GameStats> = {
    dice: { bets: 0, wagered: 0, pnl: 0, wins: 0, winRate: 0 },
  };

  for (const row of gameBetsAgg) {
    if (row.gameType === "dice") {
      const bets = Number(row.totalBets);
      const wins = Number(row.wins);
      byGame.dice = {
        bets,
        wagered: Number(row.totalWagered),
        pnl: Number(row.totalPnl),
        wins,
        winRate: bets > 0 ? Math.round((wins / bets) * 10000) / 100 : 0,
      };
    }
  }

  const totalBets = byGame.dice.bets;
  const totalWagered = byGame.dice.wagered;
  const totalPnl = byGame.dice.pnl;
  const totalWins = byGame.dice.wins;
  const winRate =
    totalBets > 0 ? Math.round((totalWins / totalBets) * 10000) / 100 : 0;

  return NextResponse.json({
    success: true,
    data: {
      balance: authResult.user.credits,
      credits: authResult.user.credits,
      faucetCredits: authResult.user.faucetCredits ?? 0,
      memberSince: authResult.user.createdAt,
      lastBetAt: lastGameBet?.createdAt ?? null,
      totalBets,
      totalWagered,
      totalPnl,
      winRate,
      byGame,
    },
  });
}
