import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents, agentMetrics, agentRuns } from "@/lib/db/schema";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { inferClusters, inferPriceTier, type PriceTier } from "@/lib/reliability/clusters";
import { applyRequestIdHeader } from "@/lib/api/errors";
import { recordApiResponse } from "@/lib/metrics/record";

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  try {
    const url = new URL(req.url);
    const capability = url.searchParams.get("capability");
    const budget = url.searchParams.get("budget");
    const cluster = url.searchParams.get("cluster")?.toLowerCase() ?? null;
    const taskType = url.searchParams.get("taskType")?.toLowerCase() ?? null;
    const tier = url.searchParams.get("tier")?.toLowerCase() as PriceTier | null;
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? "10")));

    const baseConditions: SQL[] = [];
    const maxCost = Number(budget);
    const budgetLimit = Number.isFinite(maxCost) ? maxCost : null;
    if (capability) {
      baseConditions.push(
        sql`${agents.capabilities} ? ${capability.toLowerCase()}`
      );
    }
    const metricConditions = [...baseConditions];
    if (budget) {
      if (Number.isFinite(maxCost)) {
        metricConditions.push(sql`${agentMetrics.avgCostUsd} <= ${maxCost}`);
      }
    }

    let rows = (await db
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
      .where(metricConditions.length > 0 ? and(...metricConditions) : undefined)
      .orderBy(desc(agentMetrics.successRate), desc(agentMetrics.p95Latency))
      .limit(Math.max(limit * 5, 50))) as Array<{
      agentId: string;
      slug: string;
      name: string;
      capabilities: unknown;
      successRate: number | null;
      avgLatencyMs: number | null;
      avgCostUsd: number | null;
    }>;

    if (rows.length === 0) {
      rows = (await db
        .select({
          agentId: agents.id,
          slug: agents.slug,
          name: agents.name,
          capabilities: agents.capabilities,
          successRate: sql<number>`AVG(CASE WHEN ${agentRuns.status} = 'SUCCESS' THEN 1 ELSE 0 END)`,
          avgLatencyMs: sql<number>`AVG(${agentRuns.latencyMs})`,
          avgCostUsd: sql<number>`AVG(${agentRuns.costUsd})`,
        })
        .from(agents)
        .innerJoin(agentRuns, eq(agentRuns.agentId, agents.id))
        .where(baseConditions.length > 0 ? and(...baseConditions) : undefined)
        .groupBy(agents.id, agents.slug, agents.name, agents.capabilities)
        .limit(Math.max(limit * 5, 50))) as Array<{
        agentId: string;
        slug: string;
        name: string;
        capabilities: unknown;
        successRate: number | null;
        avgLatencyMs: number | null;
        avgCostUsd: number | null;
      }>;
    }

    const filtered = rows.filter((row) => {
      const clusters = inferClusters(Array.isArray(row.capabilities) ? row.capabilities : []);
      const avgCost = Number(row.avgCostUsd ?? 0);
      const costTier = inferPriceTier(Number.isFinite(avgCost) ? avgCost : null);
      if (cluster && !clusters.includes(cluster as typeof clusters[number])) return false;
      if (taskType && !clusters.includes(taskType as typeof clusters[number])) return false;
      if (tier && costTier !== tier) return false;
      if (budgetLimit != null && Number(row.avgCostUsd ?? 0) > budgetLimit) return false;
      return true;
    });

    const ranked = [...filtered].sort(
      (a, b) => Number(b.successRate ?? 0) - Number(a.successRate ?? 0)
    );
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

    const response = NextResponse.json({
      results: withPercentile.slice(0, limit),
      count: withPercentile.length,
    });
    applyRequestIdHeader(response, req);
    recordApiResponse("/api/reliability/top", req, response, startedAt);
    return response;
  } catch (error) {
    console.error("Error fetching top reliability agents:", error);
    const response = NextResponse.json(
      {
        results: [],
        count: 0,
      },
      {
        headers: { "X-Reliability-Top-Fallback": "1" },
      }
    );
    applyRequestIdHeader(response, req);
    recordApiResponse("/api/reliability/top", req, response, startedAt);
    return response;
  }
}
