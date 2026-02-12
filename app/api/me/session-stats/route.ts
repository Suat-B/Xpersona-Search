import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { gameBets } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";

/**
 * GET /api/me/session-stats
 * Unified session stats for AI agents: balance, rounds, PnL, win rate, recent bets.
 * Use Authorization: Bearer <API_KEY> or session cookie.
 * Response is machine-readable for agentic consumption.
 */
export async function GET(request: Request) {
  const authResult = await getAuthUser(request as NextRequest);
  if ("error" in authResult) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: 401 }
    );
  }

  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));
  const gameType = url.searchParams.get("gameType")?.trim() || "dice";

  const whereClause = and(
    eq(gameBets.userId, authResult.user.id),
    eq(gameBets.gameType, gameType)
  );

  const [agg] = await db
    .select({
      totalPnl: sql<number>`coalesce(sum(${gameBets.payout} - ${gameBets.amount}), 0)::int`,
      totalRounds: sql<number>`count(*)::int`,
      totalWins: sql<number>`count(*) filter (where ${gameBets.outcome} = 'win')::int`,
    })
    .from(gameBets)
    .where(whereClause);

  const totalPnl = typeof agg?.totalPnl === "number" ? agg.totalPnl : Number(agg?.totalPnl) || 0;
  const totalRounds = typeof agg?.totalRounds === "number" ? agg.totalRounds : Number(agg?.totalRounds) || 0;
  const totalWins = typeof (agg as { totalWins?: number })?.totalWins === "number" ? (agg as { totalWins: number }).totalWins : 0;

  const rows = await db
    .select({
      amount: gameBets.amount,
      outcome: gameBets.outcome,
      payout: gameBets.payout,
    })
    .from(gameBets)
    .where(whereClause)
    .orderBy(desc(gameBets.createdAt))
    .limit(limit);

  const recentBets = rows.map((r) => ({
    amount: Number(r.amount),
    outcome: r.outcome,
    payout: Number(r.payout),
    pnl: Number(r.payout) - Number(r.amount),
  }));

  const winRate = totalRounds > 0 ? (totalWins / totalRounds) * 100 : 0;

  return NextResponse.json({
    success: true,
    data: {
      balance: authResult.user.credits,
      rounds: totalRounds,
      sessionPnl: totalPnl,
      winRate: Math.round(winRate * 100) / 100,
      recentBets,
    },
  });
}
