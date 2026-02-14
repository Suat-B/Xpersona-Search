import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { advancedStrategies } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { simulateStrategy } from "@/lib/dice-rule-engine";
import { DICE_HOUSE_EDGE } from "@/lib/constants";

// POST /api/me/advanced-strategies/[id]/simulate - Simulate a strategy
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await getAuthUser(request);
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const rounds = Math.min(parseInt(body.rounds) || 100, 10000); // Max 10k rounds
    const startingBalance = parseInt(body.startingBalance) || 1000;

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

    // Run simulation
    const result = simulateStrategy(
      {
        ...strategy,
        name: strategy.name || "Unnamed",
        // Cast rules to proper type since DB returns string for trigger.type
        rules: strategy.rules.map(r => ({
          ...r,
          trigger: {
            ...r.trigger,
            type: r.trigger.type as any,
          },
          action: {
            ...r.action,
            type: r.action.type as any,
          },
        })),
      } as any,
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
