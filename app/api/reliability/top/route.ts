import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents, agentMetrics } from "@/lib/db/schema";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { inferClusters, inferPriceTier, type PriceTier } from "@/lib/reliability/clusters";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const capability = url.searchParams.get("capability");
    const budget = url.searchParams.get("budget");
    const cluster = url.searchParams.get("cluster")?.toLowerCase() ?? null;
    const taskType = url.searchParams.get("taskType")?.toLowerCase() ?? null;
    const tier = url.searchParams.get("tier")?.toLowerCase() as PriceTier | null;
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
        capabilities: agents.capabilities,
        successRate: agentMetrics.successRate,
        avgLatencyMs: agentMetrics.avgLatencyMs,
        avgCostUsd: agentMetrics.avgCostUsd,
      })
      .from(agents)
      .innerJoin(agentMetrics, eq(agentMetrics.agentId, agents.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(agentMetrics.successRate), desc(agentMetrics.p95Latency))
      .limit(Math.max(limit * 5, 50));

    const filtered = rows.filter((row) => {
      const clusters = inferClusters(Array.isArray(row.capabilities) ? row.capabilities : []);
      const costTier = inferPriceTier(row.avgCostUsd as number | null);
      if (cluster && !clusters.includes(cluster as typeof clusters[number])) return false;
      if (taskType && !clusters.includes(taskType as typeof clusters[number])) return false;
      if (tier && costTier !== tier) return false;
      return true;
    });

    const ranked = [...filtered].sort((a, b) => (b.successRate as number) - (a.successRate as number));
    const withPercentile = ranked.map((row, idx) => {
      const percentile = ranked.length > 1 ? Math.round((idx / (ranked.length - 1)) * 100) : 100;
      return {
        agentId: row.agentId,
        slug: row.slug,
        name: row.name,
        successRate: row.successRate,
        avgLatencyMs: row.avgLatencyMs,
        avgCostUsd: row.avgCostUsd,
        percentileRank: percentile,
      };
    });

    return NextResponse.json({
      results: withPercentile.slice(0, limit),
      count: withPercentile.length,
    });
  } catch (error) {
    console.error("Error fetching top reliability agents:", error);
    return NextResponse.json(
      {
        results: [],
        count: 0,
      },
      {
        headers: { "X-Reliability-Top-Fallback": "1" },
      }
    );
  }
}
