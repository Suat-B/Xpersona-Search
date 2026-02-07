import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { strategies } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { executePlinkoRound } from "@/lib/games/execute-plinko";
import type { PlinkoStrategyConfig } from "@/lib/strategies";

const MAX_ROUNDS = 100;

export async function POST(request: Request) {
  const authResult = await getAuthUser(request as any);
  if ("error" in authResult) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: 401 }
    );
  }
  const body = await request.json().catch(() => ({}));
  const strategyId = body.strategyId as string | undefined;
  const config = body.config as PlinkoStrategyConfig | undefined;
  const maxRounds = Math.min(
    MAX_ROUNDS,
    Math.max(1, parseInt(String(body.maxRounds ?? 20), 10) || 20)
  );

  let cfg: PlinkoStrategyConfig;
  if (strategyId) {
    const [row] = await db
      .select()
      .from(strategies)
      .where(
        and(
          eq(strategies.id, strategyId),
          eq(strategies.userId, authResult.user.id),
          eq(strategies.gameType, "plinko")
        )
      )
      .limit(1);
    if (!row) {
      return NextResponse.json(
        { success: false, error: "STRATEGY_NOT_FOUND" },
        { status: 404 }
      );
    }
    cfg = row.config as PlinkoStrategyConfig;
  } else if (config?.amount != null && (config.risk === "low" || config.risk === "medium" || config.risk === "high")) {
    cfg = config;
  } else {
    return NextResponse.json(
      { success: false, error: "VALIDATION_ERROR", message: "strategyId or config (amount, risk) required" },
      { status: 400 }
    );
  }

  const { amount, risk } = cfg;
  const stopAfterRounds = cfg.stopAfterRounds ?? maxRounds;
  const stopIfBalanceBelow = cfg.stopIfBalanceBelow;
  const stopIfBalanceAbove = cfg.stopIfBalanceAbove;
  const limit = Math.min(maxRounds, stopAfterRounds);

  const results: { round: number; payout: number; balance: number }[] = [];
  let sessionPnl = 0;
  let finalBalance = authResult.user.credits;
  let stoppedReason = "max_rounds";

  for (let r = 0; r < limit; r++) {
    try {
      const roundResult = await executePlinkoRound(
        authResult.user.id,
        amount,
        risk
      );
      finalBalance = roundResult.balance;
      sessionPnl += roundResult.payout - amount;
      results.push({
        round: r + 1,
        payout: roundResult.payout,
        balance: roundResult.balance,
      });
      if (stopIfBalanceBelow != null && roundResult.balance < stopIfBalanceBelow) {
        stoppedReason = "balance_below";
        break;
      }
      if (stopIfBalanceAbove != null && roundResult.balance >= stopIfBalanceAbove) {
        stoppedReason = "balance_above";
        break;
      }
    } catch (e) {
      const err = e as Error;
      if (err.message === "INSUFFICIENT_BALANCE") {
        stoppedReason = "insufficient_balance";
        break;
      }
      throw e;
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      results,
      sessionPnl,
      finalBalance,
      roundsPlayed: results.length,
      stoppedReason,
    },
  });
}
