import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  agentBenchmarkResults,
  agentCapabilityHandshakes,
  agentExecutionMetrics,
  agentMetrics,
  agentRuns,
  searchOutcomes,
} from "@/lib/db/schema";
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
  let benchmarkCount = 0;
  let benchmarkScore: number | null = null;
  let benchmarkLastAt: Date | null = null;
  let handshakeStatus: string | null = null;
  let handshakeLatencyMs: number | null = null;
  let handshakeErrorRate: number | null = null;
  let outcomesAttempts = 0;
  let outcomesSuccessRate: number | null = null;
  let outcomesLastAt: Date | null = null;
  let executionUptime30d: number | null = null;
  let executionLatencyP95: number | null = null;
  let executionCostUsd: number | null = null;
  let executionVerifiedAt: Date | null = null;

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

    const benchmarkAgg = await db.execute(
      sql`
        SELECT
          COUNT(*)::int AS count,
          AVG(score) AS avg_score,
          MAX(created_at) AS last_at
        FROM agent_benchmark_results
        WHERE agent_id = ${agent.id}::uuid
      `
    );
    const benchmarkRow = (benchmarkAgg as unknown as { rows?: Array<Record<string, unknown>> }).rows?.[0] ?? {};
    benchmarkCount = Number(benchmarkRow.count ?? 0);
    benchmarkScore = benchmarkRow.avg_score == null ? null : Number(benchmarkRow.avg_score);
    benchmarkLastAt = benchmarkRow.last_at ? new Date(String(benchmarkRow.last_at)) : null;

    const [handshake] = await db
      .select({
        status: agentCapabilityHandshakes.status,
        verifiedAt: agentCapabilityHandshakes.verifiedAt,
        latencyProbeMs: agentCapabilityHandshakes.latencyProbeMs,
        errorRateProbe: agentCapabilityHandshakes.errorRateProbe,
      })
      .from(agentCapabilityHandshakes)
      .where(eq(agentCapabilityHandshakes.agentId, agent.id))
      .orderBy(desc(agentCapabilityHandshakes.verifiedAt))
      .limit(1);
    handshakeStatus = handshake?.status ?? null;
    handshakeLatencyMs = handshake?.latencyProbeMs ?? null;
    handshakeErrorRate = handshake?.errorRateProbe ?? null;

    const [executionMetrics] = await db
      .select({
        uptime30d: agentExecutionMetrics.uptime30d,
        observedLatencyMsP95: agentExecutionMetrics.observedLatencyMsP95,
        estimatedCostUsd: agentExecutionMetrics.estimatedCostUsd,
        lastVerifiedAt: agentExecutionMetrics.lastVerifiedAt,
      })
      .from(agentExecutionMetrics)
      .where(eq(agentExecutionMetrics.agentId, agent.id))
      .limit(1);
    executionUptime30d = executionMetrics?.uptime30d ?? null;
    executionLatencyP95 = executionMetrics?.observedLatencyMsP95 ?? null;
    executionCostUsd = executionMetrics?.estimatedCostUsd ?? null;
    executionVerifiedAt = executionMetrics?.lastVerifiedAt ?? null;

    const outcomesAgg = await db.execute(
      sql`
        SELECT
          SUM(attempts)::int AS attempts,
          SUM(success_count)::int AS success_count,
          MAX(last_outcome_at) AS last_outcome_at
        FROM search_outcomes
        WHERE agent_id = ${agent.id}::uuid
      `
    );
    const outcomesRow = (outcomesAgg as unknown as { rows?: Array<Record<string, unknown>> }).rows?.[0] ?? {};
    outcomesAttempts = Number(outcomesRow.attempts ?? 0);
    const outcomesSuccess = Number(outcomesRow.success_count ?? 0);
    outcomesSuccessRate = outcomesAttempts > 0 ? outcomesSuccess / outcomesAttempts : null;
    outcomesLastAt = outcomesRow.last_outcome_at ? new Date(String(outcomesRow.last_outcome_at)) : null;

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
  const coverageSignals = [
    benchmarkCount > 0,
    handshakeStatus && handshakeStatus !== "UNKNOWN",
    executionUptime30d != null,
    outcomesAttempts > 0,
    runs.length > 0,
    Boolean(metrics),
  ];
  const coverageScore = Math.round(
    (coverageSignals.filter(Boolean).length / coverageSignals.length) * 100
  );
  const aiProbeComponents: number[] = [];
  if (benchmarkScore != null) aiProbeComponents.push(benchmarkScore * 100);
  if (executionUptime30d != null) aiProbeComponents.push(executionUptime30d * 100);
  if (handshakeErrorRate != null) aiProbeComponents.push(Math.max(0, (1 - handshakeErrorRate) * 100));
  if (outcomesSuccessRate != null) aiProbeComponents.push(outcomesSuccessRate * 100);
  const aiProbeScore =
    aiProbeComponents.length > 0
      ? Number((aiProbeComponents.reduce((sum, value) => sum + value, 0) / aiProbeComponents.length).toFixed(2))
      : 0;
  const aiProbeConfidence = Number(
    Math.min(100, Math.round(Math.log10(1 + outcomesAttempts + benchmarkCount * 5) * 25))
  );

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
    ai_probe: {
      coverage: coverageScore,
      score: aiProbeScore,
      confidence: aiProbeConfidence,
      benchmark_count: benchmarkCount,
      benchmark_score: benchmarkScore,
      benchmark_last_at: benchmarkLastAt,
      handshake_status: handshakeStatus,
      handshake_latency_ms: handshakeLatencyMs,
      handshake_error_rate: handshakeErrorRate,
      outcomes_attempts: outcomesAttempts,
      outcomes_success_rate: outcomesSuccessRate,
      outcomes_last_at: outcomesLastAt,
      execution_uptime_30d: executionUptime30d,
      execution_latency_p95_ms: executionLatencyP95,
      execution_cost_usd: executionCostUsd,
      execution_verified_at: executionVerifiedAt,
    },
  });
  applyRequestIdHeader(response, req);
  recordApiResponse("/api/reliability/agent/:id", req, response, startedAt);
  return response;
}
