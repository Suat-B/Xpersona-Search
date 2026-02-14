import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { simulateStrategy } from "@/lib/dice-rule-engine";
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
    const rounds = Math.min(Math.max(1, parseInt(body.rounds) || 100), 10000);
    const startingBalance = Math.max(1, parseInt(body.startingBalance) || 1000);

    if (
      !strategy?.baseConfig ||
      typeof strategy.baseConfig.amount !== "number" ||
      typeof strategy.baseConfig.target !== "number" ||
      !Array.isArray(strategy.rules)
    ) {
      return NextResponse.json(
        { error: "Invalid strategy: requires baseConfig (amount, target, condition) and rules array" },
        { status: 400 }
      );
    }

    const result = simulateStrategy(
      {
        ...strategy,
        baseConfig: {
          amount: strategy.baseConfig.amount,
          target: strategy.baseConfig.target,
          condition: strategy.baseConfig.condition || "over",
        },
        rules: strategy.rules || [],
        executionMode: strategy.executionMode || "sequential",
      },
      startingBalance,
      rounds
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
