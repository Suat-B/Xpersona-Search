import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { strategies } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { executeSlotsRound } from "@/lib/games/execute-slots";
import type { SlotsStrategyConfig } from "@/lib/strategies";

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
  const config = body.config as SlotsStrategyConfig | undefined;
  const maxRounds = Math.min(
    MAX_ROUNDS,
    Math.max(1, parseInt(String(body.maxRounds ?? 20), 10) || 20)
  );

  let cfg: SlotsStrategyConfig;
  if (strategyId) {
    const [row] = await db
      .select()
      .from(strategies)
      .where(
        and(
          eq(strategies.id, strategyId),
          eq(strategies.userId, authResult.user.id),
          eq(strategies.gameType, "slots")
        )
      )
      .limit(1);
    if (!row) {
      return NextResponse.json(
        { success: false, error: "STRATEGY_NOT_FOUND" },
        { status: 404 }
      );
    }
    cfg = row.config as SlotsStrategyConfig;
  } else if (config?.amount != null) {
    cfg = config;
  } else {
    return NextResponse.json(
      { success: false, error: "VALIDATION_ERROR", message: "strategyId or config (amount) required" },
      { status: 400 }
    );
  }

  const { amount } = cfg;
  const stopAfterRounds = cfg.stopAfterRounds ?? maxRounds;
  const stopIfBalanceBelow = cfg.stopIfBalanceBelow;
  const stopIfBalanceAbove = cfg.stopIfBalanceAbove;
  const limit = Math.min(maxRounds, stopAfterRounds);

  const results: { round: number; totalPayout: number; balance: number }[] = [];
  let sessionPnl = 0;
  let finalBalance = authResult.user.credits;
  let stoppedReason = "max_rounds";

  for (let r = 0; r < limit; r++) {
    try {
      const roundResult = await executeSlotsRound(authResult.user.id, amount);
      finalBalance = roundResult.balance;
      sessionPnl += roundResult.totalPayout - amount;
      results.push({
        round: r + 1,
        totalPayout: roundResult.totalPayout,
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
