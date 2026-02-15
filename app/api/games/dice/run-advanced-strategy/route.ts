import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { emitDepositAlertEvent } from "@/lib/bet-events";
import { advancedStrategies } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { executeDiceRound } from "@/lib/games/execute-dice";
import {
  createRuleEngineState,
  processRound,
} from "@/lib/dice-rule-engine";
import type { AdvancedDiceStrategy } from "@/lib/advanced-strategy-types";
import { coerceInt, coerceNumber, coerceCondition } from "@/lib/validation";
import { harvestStrategyForTraining } from "@/lib/ai-strategy-harvest";

const MAX_ROUNDS = 100_000;

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
  } else if (inlineStrategy?.baseConfig && Array.isArray(inlineStrategy?.rules)) {
    // Normalize inline strategy (coerce types from LLM)
    const bc = inlineStrategy.baseConfig;
    const amount = coerceInt(bc?.amount, 10);
    const target = coerceNumber(bc?.target, 50);
    const condition = coerceCondition(bc?.condition);
    if (amount < 1 || amount > 10000 || target < 0 || target >= 100) {
      return NextResponse.json(
        { success: false, error: "VALIDATION_ERROR", message: "Invalid baseConfig: amount 1-10000, target 0-99.99" },
        { status: 400 }
      );
    }
    const rules = inlineStrategy.rules
      .filter((r: any) => r?.trigger?.type && r?.action?.type)
      .map((r: any, i: number) => ({
        id: r.id ?? `rule-${i}`,
        order: coerceInt(r.order, i),
        enabled: r.enabled !== false,
        trigger: { type: r.trigger.type, value: coerceNumber(r.trigger.value), value2: coerceNumber(r.trigger.value2), pattern: r.trigger.pattern },
        action: { type: r.action.type, value: coerceNumber(r.action.value), targetRuleId: r.action.targetRuleId },
      }));
    if (rules.length === 0) {
      return NextResponse.json(
        { success: false, error: "VALIDATION_ERROR", message: "At least one valid rule (trigger.type, action.type) required" },
        { status: 400 }
      );
    }
    strategy = {
      ...inlineStrategy,
      name: inlineStrategy.name || "Inline",
      baseConfig: { amount, target, condition },
      rules,
    } as AdvancedDiceStrategy;
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

  const fromApiRequest = !!request.headers.get("Authorization")?.startsWith("Bearer ");
  const agentIdForFeed = fromApiRequest ? (authResult.user.agentId ?? "api") : authResult.user.agentId;

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
        condition,
        undefined,
        agentIdForFeed ?? undefined
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

  const responseData: Record<string, unknown> = {
    results,
    sessionPnl,
    finalBalance,
    roundsPlayed: results.length,
    stoppedReason,
    totalWins: state.totalWins,
    totalLosses: state.totalLosses,
    winRate: results.length > 0 ? (state.totalWins / results.filter(r => r.betAmount > 0).length) * 100 : 0,
  };

  if (authResult.user.accountType === "agent" && authResult.user.agentId) {
    harvestStrategyForTraining({
      userId: authResult.user.id,
      agentId: authResult.user.agentId,
      source: "run",
      strategyType: "advanced",
      strategySnapshot: {
        name: strategy.name,
        baseConfig: strategy.baseConfig,
        rules: strategy.rules,
        globalLimits: strategy.globalLimits,
        executionMode: strategy.executionMode ?? "sequential",
      },
      strategyId: strategyId ?? null,
      executionOutcome: {
        sessionPnl,
        roundsPlayed: results.length,
        totalWins: state.totalWins,
        totalLosses: state.totalLosses,
        winRate: responseData.winRate as number,
        stoppedReason,
      },
    });
  }

  if (stoppedReason === "insufficient_balance") {
    const depositUrl = "/dashboard/deposit";
    const depositAlertMessage =
      "Tell your player: \"You're out of credits. Please deposit or claim Free Credits to continue playing.\"";
    responseData.deposit_url = depositUrl;
    responseData.deposit_alert_message = depositAlertMessage;
    if (fromApiRequest) {
      emitDepositAlertEvent({
        userId: authResult.user.id,
        deposit_url: depositUrl,
        deposit_alert_message: depositAlertMessage,
      });
    }
  }
  return NextResponse.json({ success: true, data: responseData });
}
