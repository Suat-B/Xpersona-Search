import { db } from "@/lib/db";
import { agents, gpgAgentClusterStats, gpgPipelineStats, gpgTaskClusters } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import type { GpgPlanResponse, GpgRecommendResponse, PlannerConstraints, PlannerPreferences } from "./types";
import { computeAgentGpgScore, buildRiskReasons } from "./risk";
import { computePipelinePlan, scorePipelinePlan } from "./planner";

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

export async function recommendAgents(params: {
  clusterId: string | null;
  constraints?: PlannerConstraints;
  limit?: number;
}): Promise<GpgRecommendResponse> {
  if (!params.clusterId) {
    return {
      clusterId: null,
      clusterName: null,
      taskType: "general",
      topAgents: [],
      alternatives: [],
    };
  }

  const cluster = await db
    .select({ id: gpgTaskClusters.id, name: gpgTaskClusters.name, taskType: gpgTaskClusters.taskType })
    .from(gpgTaskClusters)
    .where(eq(gpgTaskClusters.id, params.clusterId))
    .limit(1);

  const rows = await db
    .select({
      agentId: gpgAgentClusterStats.agentId,
      successRate: gpgAgentClusterStats.successRate30d,
      bayesSuccess: gpgAgentClusterStats.bayesSuccess30d,
      avgCost: gpgAgentClusterStats.avgCost30d,
      p95Latency: gpgAgentClusterStats.p95LatencyMs30d,
      risk: gpgAgentClusterStats.riskScore30d,
      runCount: gpgAgentClusterStats.runCount30d,
    })
    .from(gpgAgentClusterStats)
    .where(eq(gpgAgentClusterStats.clusterId, params.clusterId))
    .orderBy(sql`${gpgAgentClusterStats.bayesSuccess30d} DESC`)
    .limit(params.limit ?? 20);

  const agentIds = rows.map((r) => r.agentId);
  const agentRows = agentIds.length
    ? await db
        .select({ id: agents.id, name: agents.name, slug: agents.slug })
        .from(agents)
        .where(sql`${agents.id} = ANY(${sql.raw(`ARRAY[${agentIds.map((id) => `'${id}'::uuid`).join(",")}]`)})`)
    : [];

  const agentMeta = new Map(agentRows.map((r) => [String(r.id), r]));

  const items = rows.map((r) => {
    const meta = agentMeta.get(String(r.agentId));
    const pSuccess = clamp01(Number(r.bayesSuccess ?? r.successRate ?? 0));
    const expectedCost = Number(r.avgCost ?? 0);
    const p95Latency = Number(r.p95Latency ?? 0);
    const risk = clamp01(Number(r.risk ?? 1));
    const gpgScore = computeAgentGpgScore({
      pSuccess,
      risk,
      expectedCost,
      p95LatencyMs: p95Latency,
      constraints: params.constraints,
    });
    return {
      agentId: String(r.agentId),
      slug: meta?.slug,
      name: meta?.name,
      p_success: Number(pSuccess.toFixed(4)),
      expected_cost: Number(expectedCost.toFixed(4)),
      p95_latency_ms: Number(p95Latency.toFixed(2)),
      expected_quality: 0,
      risk: Number(risk.toFixed(4)),
      gpg_score: gpgScore,
      why: buildRiskReasons({
        riskScore30d: risk,
        runCount30d: Number(r.runCount ?? 0),
      } as any),
    };
  });

  return {
    clusterId: cluster[0]?.id ?? params.clusterId,
    clusterName: cluster[0]?.name ?? null,
    taskType: cluster[0]?.taskType ?? "general",
    topAgents: items.slice(0, 5),
    alternatives: items.slice(5, 15),
  };
}

export async function planPipeline(params: {
  clusterId: string | null;
  constraints?: PlannerConstraints;
  preferences?: PlannerPreferences;
}): Promise<GpgPlanResponse> {
  if (!params.clusterId) {
    return { clusterId: null, clusterName: null, taskType: "general", plan: null, alternatives: [] };
  }

  const cluster = await db
    .select({ id: gpgTaskClusters.id, name: gpgTaskClusters.name, taskType: gpgTaskClusters.taskType })
    .from(gpgTaskClusters)
    .where(eq(gpgTaskClusters.id, params.clusterId))
    .limit(1);

  const rows = await db
    .select({
      pathHash: gpgPipelineStats.pathHash,
      agentPath: gpgPipelineStats.agentPath,
      successRate: gpgPipelineStats.successRate30d,
      bayesSuccess: gpgPipelineStats.bayesSuccess30d,
      avgCost: gpgPipelineStats.avgCost30d,
      p95Latency: gpgPipelineStats.p95LatencyMs30d,
      avgQuality: gpgPipelineStats.avgQuality30d,
      risk: gpgPipelineStats.riskScore30d,
    })
    .from(gpgPipelineStats)
    .where(eq(gpgPipelineStats.clusterId, params.clusterId))
    .orderBy(sql`${gpgPipelineStats.bayesSuccess30d} DESC`)
    .limit(25);

  const plans = rows.map((r) => {
    const plan = computePipelinePlan({
      agentPath: (r.agentPath as string[]) ?? [],
      agentSuccess: [(r.bayesSuccess ?? r.successRate ?? 0)],
      agentCosts: [Number(r.avgCost ?? 0)],
      agentLatencies: [Number(r.p95Latency ?? 0)],
      agentQualities: [Number(r.avgQuality ?? 0)],
    });
    return { plan, score: scorePipelinePlan(plan) };
  });

  const sorted = plans.sort((a, b) => b.score - a.score).map((p) => p.plan);

  return {
    clusterId: cluster[0]?.id ?? params.clusterId,
    clusterName: cluster[0]?.name ?? null,
    taskType: cluster[0]?.taskType ?? "general",
    plan: sorted[0] ?? null,
    alternatives: sorted.slice(1, 5),
  };
}
