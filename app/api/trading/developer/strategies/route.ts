import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import {
  marketplaceStrategies,
  marketplaceDevelopers,
  marketplaceSubscriptions,
} from "@/lib/db/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";

/**
 * GET /api/trading/developer/strategies
 * List the authenticated developer's own strategies (all, including inactive).
 */
export async function GET(request: Request) {
  try {
    const authResult = await getAuthUser(request as never);
    if ("error" in authResult) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: 401 });
    }

    const [dev] = await db
      .select()
      .from(marketplaceDevelopers)
      .where(eq(marketplaceDevelopers.userId, authResult.user.id))
      .limit(1);

    if (!dev) {
      return NextResponse.json({
        success: true,
        data: [],
      });
    }

    const strategies = await db
      .select({
        id: marketplaceStrategies.id,
        name: marketplaceStrategies.name,
        description: marketplaceStrategies.description,
        priceMonthlyCents: marketplaceStrategies.priceMonthlyCents,
        isActive: marketplaceStrategies.isActive,
      })
      .from(marketplaceStrategies)
      .where(eq(marketplaceStrategies.developerId, dev.id))
      .orderBy(desc(marketplaceStrategies.createdAt))
      .limit(100);

    if (strategies.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
      });
    }

    const strategyIds = strategies.map((s) => s.id);
    const subsRows = await db
      .select({
        strategyId: marketplaceSubscriptions.strategyId,
        count: sql<number>`count(*)::int`,
      })
      .from(marketplaceSubscriptions)
      .where(
        and(
          eq(marketplaceSubscriptions.status, "active"),
          inArray(marketplaceSubscriptions.strategyId, strategyIds)
        )
      )
      .groupBy(marketplaceSubscriptions.strategyId);

    const subsCounts = subsRows;

    const countMap = new Map<string, number>();
    for (const row of subsCounts) {
      countMap.set(row.strategyId, row.count);
    }

    const data = strategies.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      priceMonthlyCents: s.priceMonthlyCents,
      isActive: s.isActive ?? false,
      subscriberCount: countMap.get(s.id) ?? 0,
    }));

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error("[trading/developer/strategies GET]", err);
    return NextResponse.json(
      { success: false, error: "INTERNAL_ERROR", message: "Failed to list strategies." },
      { status: 500 }
    );
  }
}
