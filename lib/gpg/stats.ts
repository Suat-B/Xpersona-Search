import { db } from "@/lib/db";
import {
  agentRuns,
  gpgAgentClusterStats,
  gpgPipelineRuns,
  gpgPipelineStats,
  gpgAgentCollaborationEdges,
  gpgClusterTransitionEdges,
} from "@/lib/db/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { bayesianSuccess, computeRiskScore } from "./risk";
import type { GpgRunStatus } from "./types";

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[idx] ?? 0;
}

function windowStart(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function recomputeAgentClusterStats(clusterId: string, agentId: string) {
  const since30 = windowStart(30);
  const since90 = windowStart(90);

  const rows = await db
    .select({
      status: agentRuns.status,
      latencyMs: agentRuns.latencyMs,
      costUsd: agentRuns.costUsd,
      confidence: agentRuns.confidence,
      failureType: agentRuns.failureType,
      trace: agentRuns.trace,
      createdAt: agentRuns.createdAt,
      isVerified: agentRuns.isVerified,
    })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.clusterId, clusterId),
        eq(agentRuns.agentId, agentId),
        gte(agentRuns.createdAt, since90),
        eq(agentRuns.isVerified, true),
        sql`NOT EXISTS (
          SELECT 1 FROM gpg_integrity_flags flags
          WHERE flags.run_id = ${agentRuns.id} AND flags.is_resolved = false
        )`
      )
    )
    .orderBy(desc(agentRuns.createdAt));

  const rows30 = rows.filter((r) => r.createdAt >= since30);
  const total30 = rows30.length;
  const success30 = rows30.filter((r) => r.status === "SUCCESS").length;
  const failure30 = rows30.filter((r) => r.status !== "SUCCESS").length;
  const verified30 = rows30.filter((r) => r.isVerified).length;

  const avgCost30 = total30 > 0
    ? rows30.reduce((sum, r) => sum + Number(r.costUsd ?? 0), 0) / total30
    : 0;
  const latencies = rows30.map((r) => Number(r.latencyMs ?? 0));
  const p50Latency = percentile(latencies, 0.5);
  const p95Latency = percentile(latencies, 0.95);

  const disputeCount = rows30.filter((r) => Boolean((r.trace as Record<string, unknown> | null)?.dispute)).length;
  const disputeRate90 = rows.filter((r) => Boolean((r.trace as Record<string, unknown> | null)?.dispute)).length / Math.max(1, rows.length);

  const confidenceRows = rows30.filter((r) => typeof r.confidence === "number");
  let calibError = 0;
  if (confidenceRows.length > 0) {
    const mse = confidenceRows.reduce((sum, r) => {
      const actual = r.status === "SUCCESS" ? 1 : 0;
      const diff = (r.confidence ?? 0) - actual;
      return sum + diff * diff;
    }, 0) / confidenceRows.length;
    calibError = Number(mse.toFixed(4));
  }

  const bayesSuccess = bayesianSuccess(success30, total30);
  const riskScore = computeRiskScore({
    disputeRate: disputeRate90,
    hallucinationRate: 0,
    policyBlockRate: 0,
    variance: total30 > 0 ? Math.min(1, failure30 / total30) : 1,
  });

  await db
    .insert(gpgAgentClusterStats)
    .values({
      agentId,
      clusterId,
      successRate30d: total30 > 0 ? success30 / total30 : 0,
      failureRate30d: total30 > 0 ? failure30 / total30 : 0,
      disputeRate90d: Number(disputeRate90.toFixed(4)),
      avgQuality30d: 0,
      calibError30d: calibError,
      p50LatencyMs30d: p50Latency,
      p95LatencyMs30d: p95Latency,
      avgCost30d: avgCost30,
      runCount30d: total30,
      verifiedRunCount30d: verified30,
      bayesSuccess30d: bayesSuccess,
      riskScore30d: riskScore,
      lastWindowStart: since30,
      lastWindowEnd: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [gpgAgentClusterStats.agentId, gpgAgentClusterStats.clusterId],
      set: {
        successRate30d: total30 > 0 ? success30 / total30 : 0,
        failureRate30d: total30 > 0 ? failure30 / total30 : 0,
        disputeRate90d: Number(disputeRate90.toFixed(4)),
        avgQuality30d: 0,
        calibError30d: calibError,
        p50LatencyMs30d: p50Latency,
        p95LatencyMs30d: p95Latency,
        avgCost30d: avgCost30,
        runCount30d: total30,
        verifiedRunCount30d: verified30,
        bayesSuccess30d: bayesSuccess,
        riskScore30d: riskScore,
        lastWindowStart: since30,
        lastWindowEnd: new Date(),
        updatedAt: new Date(),
      },
    });

  if (disputeCount > 0) {
    void disputeCount;
  }
}

