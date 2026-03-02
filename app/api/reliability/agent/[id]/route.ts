import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agentMetrics, agentRuns } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { computeCalibrationError, getFailurePatterns, getPercentileRank } from "@/lib/reliability/metrics";
import { computeHiringScore } from "@/lib/reliability/hiring";
import { resolveAgentByIdOrSlug } from "@/lib/reliability/lookup";
import { applyRequestIdHeader, jsonError } from "@/lib/api/errors";
import { recordApiResponse } from "@/lib/metrics/record";

type RunSnapshot = {
  status: string;
  confidence: number | null;
  latencyMs: number;
  costUsd: number;
  hallucinationScore: number | null;
  trace: Record<string, unknown> | null;
  startedAt: Date;
};

function percentile(values: number[], p: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[idx] ?? 0;
}

function deriveMetricsFromRuns(runs: RunSnapshot[]) {
  const total = runs.length;
  if (total === 0) return null;
  const successCount = runs.filter((r) => r.status === "SUCCESS").length;
  const successRate = total > 0 ? successCount / total : 0;
  const avgLatencyMs = runs.reduce((sum, r) => sum + Number(r.latencyMs ?? 0), 0) / total;
  const avgCostUsd = runs.reduce((sum, r) => sum + Number(r.costUsd ?? 0), 0) / total;
  const hallucinationCount = runs.filter((r) => Number(r.hallucinationScore ?? 0) > 0.7).length;
  const hallucinationRate = total > 0 ? hallucinationCount / total : 0;
  const retryCount = runs.filter((r) => Number(r.trace?.retryCount ?? 0) > 0).length;
  const disputeCount = runs.filter((r) => Boolean(r.trace?.dispute)).length;
  const latencies = runs.map((r) => Number(r.latencyMs ?? 0));
  const p50Latency = percentile(latencies, 0.5);
  const p95Latency = percentile(latencies, 0.95);
  const lastUpdated = runs[0]?.startedAt ?? null;
  return {
    successRate,
    avgLatencyMs,
    avgCostUsd,
    hallucinationRate,
    retryRate: total > 0 ? retryCount / total : 0,
    disputeRate: total > 0 ? disputeCount / total : 0,
    p50Latency,
    p95Latency,
    lastUpdated,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startedAt = Date.now();
  const { id } = await params;
  const agent = await resolveAgentByIdOrSlug(id);
  if (!agent) {
    const response = jsonError(req, {
      code: "NOT_FOUND",
      message: "Agent not found",
      status: 404,
    });
    recordApiResponse("/api/reliability/agent/:id", req, response, startedAt);
    return response;
  }

  let metrics: typeof agentMetrics.$inferSelect | undefined;
  let runs: RunSnapshot[] = [];
  let failures: Array<{ type: string; frequency: number; lastSeen: Date }> = [];
  let percentileRank: number | null = null;
  let calibrationError: number | null = null;
  let hiringScore: number | null = null;
  let successRateDelta = 0;
  let costDelta = 0;
  let metricsUnavailable = false;

  try {
    [metrics] = await db
      .select()
      .from(agentMetrics)
      .where(eq(agentMetrics.agentId, agent.id))
      .limit(1);

    const runRows = await db
      .select({
        status: agentRuns.status,
        confidence: agentRuns.confidence,
        latencyMs: agentRuns.latencyMs,
        costUsd: agentRuns.costUsd,
        hallucinationScore: agentRuns.hallucinationScore,
        trace: agentRuns.trace,
        startedAt: agentRuns.startedAt,
      })
      .from(agentRuns)
      .where(eq(agentRuns.agentId, agent.id))
      .orderBy(desc(agentRuns.startedAt))
      .limit(500);
    runs = runRows.map((row) => ({
      ...row,
      trace: (row.trace ?? null) as Record<string, unknown> | null,
    }));

    failures = await getFailurePatterns(agent.id);
    percentileRank = metrics ? await getPercentileRank(agent.id) : null;
    calibrationError = computeCalibrationError(runs);
    hiringScore = metrics ? await computeHiringScore(agent.id) : null;

    const trendResult = await db.execute(
      sql`
        SELECT
          SUM(CASE WHEN started_at >= now() - interval '30 days' THEN 1 ELSE 0 END)::int AS total_30,
          SUM(CASE WHEN started_at >= now() - interval '30 days' AND status = 'SUCCESS' THEN 1 ELSE 0 END)::int AS success_30,
          AVG(CASE WHEN started_at >= now() - interval '30 days' THEN cost_usd END) AS cost_30,
          SUM(CASE WHEN started_at >= now() - interval '60 days' AND started_at < now() - interval '30 days' THEN 1 ELSE 0 END)::int AS total_prev,
          SUM(CASE WHEN started_at >= now() - interval '60 days' AND started_at < now() - interval '30 days' AND status = 'SUCCESS' THEN 1 ELSE 0 END)::int AS success_prev,
          AVG(CASE WHEN started_at >= now() - interval '60 days' AND started_at < now() - interval '30 days' THEN cost_usd END) AS cost_prev
        FROM agent_runs
        WHERE agent_id = ${agent.id}::uuid
      `
    );
    const trendRow = (trendResult as unknown as { rows?: Array<Record<string, unknown>> }).rows?.[0] ?? {};
    const total30 = Number(trendRow.total_30 ?? 0);
    const success30 = Number(trendRow.success_30 ?? 0);
    const cost30 = Number(trendRow.cost_30 ?? 0);
    const totalPrev = Number(trendRow.total_prev ?? 0);
    const successPrev = Number(trendRow.success_prev ?? 0);
    const costPrev = Number(trendRow.cost_prev ?? 0);
    const successRate30 = total30 > 0 ? success30 / total30 : 0;
    const successRatePrev = totalPrev > 0 ? successPrev / totalPrev : 0;
    successRateDelta = Number((successRate30 - successRatePrev).toFixed(4));
    costDelta = Number((cost30 - costPrev).toFixed(4));
  } catch {
    metricsUnavailable = true;
  }

  const derivedMetrics = metrics ? null : deriveMetricsFromRuns(runs);
  const hasTelemetry = Boolean(metrics) || runs.length > 0 || failures.length > 0;
  if (!hasTelemetry) metricsUnavailable = true;
  const successRate = hasTelemetry ? metrics?.successRate ?? derivedMetrics?.successRate ?? null : null;
  const avgLatencyMs = hasTelemetry ? metrics?.avgLatencyMs ?? derivedMetrics?.avgLatencyMs ?? null : null;
  const avgCostUsd = hasTelemetry ? metrics?.avgCostUsd ?? derivedMetrics?.avgCostUsd ?? null : null;
  const hallucinationRate = hasTelemetry
    ? metrics?.hallucinationRate ?? derivedMetrics?.hallucinationRate ?? null
    : null;
  const retryRate = hasTelemetry ? metrics?.retryRate ?? derivedMetrics?.retryRate ?? null : null;
  const disputeRate = hasTelemetry ? metrics?.disputeRate ?? derivedMetrics?.disputeRate ?? null : null;
  const p50Latency = hasTelemetry ? metrics?.p50Latency ?? derivedMetrics?.p50Latency ?? null : null;
  const p95Latency = hasTelemetry ? metrics?.p95Latency ?? derivedMetrics?.p95Latency ?? null : null;
  const lastUpdated = hasTelemetry ? metrics?.lastUpdated ?? derivedMetrics?.lastUpdated ?? null : null;

  const response = NextResponse.json({
    agentId: agent.id,
    agentSlug: agent.slug,
    success_rate: successRate,
    avg_latency_ms: avgLatencyMs,
    avg_cost_usd: avgCostUsd,
    hallucination_rate: hallucinationRate,
    retry_rate: retryRate,
    dispute_rate: disputeRate,
    p50_latency: p50Latency,
    p95_latency: p95Latency,
    top_failure_modes: failures.slice(0, 5).map((f) => ({
      type: f.type,
      frequency: f.frequency,
      last_seen: f.lastSeen,
    })),
    confidence_calibration_error: calibrationError,
    percentile_rank: percentileRank,
    hiring_score: hiringScore,
    last_30_day_trend: {
      success_rate_delta: successRateDelta,
      cost_delta: costDelta,
    },
    last_updated: lastUpdated,
    has_telemetry: hasTelemetry,
    run_count: runs.length,
    metrics_unavailable: metricsUnavailable,
  });
  applyRequestIdHeader(response, req);
  recordApiResponse("/api/reliability/agent/:id", req, response, startedAt);
  return response;
}
