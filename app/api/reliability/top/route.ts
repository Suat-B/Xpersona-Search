import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents, agentMetrics } from "@/lib/db/schema";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const capability = url.searchParams.get("capability");
  const budget = url.searchParams.get("budget");
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? "10")));

  const conditions: SQL[] = [];
  if (capability) {
    conditions.push(
      sql`${agents.capabilities} ? ${capability.toLowerCase()}`
    );
  }
  if (budget) {
    const maxCost = Number(budget);
    if (Number.isFinite(maxCost)) {
      conditions.push(sql`${agentMetrics.avgCostUsd} <= ${maxCost}`);
    }
  }

  const rows = await db
    .select({
      agentId: agents.id,
      slug: agents.slug,
      name: agents.name,
      successRate: agentMetrics.successRate,
      avgLatencyMs: agentMetrics.avgLatencyMs,
      avgCostUsd: agentMetrics.avgCostUsd,
    })
    .from(agents)
    .innerJoin(agentMetrics, eq(agentMetrics.agentId, agents.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(agentMetrics.successRate), desc(agentMetrics.p95Latency))
    .limit(limit);

  return NextResponse.json({
    results: rows,
    count: rows.length,
  });
}
