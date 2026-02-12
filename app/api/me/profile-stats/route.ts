import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { gameBets, crashBets } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";

const GAME_TYPES = ["dice", "plinko", "slots", "blackjack"] as const;

type GameStats = {
  bets: number;
  wagered: number;
  pnl: number;
  wins: number;
  winRate: number;
};

/**
 * GET /api/me/profile-stats
 * Aggregate stats across all games for the authenticated user.
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

  // Aggregate from game_bets (dice, plinko, slots, blackjack)
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

  // Aggregate from crash_bets
  const [crashAgg] = await db
    .select({
      totalBets: sql<number>`count(*)::int`,
      totalWagered: sql<number>`coalesce(sum(${crashBets.amount}), 0)::int`,
      totalPnl: sql<number>`coalesce(sum(${crashBets.payout} - ${crashBets.amount}), 0)::int`,
      wins: sql<number>`coalesce(sum(case when ${crashBets.payout} > 0 then 1 else 0 end), 0)::int`,
    })
    .from(crashBets)
    .where(eq(crashBets.userId, userId));

  // Last bet timestamp from game_bets
  const [lastGameBet] = await db
    .select({ createdAt: gameBets.createdAt })
    .from(gameBets)
    .where(eq(gameBets.userId, userId))
    .orderBy(desc(gameBets.createdAt))
    .limit(1);

  // Last crash bet timestamp
  const [lastCrashBet] = await db
    .select({ createdAt: crashBets.createdAt })
    .from(crashBets)
    .where(eq(crashBets.userId, userId))
    .orderBy(desc(crashBets.createdAt))
    .limit(1);

  const lastBetAt = (() => {
    const a = lastGameBet?.createdAt;
    const b = lastCrashBet?.createdAt;
    if (!a) return b ?? null;
    if (!b) return a;
    return a > b ? a : b;
  })();

  // Build per-game breakdown
  const byGame: Record<string, GameStats> = {};
  for (const gt of GAME_TYPES) {
    byGame[gt] = { bets: 0, wagered: 0, pnl: 0, wins: 0, winRate: 0 };
  }
  byGame.crash = { bets: 0, wagered: 0, pnl: 0, wins: 0, winRate: 0 };

  for (const row of gameBetsAgg) {
    const gt = row.gameType as (typeof GAME_TYPES)[number];
    if (GAME_TYPES.includes(gt) && byGame[gt]) {
      const bets = Number(row.totalBets);
      const wins = Number(row.wins);
      byGame[gt] = {
        bets,
        wagered: Number(row.totalWagered),
        pnl: Number(row.totalPnl),
        wins,
        winRate: bets > 0 ? Math.round((wins / bets) * 10000) / 100 : 0,
      };
    }
  }

  if (crashAgg) {
    const bets = Number(crashAgg.totalBets);
    const wins = Number(crashAgg.wins);
    byGame.crash = {
      bets,
      wagered: Number(crashAgg.totalWagered),
      pnl: Number(crashAgg.totalPnl),
      wins,
      winRate: bets > 0 ? Math.round((wins / bets) * 10000) / 100 : 0,
    };
  }

  // Totals
  let totalBets = 0;
  let totalWagered = 0;
  let totalPnl = 0;
  let totalWins = 0;
  for (const stats of Object.values(byGame)) {
    totalBets += stats.bets;
    totalWagered += stats.wagered;
    totalPnl += stats.pnl;
    totalWins += stats.wins;
  }
  const winRate =
    totalBets > 0 ? Math.round((totalWins / totalBets) * 10000) / 100 : 0;

  return NextResponse.json({
    success: true,
    data: {
      balance: authResult.user.credits,
      credits: authResult.user.credits,
      faucetCredits: authResult.user.faucetCredits ?? 0,
      memberSince: authResult.user.createdAt,
      lastBetAt,
      totalBets,
      totalWagered,
      totalPnl,
      winRate,
      byGame,
    },
  });
}
