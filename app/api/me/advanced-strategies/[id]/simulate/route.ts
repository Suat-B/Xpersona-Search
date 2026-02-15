import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { advancedStrategies } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { simulateStrategy } from "@/lib/dice-rule-engine";
import { DICE_HOUSE_EDGE } from "@/lib/constants";
import { coerceInt, coerceNumber, coerceCondition } from "@/lib/validation";
import type { AdvancedDiceStrategy } from "@/lib/advanced-strategy-types";

// POST /api/me/advanced-strategies/[id]/simulate - Simulate a strategy
export async function POST(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> }
) {
  const authResult = await getAuthUser(request);
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }
  const resolved = await context.params;
  const id = typeof resolved.id === "string" ? resolved.id : resolved.id?.[0];
  if (!id) return NextResponse.json({ error: "Invalid route" }, { status: 400 });

  try {
    const body = (await request.json().catch(() => ({}))) as { rounds?: unknown; startingBalance?: unknown };
    const rounds = Math.min(Math.max(1, coerceInt(body.rounds, 100)), 10000);
    const startingBalance = Math.max(1, coerceInt(body.startingBalance, 1000));

    // Get strategy
    const [strategy] = await db
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
          eq(advancedStrategies.id, id),
          eq(advancedStrategies.userId, authResult.user.id)
        )
      )
      .limit(1);

    if (!strategy) {
      return NextResponse.json(
        { error: "Strategy not found" },
        { status: 404 }
      );
    }

    // Normalize rules with coercion (DB/LLM may send numbers as strings)
    const rules = strategy.rules
      .filter((r: { trigger?: { type?: string }; action?: { type?: string } }) => r?.trigger?.type && r?.action?.type)
      .map((r: Record<string, unknown>, i: number) => ({
        ...r,
        id: r.id ?? `rule-${i}`,
        order: coerceInt((r as { order?: unknown }).order, i),
        enabled: (r as { enabled?: boolean }).enabled !== false,
        trigger: {
          type: (r.trigger as { type: string }).type,
          value: coerceNumber((r.trigger as { value?: unknown })?.value),
          value2: coerceNumber((r.trigger as { value2?: unknown })?.value2),
          pattern: (r.trigger as { pattern?: string })?.pattern,
        },
        action: {
          type: (r.action as { type: string }).type,
          value: coerceNumber((r.action as { value?: unknown })?.value),
          targetRuleId: (r.action as { targetRuleId?: string })?.targetRuleId,
        },
      }));

    // Run simulation
    const result = simulateStrategy(
      {
        ...strategy,
        name: strategy.name || "Unnamed",
        baseConfig: {
          amount: coerceInt((strategy.baseConfig as { amount?: unknown })?.amount, 10),
          target: coerceNumber((strategy.baseConfig as { target?: unknown })?.target, 50),
          condition: coerceCondition((strategy.baseConfig as { condition?: unknown })?.condition),
        },
        rules,
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
          winRate: result.roundHistory.length > 0
            ? (result.totalWins / result.roundHistory.length) * 100
            : 0,
          maxBalance: result.maxBalance,
          minBalance: result.minBalance,
          shouldStop: result.shouldStop,
          stopReason: result.stopReason,
          // Return last 50 rounds only to keep response size reasonable
          recentRounds: result.roundHistory.slice(-50),
        },
      },
    });
  } catch (error) {
    console.error("Error simulating strategy:", error);
    return NextResponse.json(
      { error: "Failed to simulate strategy" },
      { status: 500 }
    );
  }
}
