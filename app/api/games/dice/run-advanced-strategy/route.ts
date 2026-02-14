import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { advancedStrategies } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { executeDiceRound } from "@/lib/games/execute-dice";
import {
  createRuleEngineState,
  processRound,
} from "@/lib/dice-rule-engine";
import type { AdvancedDiceStrategy } from "@/lib/advanced-strategy-types";

const MAX_ROUNDS = 100;

/** POST /api/games/dice/run-advanced-strategy — Run advanced dice strategy for up to maxRounds. Body: { strategyId?, strategy?, maxRounds? } */
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
  const inlineStrategy = body.strategy as AdvancedDiceStrategy | undefined;
  const maxRounds = Math.min(
    MAX_ROUNDS,
    Math.max(1, parseInt(String(body.maxRounds ?? 20), 10) || 20)
  );

  let strategy: AdvancedDiceStrategy;

  if (strategyId) {
    // Load from database
    const [row] = await db
      .select({
        id: advancedStrategies.id,
        name: advancedStrategies.name,
        baseConfig: advancedStrategies.baseConfig,
        rules: advancedStrategies.rules,
        globalLimits: advancedStrategies.globalLimits,
        executionMode: advancedStrategies.executionMode,
      })
      .from(advancedStrategies)
      .where(
        and(
          eq(advancedStrategies.id, strategyId),
          eq(advancedStrategies.userId, authResult.user.id)
        )
      )
      .limit(1);

    if (!row) {
      return NextResponse.json(
        { success: false, error: "STRATEGY_NOT_FOUND" },
        { status: 404 }
      );
    }

    strategy = {
      ...row,
      name: row.name || "Unnamed",
      rules: row.rules.map((r: any) => ({
        ...r,
        trigger: { ...r.trigger, type: r.trigger.type as any },
        action: { ...r.action, type: r.action.type as any },
      })),
    } as AdvancedDiceStrategy;
  } else if (inlineStrategy?.baseConfig && inlineStrategy?.rules) {
    // Use inline strategy
    strategy = inlineStrategy;
  } else {
    return NextResponse.json(
      { success: false, error: "VALIDATION_ERROR", message: "strategyId or strategy object required" },
      { status: 400 }
    );
  }

  const { baseConfig } = strategy;
  const globalLimits = strategy.globalLimits;
  const limit = Math.min(
    maxRounds,
    globalLimits?.maxRounds ?? maxRounds
  );

  let balance = authResult.user.credits;
  let state = createRuleEngineState(strategy, balance);
  let amount = state.currentBet;
  let target = state.currentTarget;
  let condition = state.currentCondition;

  const results: Array<{
    round: number;
    result: number;
    win: boolean;
    payout: number;
    balance: number;
    betAmount: number;
    target: number;
    condition: string;
    executedRules: string[];
  }> = [];

  let sessionPnl = 0;
  let finalBalance = balance;
  let stoppedReason = "max_rounds";

  for (let r = 0; r < limit; r++) {
    // Check if we should skip this bet
    if (state.skipNextBet) {
      results.push({
        round: r + 1,
        result: 0,
        win: false,
        payout: 0,
        balance,
        betAmount: 0,
        target,
        condition,
        executedRules: [],
      });
      state.skipNextBet = false;
      continue;
    }

    // Check if paused
    if (state.pausedRounds > 0) {
      results.push({
        round: r + 1,
        result: 0,
        win: false,
        payout: 0,
        balance,
        betAmount: 0,
        target,
        condition,
        executedRules: [],
      });
      continue;
    }

    try {
      const roundResult = await executeDiceRound(
        authResult.user.id,
        amount,
        target,
        condition
      );

      finalBalance = roundResult.balance;
      balance = roundResult.balance;
      const pnl = roundResult.payout - amount;
      sessionPnl += pnl;

      // Process the round through the rule engine
      const engineResult = processRound(strategy, state, {
        win: roundResult.win,
        payout: roundResult.payout,
        roll: roundResult.result,
        betAmount: amount,
      });

      results.push({
        round: r + 1,
        result: roundResult.result,
        win: roundResult.win,
        payout: roundResult.payout,
        balance: roundResult.balance,
        betAmount: amount,
        target,
        condition,
        executedRules: engineResult.executedRules,
      });

      // Update state for next round
      state = engineResult.newState;
      amount = engineResult.nextBet;
      target = engineResult.nextTarget;
      condition = engineResult.nextCondition;

      // Check stop conditions
      if (engineResult.shouldStop) {
        stoppedReason = engineResult.stopReason || "rule_stop";
        break;
      }

      // Check global limits
      if (globalLimits?.stopIfBalanceBelow != null && balance < globalLimits.stopIfBalanceBelow) {
        stoppedReason = "balance_below";
        break;
      }

      if (globalLimits?.stopIfBalanceAbove != null && balance >= globalLimits.stopIfBalanceAbove) {
        stoppedReason = "balance_above";
        break;
      }

      if (globalLimits?.stopOnConsecutiveLosses && state.currentStreakLosses >= globalLimits.stopOnConsecutiveLosses) {
        stoppedReason = "consecutive_losses";
        break;
      }

      if (globalLimits?.stopOnConsecutiveWins && state.currentStreakWins >= globalLimits.stopOnConsecutiveWins) {
        stoppedReason = "consecutive_wins";
        break;
      }

      if (globalLimits?.stopOnLossAbove != null && state.sessionLoss >= globalLimits.stopOnLossAbove) {
        stoppedReason = "loss_above";
        break;
      }

      if (globalLimits?.stopOnProfitAbove != null && state.sessionProfit >= globalLimits.stopOnProfitAbove) {
        stoppedReason = "profit_above";
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
      totalWins: state.totalWins,
      totalLosses: state.totalLosses,
      winRate: results.length > 0 ? (state.totalWins / results.filter(r => r.betAmount > 0).length) * 100 : 0,
    },
  });
}
