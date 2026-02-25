import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents, agentMetrics } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { CLUSTERS, inferClusters, inferPriceTier, type PriceTier } from "@/lib/reliability/clusters";

type AgentRow = {
  id: string;
  slug: string;
  name: string;
  capabilities: unknown;
  successRate: number;
  avgLatencyMs: number;
  avgCostUsd: number;
};

function percentile(values: number[], p: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[idx] ?? 0;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(2000, Math.max(100, Number(url.searchParams.get("limit") ?? "800")));

    const rows = (await db
      .select({
        id: agents.id,
        slug: agents.slug,
        name: agents.name,
        capabilities: agents.capabilities,
        successRate: agentMetrics.successRate,
        avgLatencyMs: agentMetrics.avgLatencyMs,
        avgCostUsd: agentMetrics.avgCostUsd,
      })
      .from(agents)
      .innerJoin(agentMetrics, eq(agentMetrics.agentId, agents.id))
      .limit(limit)) as AgentRow[];

    const buckets = new Map<string, { count: number; success: number[]; cost: number[]; latency: number[] }>();

    for (const row of rows) {
      const caps = Array.isArray(row.capabilities) ? (row.capabilities as string[]) : [];
      const clusters = inferClusters(caps);
      const tier = inferPriceTier(row.avgCostUsd);
      for (const cluster of clusters) {
        const key = `${cluster}:${tier}`;
        if (!buckets.has(key)) {
          buckets.set(key, { count: 0, success: [], cost: [], latency: [] });
        }
        const bucket = buckets.get(key);
        if (!bucket) continue;
        bucket.count += 1;
        bucket.success.push(Number(row.successRate ?? 0));
        bucket.cost.push(Number(row.avgCostUsd ?? 0));
        bucket.latency.push(Number(row.avgLatencyMs ?? 0));
      }
    }

    const tiers: PriceTier[] = ["budget", "standard", "premium"];
    const clusters = CLUSTERS.map((cluster) => {
      const tierStats = tiers.map((tier) => {
        const key = `${cluster.id}:${tier}`;
        const bucket = buckets.get(key);
        return {
          tier,
          count: bucket?.count ?? 0,
          success_p50: percentile(bucket?.success ?? [], 0.5),
          success_p90: percentile(bucket?.success ?? [], 0.9),
          cost_p50: percentile(bucket?.cost ?? [], 0.5),
          cost_p90: percentile(bucket?.cost ?? [], 0.9),
          latency_p50: percentile(bucket?.latency ?? [], 0.5),
          latency_p90: percentile(bucket?.latency ?? [], 0.9),
        };
      });
      return {
        id: cluster.id,
        label: cluster.label,
        tiers: tierStats,
      };
    });

    return NextResponse.json({
      clusters,
      sample_size: rows.length,
    });
  } catch (error) {
    console.error("Error building reliability graph:", error);
    const tiers: PriceTier[] = ["budget", "standard", "premium"];
    const clusters = CLUSTERS.map((cluster) => ({
      id: cluster.id,
      label: cluster.label,
      tiers: tiers.map((tier) => ({
        tier,
        count: 0,
        success_p50: 0,
        success_p90: 0,
        cost_p50: 0,
        cost_p90: 0,
        latency_p50: 0,
        latency_p90: 0,
      })),
    }));

    return NextResponse.json(
      {
        clusters,
        sample_size: 0,
      },
      {
        headers: { "X-Reliability-Graph-Fallback": "1" },
      }
    );
  }
}
