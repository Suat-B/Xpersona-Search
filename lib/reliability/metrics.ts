import { db } from "@/lib/db";
import { agentRuns, agentMetrics, failurePatterns } from "@/lib/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { classifyFailure } from "./classifier";
import type { FailureType } from "./types";

type RunRow = {
  id: string;
  status: string;
  latencyMs: number;
  costUsd: number;
  confidence: number | null;
  hallucinationScore: number | null;
  failureType: string | null;
  failureDetails: Record<string, unknown> | null;
  trace: Record<string, unknown> | null;
  startedAt: Date;
};

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[idx] ?? 0;
}

export function computeCalibrationError(runs: Array<{ confidence: number | null; status: string }>): number | null {
  const rows = runs.filter((r) => typeof r.confidence === "number");
  if (rows.length === 0) return null;
  const mse =
    rows.reduce((sum, r) => {
      const actual = r.status === "SUCCESS" ? 1 : 0;
      const diff = (r.confidence ?? 0) - actual;
      return sum + diff * diff;
    }, 0) / rows.length;
  return Number(mse.toFixed(4));
}

export async function recomputeAgentMetrics(agentId: string) {
  const rows = (await db
    .select({
      id: agentRuns.id,
      status: agentRuns.status,
      latencyMs: agentRuns.latencyMs,
      costUsd: agentRuns.costUsd,
      confidence: agentRuns.confidence,
      hallucinationScore: agentRuns.hallucinationScore,
      failureType: agentRuns.failureType,
      failureDetails: agentRuns.failureDetails,
      trace: agentRuns.trace,
      startedAt: agentRuns.startedAt,
    })
    .from(agentRuns)
    .where(eq(agentRuns.agentId, agentId))
    .orderBy(desc(agentRuns.startedAt))) as RunRow[];

  if (rows.length === 0) {
    await db
      .insert(agentMetrics)
      .values({
        agentId,
        successRate: 0,
        avgLatencyMs: 0,
        avgCostUsd: 0,
        hallucinationRate: 0,
        retryRate: 0,
        disputeRate: 0,
        p50Latency: 0,
        p95Latency: 0,
        lastUpdated: new Date(),
      })
      .onConflictDoUpdate({
        target: agentMetrics.agentId,
        set: { lastUpdated: new Date() },
      });
    return;
  }

  const total = rows.length;
  const successCount = rows.filter((r) => r.status === "SUCCESS").length;
  const successRate = total > 0 ? successCount / total : 0;
  const avgLatencyMs = rows.reduce((sum, r) => sum + Number(r.latencyMs ?? 0), 0) / total;
  const avgCostUsd = rows.reduce((sum, r) => sum + Number(r.costUsd ?? 0), 0) / total;
  const hallucinationCount = rows.filter((r) => (r.hallucinationScore ?? 0) > 0.7).length;
  const hallucinationRate = total > 0 ? hallucinationCount / total : 0;
  const retryCount = rows.filter((r) => Number(r.trace?.retryCount ?? 0) > 0).length;
  const disputeCount = rows.filter((r) => Boolean(r.trace?.dispute)).length;
  const p50Latency = percentile(rows.map((r) => Number(r.latencyMs ?? 0)), 0.5);
  const p95Latency = percentile(rows.map((r) => Number(r.latencyMs ?? 0)), 0.95);

  await db
    .insert(agentMetrics)
    .values({
      agentId,
      successRate,
      avgLatencyMs,
      avgCostUsd,
      hallucinationRate,
      retryRate: total > 0 ? retryCount / total : 0,
      disputeRate: total > 0 ? disputeCount / total : 0,
      p50Latency,
      p95Latency,
      lastUpdated: new Date(),
    })
    .onConflictDoUpdate({
      target: agentMetrics.agentId,
      set: {
        successRate,
        avgLatencyMs,
        avgCostUsd,
        hallucinationRate,
        retryRate: total > 0 ? retryCount / total : 0,
        disputeRate: total > 0 ? disputeCount / total : 0,
        p50Latency,
        p95Latency,
        lastUpdated: new Date(),
      },
    });

  const failureMap = new Map<FailureType, { count: number; lastSeen: Date }>();
  for (const run of rows) {
    if (run.status === "SUCCESS") continue;
    const failureType =
      (run.failureType as FailureType | null) ??
      classifyFailure({
        latencyMs: run.latencyMs,
        trace: run.trace,
        hallucinationScore: run.hallucinationScore,
        status: run.status,
      });
    const existing = failureMap.get(failureType);
    if (existing) {
      existing.count += 1;
      if (run.startedAt > existing.lastSeen) existing.lastSeen = run.startedAt;
    } else {
      failureMap.set(failureType, { count: 1, lastSeen: run.startedAt });
    }
  }

  for (const [type, data] of failureMap.entries()) {
    await db
      .insert(failurePatterns)
      .values({
        agentId,
        type,
        frequency: data.count,
        lastSeen: data.lastSeen,
      })
      .onConflictDoUpdate({
        target: [failurePatterns.agentId, failurePatterns.type],
        set: {
          frequency: data.count,
          lastSeen: data.lastSeen,
        },
      });
  }
}

export async function recomputeAllMetrics() {
  const ids = (await db.execute(
    sql`SELECT DISTINCT agent_id FROM agent_runs`
  )) as unknown as { rows?: Array<{ agent_id: string }> };
  const agentIds = ids.rows?.map((r) => r.agent_id) ?? [];
  for (const agentId of agentIds) {
    await recomputeAgentMetrics(agentId);
  }
  return { agentsProcessed: agentIds.length };
}

export async function getFailurePatterns(agentId: string) {
  return db
    .select({
      type: failurePatterns.type,
      frequency: failurePatterns.frequency,
      lastSeen: failurePatterns.lastSeen,
    })
    .from(failurePatterns)
    .where(eq(failurePatterns.agentId, agentId))
    .orderBy(desc(failurePatterns.frequency));
}

export async function getPercentileRank(agentId: string) {
  const result = await db.execute(
    sql`
      WITH ranked AS (
        SELECT agent_id, success_rate, PERCENT_RANK() OVER (ORDER BY success_rate) AS pr
        FROM agent_metrics
      )
      SELECT pr FROM ranked WHERE agent_id = ${agentId}::uuid
    `
  );
  const row = (result as unknown as { rows?: Array<{ pr: number }> }).rows?.[0];
  return row?.pr == null ? null : Math.round(row.pr * 100);
}

export async function getLatestModelUsed(agentId: string) {
  const rows = await db
    .select({ modelUsed: agentRuns.modelUsed })
    .from(agentRuns)
    .where(eq(agentRuns.agentId, agentId))
    .orderBy(desc(agentRuns.startedAt))
    .limit(1);
  return rows[0]?.modelUsed ?? null;
}
