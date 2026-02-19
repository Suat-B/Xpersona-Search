import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { advancedStrategies } from "@/lib/db/schema";
import type { AdvancedDiceStrategy } from "@/lib/advanced-strategy-types";

/**
 * POST /api/me/advanced-strategies/clone-from-tournament
 * Create an advanced strategy from a tournament winner's snapshot.
 * Body: { strategySnapshot: AdvancedDiceStrategy, name?: string }
 */
export async function POST(request: NextRequest) {
  const authResult = await getAuthUser(request);
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const snapshot = body.strategySnapshot as AdvancedDiceStrategy | undefined;
    const name = (body.name ?? snapshot?.name ?? "Cloned Strategy").toString().trim().slice(0, 100);

    if (!snapshot?.baseConfig || !Array.isArray(snapshot.rules)) {
      return NextResponse.json(
        { success: false, error: "VALIDATION_ERROR", message: "Invalid strategySnapshot: requires baseConfig and rules" },
        { status: 400 }
      );
    }

    const bc = snapshot.baseConfig;
    const amount = Number(bc.amount) || 10;
    const target = Number(bc.target) || 50;
    const condition: "over" | "under" = bc.condition === "under" ? "under" : "over";

    const baseConfig = { amount, target, condition } as const;
    const rules = (snapshot.rules ?? []).filter(
      (r: { trigger?: { type?: string }; action?: { type?: string } }) =>
        r?.trigger?.type && r?.action?.type
    );
    if (rules.length === 0) {
      rules.push({
        id: "noop",
        order: 0,
        enabled: true,
        trigger: { type: "balance_above", value: 999999 },
        action: { type: "set_bet_absolute", value: amount },
      });
    }

    const [inserted] = await db
      .insert(advancedStrategies)
      .values({
        userId: authResult.user.id,
        name: name || "Cloned Strategy",
        baseConfig,
        rules,
        globalLimits: (snapshot.globalLimits as Record<string, unknown>) ?? null,
        executionMode: (snapshot.executionMode as "sequential" | "all_matching") ?? "sequential",
      })
      .returning({ id: advancedStrategies.id });

    if (!inserted?.id) {
      return NextResponse.json(
        { success: false, error: "INTERNAL_ERROR", message: "Failed to create strategy" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { id: inserted.id },
    });
  } catch (err) {
    console.error("[clone-from-tournament]", err);
    return NextResponse.json(
      { success: false, error: "INTERNAL_ERROR", message: "Failed to clone" },
      { status: 500 }
    );
  }
}
