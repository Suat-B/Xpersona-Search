import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import {
  marketplaceStrategies,
  marketplaceDevelopers,
  users,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

const PRICE_MIN_CENTS = 999;
const PRICE_MAX_CENTS = 99900;

/**
 * GET /api/trading/strategies/[id]
 * Get strategy detail (public).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [row] = await db
      .select({
        id: marketplaceStrategies.id,
        name: marketplaceStrategies.name,
        description: marketplaceStrategies.description,
        strategySnapshot: marketplaceStrategies.strategySnapshot,
        priceMonthlyCents: marketplaceStrategies.priceMonthlyCents,
        priceYearlyCents: marketplaceStrategies.priceYearlyCents,
        platformFeePercent: marketplaceStrategies.platformFeePercent,
        isActive: marketplaceStrategies.isActive,
        developerName: users.name,
        developerEmail: users.email,
      })
      .from(marketplaceStrategies)
      .innerJoin(marketplaceDevelopers, eq(marketplaceStrategies.developerId, marketplaceDevelopers.id))
      .innerJoin(users, eq(marketplaceDevelopers.userId, users.id))
      .where(eq(marketplaceStrategies.id, id))
      .limit(1);

    if (!row) {
      return NextResponse.json(
        { success: false, error: "NOT_FOUND", message: "Strategy not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: row.id,
        name: row.name,
        description: row.description,
        strategySnapshot: row.strategySnapshot,
        priceMonthlyCents: row.priceMonthlyCents,
        priceYearlyCents: row.priceYearlyCents,
        platformFeePercent: row.platformFeePercent,
        isActive: row.isActive,
        developerName: row.developerName ?? "Developer",
        developerEmail: row.developerEmail ? row.developerEmail.replace(/(.{2})(.*)(@.*)/, "$1***$3") : null,
      },
    });
  } catch (err) {
    console.error("[trading/strategies/[id] GET]", err);
    return NextResponse.json(
      { success: false, error: "INTERNAL_ERROR", message: "Failed to get strategy." },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/trading/strategies/[id]
 * Update strategy (developer only): name, description, price, isActive.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await getAuthUser(request as never);
    if ("error" in authResult) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { name, description, priceMonthlyCents, priceYearlyCents, isActive } = body as {
      name?: string;
      description?: string;
      priceMonthlyCents?: number;
      priceYearlyCents?: number;
      isActive?: boolean;
    };

    const [strategy] = await db
      .select({
        id: marketplaceStrategies.id,
        developerId: marketplaceStrategies.developerId,
      })
      .from(marketplaceStrategies)
      .innerJoin(marketplaceDevelopers, eq(marketplaceStrategies.developerId, marketplaceDevelopers.id))
      .where(
        and(
          eq(marketplaceStrategies.id, id),
          eq(marketplaceDevelopers.userId, authResult.user.id)
        )
      )
      .limit(1);

    if (!strategy) {
      return NextResponse.json(
        { success: false, error: "NOT_FOUND", message: "Strategy not found" },
        { status: 404 }
      );
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (name !== undefined) {
      const nameStr = name.toString().trim();
      if (nameStr && nameStr.length <= 100) updates.name = nameStr;
    }
    if (description !== undefined) updates.description = description?.toString().trim() || null;
    if (typeof isActive === "boolean") updates.isActive = isActive;

    if (priceMonthlyCents !== undefined) {
      const p = Math.floor(Number(priceMonthlyCents) || 0);
      if (p >= PRICE_MIN_CENTS && p <= PRICE_MAX_CENTS) updates.priceMonthlyCents = p;
    }
    if (priceYearlyCents !== undefined) {
      const py = Math.floor(Number(priceYearlyCents) || 0);
      updates.priceYearlyCents = py >= 0 ? py : null;
    }

    await db
      .update(marketplaceStrategies)
      .set(updates as Record<string, string | number | boolean | null | Date>)
      .where(eq(marketplaceStrategies.id, id));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[trading/strategies/[id] PATCH]", err);
    return NextResponse.json(
      { success: false, error: "INTERNAL_ERROR", message: "Failed to update strategy." },
      { status: 500 }
    );
  }
}
