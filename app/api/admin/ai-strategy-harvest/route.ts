import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { isAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { aiStrategyHarvest } from "@/lib/db/schema";
import { desc, eq, and, gte, lte, sql } from "drizzle-orm";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

/**
 * GET /api/admin/ai-strategy-harvest — List harvested AI strategies (admin only).
 * Query: from (ISO date), to (ISO date), strategyType (advanced|basic), source (create|run), limit, offset.
 * For ML training datasets and analytics.
 */
export async function GET(request: NextRequest) {
  const authResult = await getAuthUser(request);
  if ("error" in authResult) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: 401 }
    );
  }
  if (!isAdmin(authResult.user)) {
    return NextResponse.json(
      { success: false, error: "FORBIDDEN", message: "Admin access required" },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)
  );
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
  const strategyType = url.searchParams.get("strategyType");
  const source = url.searchParams.get("source");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const conditions = [];
  if (strategyType === "advanced" || strategyType === "basic") {
    conditions.push(eq(aiStrategyHarvest.strategyType, strategyType));
  }
  if (source === "create" || source === "run") {
    conditions.push(eq(aiStrategyHarvest.source, source));
  }
  if (from) {
    const fromDate = new Date(from);
    if (!isNaN(fromDate.getTime())) {
      conditions.push(gte(aiStrategyHarvest.harvestedAt, fromDate));
    }
  }
  if (to) {
    const toDate = new Date(to);
    if (!isNaN(toDate.getTime())) {
      conditions.push(lte(aiStrategyHarvest.harvestedAt, toDate));
    }
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : sql`true`;

  const rows = await db
    .select({
      id: aiStrategyHarvest.id,
      userId: aiStrategyHarvest.userId,
      agentId: aiStrategyHarvest.agentId,
      source: aiStrategyHarvest.source,
      strategyType: aiStrategyHarvest.strategyType,
      strategySnapshot: aiStrategyHarvest.strategySnapshot,
      strategyId: aiStrategyHarvest.strategyId,
      executionOutcome: aiStrategyHarvest.executionOutcome,
      harvestedAt: aiStrategyHarvest.harvestedAt,
    })
    .from(aiStrategyHarvest)
    .where(whereClause)
    .orderBy(desc(aiStrategyHarvest.harvestedAt))
    .limit(limit)
    .offset(offset);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(aiStrategyHarvest)
    .where(whereClause);

  return NextResponse.json({
    success: true,
    data: {
      harvests: rows,
      totalCount: countRow?.count ?? 0,
      limit,
      offset,
    },
  });
}
