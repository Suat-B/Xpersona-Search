import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { searchOutcomes } from "@/lib/db/schema";

const WINDOW_TO_DAYS: Record<string, number> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
};

export async function GET(req: NextRequest) {
  const windowParam = req.nextUrl.searchParams.get("window") ?? "7d";
  const intent = req.nextUrl.searchParams.get("intent") ?? "execute";
  const days = WINDOW_TO_DAYS[windowParam];
  if (!days) {
    return NextResponse.json({ error: "window must be one of 24h,7d,30d" }, { status: 400 });
  }
  if (!["discover", "execute"].includes(intent)) {
    return NextResponse.json({ error: "intent must be discover or execute" }, { status: 400 });
  }

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const whereClause = and(
    gte(searchOutcomes.lastOutcomeAt, since),
    intent === "execute" ? sql`${searchOutcomes.taskType} != 'general'` : eq(searchOutcomes.taskType, "general")
  );

  const result = await db
    .select({
      attempts: sql<number>`COALESCE(SUM(${searchOutcomes.attempts}), 0)`,
      successCount: sql<number>`COALESCE(SUM(${searchOutcomes.successCount}), 0)`,
      timeoutCount: sql<number>`COALESCE(SUM(${searchOutcomes.timeoutCount}), 0)`,
      failureCount: sql<number>`COALESCE(SUM(${searchOutcomes.failureCount}), 0)`,
      fallbackSwitches: sql<number>`COALESCE(SUM(${searchOutcomes.delegatedPathCount} + ${searchOutcomes.bundledPathCount}), 0)`,
      avgBudgetExceededRate: sql<number>`COALESCE(AVG(CASE WHEN ${searchOutcomes.attempts} > 0 THEN ${searchOutcomes.budgetExceededCount}::float / ${searchOutcomes.attempts} ELSE 0 END), 0)`,
    })
    .from(searchOutcomes)
    .where(whereClause);

  const row = result[0] ?? {
    attempts: 0,
    successCount: 0,
    timeoutCount: 0,
    failureCount: 0,
    fallbackSwitches: 0,
    avgBudgetExceededRate: 0,
  };
  const attempts = Number(row.attempts ?? 0);
  const successCount = Number(row.successCount ?? 0);
  const timeoutCount = Number(row.timeoutCount ?? 0);
  const failureCount = Number(row.failureCount ?? 0);
  const fallbackSwitches = Number(row.fallbackSwitches ?? 0);
  const budgetExceededRate = Number(row.avgBudgetExceededRate ?? 0);

  return NextResponse.json({
    window: windowParam,
    intent,
    metrics: {
      attempts,
      successCount,
      timeoutCount,
      failureCount,
      successRate: attempts > 0 ? successCount / attempts : 0,
      timeoutRate: attempts > 0 ? timeoutCount / attempts : 0,
      failureRate: attempts > 0 ? failureCount / attempts : 0,
      fallbackSwitchRate: attempts > 0 ? fallbackSwitches / attempts : 0,
      budgetExceededRate,
    },
  });
}

