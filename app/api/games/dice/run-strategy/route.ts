import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { emitDepositAlertEvent } from "@/lib/bet-events";
import { strategies } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { executeDiceRound } from "@/lib/games/execute-dice";
import type { DiceStrategyConfig } from "@/lib/strategies";
import { coerceInt, coerceNumber, coerceCondition } from "@/lib/validation";
import {
  createProgressionState,
  getNextBet,
  type RoundResult,
} from "@/lib/dice-progression";
import { harvestStrategyForTraining } from "@/lib/ai-strategy-harvest";

const MAX_ROUNDS = 100_000;

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
  let strategyRow: { id: string; name: string; gameType: string; config: unknown } | null = null;
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
    strategyRow = { id: row.id, name: row.name, gameType: row.gameType, config: row.config };
    cfg = row.config as DiceStrategyConfig;
  } else if (config && (config.amount != null || config.target != null)) {
    const amount = coerceInt(config.amount, 10);
    const target = coerceNumber(config.target, 50);
    const condition = coerceCondition(config.condition);
    if (amount < 1 || amount > 10000 || target < 0 || target >= 100) {
      return NextResponse.json(
        { success: false, error: "VALIDATION_ERROR", message: "Invalid config: amount 1-10000, target 0-99.99, condition over|under" },
        { status: 400 }
      );
    }
    cfg = { ...config, amount, target, condition } as DiceStrategyConfig;
  } else {
    return NextResponse.json(
      { success: false, error: "VALIDATION_ERROR", message: "strategyId or config (amount, target, condition) required" },
      { status: 400 }
    );
  }

  const { target, condition } = cfg;
  const stopAfterRounds = cfg.stopAfterRounds ?? maxRounds;
  const stopIfBalanceBelow = cfg.stopIfBalanceBelow;
  const stopIfBalanceAbove = cfg.stopIfBalanceAbove;
  const limit = Math.min(maxRounds, stopAfterRounds);

  let balance = authResult.user.credits;
  let state = createProgressionState(cfg, balance);
  let { nextBet: amount } = getNextBet(state, null, cfg, balance);
  const results: { round: number; result: number; win: boolean; payout: number; balance: number; betAmount?: number }[] = [];
  let sessionPnl = 0;
  let finalBalance = balance;
  let stoppedReason = "max_rounds";

  const fromApiRequest = !!request.headers.get("Authorization")?.startsWith("Bearer ");
  const agentIdForFeed = fromApiRequest ? (authResult.user.agentId ?? "api") : authResult.user.agentId;

  for (let r = 0; r < limit; r++) {
    try {
      const roundResult = await executeDiceRound(
        authResult.user.id,
        amount,
        target,
        condition,
        undefined,
        agentIdForFeed ?? undefined
      );
      finalBalance = roundResult.balance;
      balance = roundResult.balance;
      const pnl = roundResult.payout - amount;
      sessionPnl += pnl;
      results.push({
        round: r + 1,
        result: roundResult.result,
        win: roundResult.win,
        payout: roundResult.payout,
        balance: roundResult.balance,
        betAmount: amount,
      });
      const roundResultForState: RoundResult = {
        win: roundResult.win,
        payout: roundResult.payout,
        betAmount: amount,
      };
      const { nextBet, nextState } = getNextBet(state, roundResultForState, cfg, balance);
      state = nextState;
      amount = nextBet;

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

  const data: Record<string, unknown> = {
    results,
    sessionPnl,
    finalBalance,
    roundsPlayed: results.length,
    stoppedReason,
  };

  if (authResult.user.accountType === "agent" && authResult.user.agentId) {
    const totalWins = results.filter((r) => r.win).length;
    const totalLosses = results.length - totalWins;
    harvestStrategyForTraining({
      userId: authResult.user.id,
      agentId: authResult.user.agentId,
      source: "run",
      strategyType: "basic",
      strategySnapshot: strategyRow
        ? { gameType: strategyRow.gameType, name: strategyRow.name, config: strategyRow.config }
        : { config: cfg },
      strategyId: strategyRow?.id ?? null,
      executionOutcome: {
        sessionPnl,
        roundsPlayed: results.length,
        totalWins,
        totalLosses,
        winRate: results.length > 0 ? (totalWins / results.length) * 100 : 0,
        stoppedReason,
      },
    });
  }

  if (stoppedReason === "insufficient_balance") {
    const depositUrl = "/dashboard/deposit";
    const depositAlertMessage =
      "Tell your player: \"You're out of credits. Please deposit or claim Free Credits to continue playing.\"";
    data.deposit_url = depositUrl;
    data.deposit_alert_message = depositAlertMessage;
    if (fromApiRequest) {
      emitDepositAlertEvent({
        userId: authResult.user.id,
        deposit_url: depositUrl,
        deposit_alert_message: depositAlertMessage,
      });
    }
  }
  return NextResponse.json({ success: true, data });
}
