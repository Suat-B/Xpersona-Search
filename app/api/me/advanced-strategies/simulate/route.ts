import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { simulateStrategy } from "@/lib/dice-rule-engine";
import { DICE_HOUSE_EDGE } from "@/lib/constants";
import { coerceInt, coerceNumber, coerceCondition } from "@/lib/validation";
import type { AdvancedDiceStrategy } from "@/lib/advanced-strategy-types";

/**
 * POST /api/me/advanced-strategies/simulate
 * Simulate an inline advanced strategy (no save required).
 * Body: { strategy: AdvancedDiceStrategy, rounds?: number, startingBalance?: number }
 */
export async function POST(request: NextRequest) {
  const authResult = await getAuthUser(request);
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const body = await request.json();
    const strategy = body.strategy as AdvancedDiceStrategy | undefined;
    const rounds = Math.min(Math.max(1, coerceInt(body.rounds, 100)), 10000);
    const startingBalance = Math.max(1, coerceInt(body.startingBalance, 1000));

    if (!strategy?.baseConfig || !Array.isArray(strategy.rules)) {
      return NextResponse.json(
        { error: "Invalid strategy: requires baseConfig (amount, target, condition) and rules array" },
        { status: 400 }
      );
    }

    const bc = strategy.baseConfig;
    const amount = coerceInt(bc?.amount, 10);
    const target = coerceNumber(bc?.target, 50);
    const condition = coerceCondition(bc?.condition);
    if (amount < 1 || amount > 10000 || target < 0 || target >= 100) {
      return NextResponse.json(
        { error: "Invalid baseConfig: amount 1-10000, target 0-99.99" },
        { status: 400 }
      );
    }

    const rules = (strategy.rules as { id?: string; order?: unknown; enabled?: boolean; trigger?: { type?: string; value?: unknown; value2?: unknown; pattern?: string }; action?: { type?: string; value?: unknown; targetRuleId?: string } }[])
      .filter((r) => r?.trigger?.type && r?.action?.type)
      .map((r, i) => ({
        id: r.id ?? `rule-${i}`,
        order: coerceInt(r.order, i),
        enabled: r.enabled !== false,
        trigger: {
          type: r.trigger!.type as import("@/lib/advanced-strategy-types").TriggerType,
          value: coerceNumber(r.trigger?.value),
          value2: coerceNumber(r.trigger?.value2),
          pattern: r.trigger?.pattern,
        },
        action: {
          type: r.action!.type as import("@/lib/advanced-strategy-types").ActionType,
          value: coerceNumber(r.action?.value),
          targetRuleId: r.action?.targetRuleId,
        },
      }));

    if (rules.length === 0) {
      return NextResponse.json(
        { error: "At least one valid rule (trigger.type, action.type) required" },
        { status: 400 }
      );
    }

    const result = simulateStrategy(
      {
        ...strategy,
        baseConfig: { amount, target, condition },
        rules: rules as import("@/lib/advanced-strategy-types").StrategyRule[],
        executionMode: strategy.executionMode === "all_matching" ? "all_matching" : "sequential",
      } as AdvancedDiceStrategy,
      startingBalance,
      rounds,
      DICE_HOUSE_EDGE
    );

    return NextResponse.json({
      success: true,
      data: {
        simulation: {
          rounds: result.roundHistory.length,
          finalBalance: result.finalBalance,
          profit: result.profit,
          totalWins: result.totalWins,
          totalLosses: result.totalLosses,
          winRate:
            result.roundHistory.length > 0
              ? (result.totalWins / result.roundHistory.length) * 100
              : 0,
          maxBalance: result.maxBalance,
          minBalance: result.minBalance,
          shouldStop: result.shouldStop,
          stopReason: result.stopReason,
          recentRounds: result.roundHistory.slice(-50),
        },
      },
    });
  } catch (error) {
    console.error("Error simulating advanced strategy:", error);
    return NextResponse.json(
      { error: "Failed to simulate strategy" },
      { status: 500 }
    );
  }
}
