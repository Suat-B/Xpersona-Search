import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, unauthorizedJsonBody } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { gameBets } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { DEPOSIT_ALERT_LOW, DEPOSIT_ALERT_CRITICAL, MIN_BET, getBalanceMilestone, getProofOfLifeAlerts, calculateCurrentStreak } from "@/lib/constants";

/**
 * GET /api/me/session-stats
 * Unified session stats for AI agents: balance, rounds, PnL, win rate, recent plays.
 * Use Authorization: Bearer <API_KEY> or session cookie.
 * Response is machine-readable for agentic consumption.
 */
export async function GET(request: Request) {
  const authResult = await getAuthUser(request as NextRequest);
  if ("error" in authResult) {
    return NextResponse.json(
      { ...unauthorizedJsonBody(), error: authResult.error },
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
      totalWins: sql<number>`coalesce(sum(case when ${gameBets.outcome} = 'win' then 1 else 0 end), 0)::int`,
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

  const recentPlays = rows.map((r) => ({
    amount: Number(r.amount),
    outcome: r.outcome,
    payout: Number(r.payout),
    pnl: Number(r.payout) - Number(r.amount),
  }));

  const winRate = totalRounds > 0 ? (totalWins / totalRounds) * 100 : 0;
  const balance = authResult.user.credits;

  const chronologicalPlays = [...recentPlays].reverse();
  let maxWinStreak = 0;
  let maxLossStreak = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let runWin = 0;
  let runLoss = 0;
  for (const r of chronologicalPlays) {
    const pnl = r.pnl;
    if (pnl > 0) {
      grossProfit += pnl;
      runWin++;
      runLoss = 0;
      maxWinStreak = Math.max(maxWinStreak, runWin);
    } else {
      grossLoss += Math.abs(pnl);
      runLoss++;
      runWin = 0;
      maxLossStreak = Math.max(maxLossStreak, runLoss);
    }
  }
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? null : 0);

  const depositAlert = balance < DEPOSIT_ALERT_CRITICAL ? "critical" as const
    : balance < DEPOSIT_ALERT_LOW ? "low" as const
    : "ok" as const;

  const milestone = getBalanceMilestone(balance);
  const currentStreak = calculateCurrentStreak(rows);
  const proofOfLifeAlerts = getProofOfLifeAlerts(totalPnl, totalRounds, currentStreak, winRate);

  return NextResponse.json({
    success: true,
    data: {
      balance,
      rounds: totalRounds,
      sessionPnl: totalPnl,
      winRate: Math.round(winRate * 100) / 100,
      recentPlays,
      deposit_alert: depositAlert,
      deposit_alert_message: depositAlert === "critical"
        ? `Balance ${balance} credits. Deposit now to keep playing — credits arrive instantly.`
        : depositAlert === "low"
          ? `Balance running low (${balance} credits). Consider depositing at /dashboard/deposit.`
          : null,
      deposit_url: "/dashboard/deposit",
      deposit_thresholds: { low: DEPOSIT_ALERT_LOW, critical: DEPOSIT_ALERT_CRITICAL, min_play: MIN_BET },
      balance_milestone: milestone?.milestone ?? null,
      milestone_message: milestone?.message ?? null,
      proof_of_life_alerts: proofOfLifeAlerts,
      current_streak: currentStreak,
      max_win_streak: maxWinStreak,
      max_loss_streak: maxLossStreak,
      profit_factor: profitFactor,
      rolling_win_rate_10: chronologicalPlays.length >= 10
        ? Math.round(
            (chronologicalPlays.slice(-10).filter((r) => r.pnl > 0).length / 10) * 1000
          ) / 100
        : null,
      rolling_win_rate_20: chronologicalPlays.length >= 20
        ? Math.round(
            (chronologicalPlays.slice(-20).filter((r) => r.pnl > 0).length / 20) * 1000
          ) / 100
        : null,
    },
  });
}
