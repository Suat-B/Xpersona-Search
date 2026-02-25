import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agentMetrics, agentRuns } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { computeCalibrationError, getFailurePatterns, getPercentileRank } from "@/lib/reliability/metrics";
import { computeHiringScore } from "@/lib/reliability/hiring";
import { resolveAgentByIdOrSlug } from "@/lib/reliability/lookup";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const agent = await resolveAgentByIdOrSlug(id);
  if (!agent) {
    return NextResponse.json({ success: false, message: "Agent not found" }, { status: 404 });
  }

  let metrics: typeof agentMetrics.$inferSelect | undefined;
  let runs: Array<{ status: string; confidence: number | null }> = [];
  let failures: Array<{ type: string; frequency: number; lastSeen: Date }> = [];
  let percentileRank: number | null = null;
  let calibrationError: number | null = null;
  let hiringScore = 0;
  let successRateDelta = 0;
  let costDelta = 0;
  let metricsUnavailable = false;

  try {
    [metrics] = await db
      .select()
      .from(agentMetrics)
      .where(eq(agentMetrics.agentId, agent.id))
      .limit(1);

    runs = await db
      .select({ status: agentRuns.status, confidence: agentRuns.confidence })
      .from(agentRuns)
      .where(eq(agentRuns.agentId, agent.id))
      .orderBy(desc(agentRuns.startedAt))
      .limit(500);

    failures = await getFailurePatterns(agent.id);
    percentileRank = await getPercentileRank(agent.id);
    calibrationError = computeCalibrationError(runs);
    hiringScore = await computeHiringScore(agent.id);

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

  return NextResponse.json({
    agentId: agent.id,
    agentSlug: agent.slug,
    success_rate: metrics?.successRate ?? 0,
    avg_latency_ms: metrics?.avgLatencyMs ?? 0,
    avg_cost_usd: metrics?.avgCostUsd ?? 0,
    hallucination_rate: metrics?.hallucinationRate ?? 0,
    retry_rate: metrics?.retryRate ?? 0,
    dispute_rate: metrics?.disputeRate ?? 0,
    p50_latency: metrics?.p50Latency ?? 0,
    p95_latency: metrics?.p95Latency ?? 0,
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
    last_updated: metrics?.lastUpdated ?? null,
    metrics_unavailable: metricsUnavailable,
  });
}
