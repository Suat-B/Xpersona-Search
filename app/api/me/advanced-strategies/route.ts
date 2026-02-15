import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { advancedStrategies } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import type { AdvancedDiceStrategy } from "@/lib/advanced-strategy-types";
import { coerceInt, coerceNumber, coerceCondition } from "@/lib/validation";
import { harvestStrategyForTraining } from "@/lib/ai-strategy-harvest";

// GET /api/me/advanced-strategies - List all advanced strategies for the current user
export async function GET(request: NextRequest) {
  const authResult = await getAuthUser(request);
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const strategies = await db
      .select({
        id: advancedStrategies.id,
        name: advancedStrategies.name,
        description: advancedStrategies.description,
        baseConfig: advancedStrategies.baseConfig,
        rules: advancedStrategies.rules,
        globalLimits: advancedStrategies.globalLimits,
        executionMode: advancedStrategies.executionMode,
        isPublic: advancedStrategies.isPublic,
        tags: advancedStrategies.tags,
        createdAt: advancedStrategies.createdAt,
        updatedAt: advancedStrategies.updatedAt,
      })
      .from(advancedStrategies)
      .where(eq(advancedStrategies.userId, authResult.user.id))
      .orderBy(advancedStrategies.createdAt);

    return NextResponse.json({
      success: true,
      data: { strategies },
    });
  } catch (error) {
    console.error("Error fetching advanced strategies:", error);
    return NextResponse.json(
      { error: "Failed to fetch strategies" },
      { status: 500 }
    );
  }
}

// POST /api/me/advanced-strategies - Create a new advanced strategy
export async function POST(request: NextRequest) {
  const authResult = await getAuthUser(request);
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  let body: AdvancedDiceStrategy & Record<string, unknown>;
  try {
    body = (await request.json()) as AdvancedDiceStrategy & Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { success: false, error: "VALIDATION_ERROR", message: "Invalid JSON body" },
      { status: 400 }
    );
  }

  try {
    // Validate required fields
    if (!body.name || !body.baseConfig || !body.rules) {
      return NextResponse.json(
        { success: false, error: "VALIDATION_ERROR", message: "Missing required fields: name, baseConfig, rules" },
        { status: 400 }
      );
    }

    // Coerce base config (LLMs often send strings)
    const bc = body.baseConfig;
    const amount = coerceInt(bc?.amount, 10);
    const target = coerceNumber(bc?.target, 50);
    const condition = coerceCondition(bc?.condition);
    if (amount < 1 || amount > 10000 || target < 0 || target >= 100) {
      return NextResponse.json(
        { success: false, error: "VALIDATION_ERROR", message: "Invalid baseConfig: amount 1-10000, target 0-99.99" },
        { status: 400 }
      );
    }

    const normalizedBaseConfig = { amount, target, condition };

    // Normalize rules array
    const rules = Array.isArray(body.rules)
      ? body.rules
        .filter((r: any) => r?.trigger?.type && r?.action?.type)
        .map((r: any, i: number) => ({
          id: r.id ?? `rule-${i}`,
          order: coerceInt(r.order, i),
          enabled: r.enabled !== false,
          trigger: {
            type: r.trigger.type,
            value: coerceNumber(r.trigger.value),
            value2: coerceNumber(r.trigger.value2),
            pattern: r.trigger.pattern,
          },
          action: {
            type: r.action.type,
            value: coerceNumber(r.action.value),
            targetRuleId: r.action.targetRuleId,
          },
        }))
      : [];
    if (rules.length === 0) {
      return NextResponse.json(
        { success: false, error: "VALIDATION_ERROR", message: "At least one rule with trigger.type and action.type required" },
        { status: 400 }
      );
    }

    // Check for duplicate name
    const existing = await db
      .select({ id: advancedStrategies.id })
      .from(advancedStrategies)
      .where(
        and(
          eq(advancedStrategies.userId, authResult.user.id),
          eq(advancedStrategies.name, body.name)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: "Strategy with this name already exists" },
        { status: 409 }
      );
    }

    // Create strategy
    const [newStrategy] = await db
      .insert(advancedStrategies)
      .values({
        userId: authResult.user.id,
        name: String(body.name),
        description: body.description,
        baseConfig: normalizedBaseConfig,
        rules,
        globalLimits: body.globalLimits,
        executionMode: body.executionMode === "all_matching" ? "all_matching" : "sequential",
        isPublic: body.isPublic || false,
        tags: body.tags,
      })
      .returning({
        id: advancedStrategies.id,
        name: advancedStrategies.name,
        description: advancedStrategies.description,
        baseConfig: advancedStrategies.baseConfig,
        rules: advancedStrategies.rules,
        globalLimits: advancedStrategies.globalLimits,
        executionMode: advancedStrategies.executionMode,
        isPublic: advancedStrategies.isPublic,
        tags: advancedStrategies.tags,
        createdAt: advancedStrategies.createdAt,
        updatedAt: advancedStrategies.updatedAt,
      });

    if (authResult.user.accountType === "agent" && authResult.user.agentId) {
      harvestStrategyForTraining({
        userId: authResult.user.id,
        agentId: authResult.user.agentId,
        source: "create",
        strategyType: "advanced",
        strategySnapshot: {
          name: newStrategy.name,
          description: newStrategy.description,
          baseConfig: newStrategy.baseConfig,
          rules: newStrategy.rules,
          globalLimits: newStrategy.globalLimits,
          executionMode: newStrategy.executionMode,
          tags: newStrategy.tags,
        },
        strategyId: newStrategy.id,
      });
    }

    return NextResponse.json({
      success: true,
      data: { strategy: newStrategy },
    });
  } catch (error) {
    console.error("Error creating advanced strategy:", error);
    return NextResponse.json(
      { error: "Failed to create strategy" },
      { status: 500 }
    );
  }
}