export async function recomputePipelineStats(clusterId: string, pathHash: string) {
  const since30 = windowStart(30);
  const rows = await db
    .select({
      status: gpgPipelineRuns.status,
      latencyMs: gpgPipelineRuns.latencyMs,
      costUsd: gpgPipelineRuns.costUsd,
      qualityScore: gpgPipelineRuns.qualityScore,
      createdAt: gpgPipelineRuns.createdAt,
      agentPath: gpgPipelineRuns.agentPath,
    })
    .from(gpgPipelineRuns)
    .where(
      and(
        eq(gpgPipelineRuns.clusterId, clusterId),
        eq(gpgPipelineRuns.pathHash, pathHash),
        gte(gpgPipelineRuns.createdAt, since30),
        eq(gpgPipelineRuns.isVerified, true),
        sql`NOT EXISTS (
          SELECT 1 FROM gpg_integrity_flags flags
          WHERE flags.pipeline_run_id = ${gpgPipelineRuns.id} AND flags.is_resolved = false
        )`
      )
    )
    .orderBy(desc(gpgPipelineRuns.createdAt));

  const total = rows.length;
  const success = rows.filter((r) => r.status === "SUCCESS").length;
  const avgCost = total > 0 ? rows.reduce((sum, r) => sum + Number(r.costUsd ?? 0), 0) / total : 0;
  const latencies = rows.map((r) => Number(r.latencyMs ?? 0));
  const p50Latency = percentile(latencies, 0.5);
  const p95Latency = percentile(latencies, 0.95);
  const avgQuality = total > 0
    ? rows.reduce((sum, r) => sum + Number(r.qualityScore ?? 0), 0) / total
    : 0;

  const bayesSuccess = bayesianSuccess(success, total);
  const riskScore = computeRiskScore({
    disputeRate: 0,
    hallucinationRate: 0,
    policyBlockRate: 0,
    variance: total > 0 ? (total - success) / total : 1,
  });

  await db
    .insert(gpgPipelineStats)
    .values({
      clusterId,
      pathHash,
      agentPath: rows[0]?.agentPath ?? [],
      successRate30d: total > 0 ? success / total : 0,
      bayesSuccess30d: bayesSuccess,
      p50LatencyMs30d: p50Latency,
      p95LatencyMs30d: p95Latency,
      avgCost30d: avgCost,
      avgQuality30d: avgQuality,
      runCount30d: total,
      riskScore30d: riskScore,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [gpgPipelineStats.clusterId, gpgPipelineStats.pathHash],
      set: {
        agentPath: rows[0]?.agentPath ?? [],
        successRate30d: total > 0 ? success / total : 0,
        bayesSuccess30d: bayesSuccess,
        p50LatencyMs30d: p50Latency,
        p95LatencyMs30d: p95Latency,
        avgCost30d: avgCost,
        avgQuality30d: avgQuality,
        runCount30d: total,
        riskScore30d: riskScore,
        updatedAt: new Date(),
      },
    });
}

export async function recomputeGraphEdges(clusterId: string) {
  const rows = await db.execute(sql`
    SELECT pipeline_run_id, array_agg(agent_id::text ORDER BY pipeline_step) AS agent_path
    FROM agent_runs
    WHERE cluster_id = ${clusterId}::uuid
      AND pipeline_run_id IS NOT NULL
      AND is_verified = true
      AND NOT EXISTS (
        SELECT 1 FROM gpg_integrity_flags flags
        WHERE flags.run_id = agent_runs.id AND flags.is_resolved = false
      )
    GROUP BY pipeline_run_id
  `);
  const runs = (rows as unknown as { rows?: Array<{ agent_path: string[] }> }).rows ?? [];

  const edgeCounts = new Map<string, number>();
  const transitionCounts = new Map<string, number>();

  for (const run of runs) {
    const path = run.agent_path ?? [];
    for (let i = 0; i < path.length - 1; i += 1) {
      const key = `${path[i]}::${path[i + 1]}`;
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    }
  }

  for (const [key, count] of edgeCounts.entries()) {
    const [fromAgentId, toAgentId] = key.split("::");
    await db
      .insert(gpgAgentCollaborationEdges)
      .values({
        fromAgentId,
        toAgentId,
        clusterId,
        weight30d: count,
        successWeight30d: count,
        failureWeight30d: 0,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [gpgAgentCollaborationEdges.fromAgentId, gpgAgentCollaborationEdges.toAgentId, gpgAgentCollaborationEdges.clusterId],
        set: {
          weight30d: count,
          successWeight30d: count,
          updatedAt: new Date(),
          lastSeenAt: new Date(),
        },
      });
  }

  if (transitionCounts.size > 0) {
    void transitionCounts;
  }
}

export async function recomputeAllClusterStats() {
  const clusterRows = await db.execute(
    sql`SELECT DISTINCT cluster_id FROM agent_runs WHERE cluster_id IS NOT NULL AND is_verified = true`
  );
  const clusters = (clusterRows as unknown as { rows?: Array<{ cluster_id: string }> }).rows ?? [];
  for (const row of clusters) {
    const agentRows = await db.execute(
      sql`SELECT DISTINCT agent_id FROM agent_runs WHERE cluster_id = ${row.cluster_id}::uuid AND is_verified = true`
    );
    const agentIds = (agentRows as unknown as { rows?: Array<{ agent_id: string }> }).rows ?? [];
    for (const agent of agentIds) {
      await recomputeAgentClusterStats(row.cluster_id, agent.agent_id);
    }
    await recomputeGraphEdges(row.cluster_id);
  }

  const pipelineRows = await db.execute(
    sql`SELECT DISTINCT cluster_id, path_hash FROM gpg_pipeline_runs WHERE is_verified = true`
  );
  const pipelines = (pipelineRows as unknown as { rows?: Array<{ cluster_id: string; path_hash: string }> }).rows ?? [];
  for (const p of pipelines) {
    await recomputePipelineStats(p.cluster_id, p.path_hash);
  }

  return { clustersProcessed: clusters.length };
}

export function normalizeRunStatus(status: string | null | undefined): GpgRunStatus {
  if (status === "SUCCESS" || status === "FAILURE" || status === "TIMEOUT" || status === "PARTIAL") return status;
  return "FAILURE";
}
