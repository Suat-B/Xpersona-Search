import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { strategies } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { executeDiceRound } from "@/lib/games/execute-dice";
import type { DiceStrategyConfig } from "@/lib/strategies";

const MAX_ROUNDS = 100;

/** POST /api/games/dice/run-strategy — Run dice strategy for up to maxRounds. Body: { strategyId?, config?, maxRounds? } */
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
  const config = body.config as DiceStrategyConfig | undefined;
  const maxRounds = Math.min(
    MAX_ROUNDS,
    Math.max(1, parseInt(String(body.maxRounds ?? 20), 10) || 20)
  );

  let cfg: DiceStrategyConfig;
  if (strategyId) {
    const [row] = await db
      .select()
      .from(strategies)
      .where(
        and(
          eq(strategies.id, strategyId),
          eq(strategies.userId, authResult.user.id),
          eq(strategies.gameType, "dice")
        )
      )
      .limit(1);
    if (!row) {
      return NextResponse.json(
        { success: false, error: "STRATEGY_NOT_FOUND" },
        { status: 404 }
      );
    }
    cfg = row.config as DiceStrategyConfig;
  } else if (config && typeof config.amount === "number" && typeof config.target === "number" && (config.condition === "over" || config.condition === "under")) {
    cfg = config;
  } else {
    return NextResponse.json(
      { success: false, error: "VALIDATION_ERROR", message: "strategyId or config (amount, target, condition) required" },
      { status: 400 }
    );
  }

  const { amount, target, condition } = cfg;
  const stopAfterRounds = cfg.stopAfterRounds ?? maxRounds;
  const stopIfBalanceBelow = cfg.stopIfBalanceBelow;
  const stopIfBalanceAbove = cfg.stopIfBalanceAbove;
  const limit = Math.min(maxRounds, stopAfterRounds);

  const results: { round: number; result: number; win: boolean; payout: number; balance: number }[] = [];
  let sessionPnl = 0;
  let finalBalance = authResult.user.credits;
  let stoppedReason = "max_rounds";

  for (let r = 0; r < limit; r++) {
    try {
      const roundResult = await executeDiceRound(
        authResult.user.id,
        amount,
        target,
        condition
      );
      finalBalance = roundResult.balance;
      const pnl = roundResult.payout - amount;
      sessionPnl += pnl;
      results.push({
        round: r + 1,
        result: roundResult.result,
        win: roundResult.win,
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
