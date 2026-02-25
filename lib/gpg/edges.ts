import { db } from "@/lib/db";
import { gpgIntegrityFlags, gpgPipelineRuns } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export async function flagIntegrityIssue(params: {
  agentId?: string | null;
  runId?: string | null;
  pipelineRunId?: string | null;
  clusterId?: string | null;
  flagType: string;
  reason?: string | null;
  severity?: number;
  score?: number | null;
  evidence?: Record<string, unknown> | null;
}) {
  await db.insert(gpgIntegrityFlags).values({
    agentId: params.agentId ?? null,
    runId: params.runId ?? null,
    pipelineRunId: params.pipelineRunId ?? null,
    clusterId: params.clusterId ?? null,
    flagType: params.flagType,
    reason: params.reason ?? null,
    severity: params.severity ?? 1,
    score: params.score ?? null,
    evidence: params.evidence ?? null,
    createdAt: new Date(),
  });
}

export async function findSuspiciousPipelines() {
  const rows = await db.execute(sql`
    SELECT id, cluster_id, agent_path, cost_usd, latency_ms
    FROM gpg_pipeline_runs
    WHERE is_verified = true
      AND created_at > now() - interval '7 days'
      AND cost_usd = 0
      AND latency_ms = 0
    LIMIT 200
  `);
  return (rows as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? [];
}

export async function flagSuspiciousPipelines() {
  const pipelines = await findSuspiciousPipelines();
  for (const row of pipelines) {
    await flagIntegrityIssue({
      pipelineRunId: row.id as string,
      clusterId: (row.cluster_id as string | null) ?? null,
      flagType: "ZERO_SIGNAL",
      reason: "Pipeline run with zero cost and latency detected",
      severity: 2,
      evidence: {
        cost_usd: row.cost_usd,
        latency_ms: row.latency_ms,
        agent_path: row.agent_path,
      },
    });

    await db
      .update(gpgPipelineRuns)
      .set({ isVerified: false })
      .where(eq(gpgPipelineRuns.id, row.id as string));
  }

  return { flagged: pipelines.length };
}
