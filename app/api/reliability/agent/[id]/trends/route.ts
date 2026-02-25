import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAgentByIdOrSlug } from "@/lib/reliability/lookup";
import { sql } from "drizzle-orm";

function parseWindowDays(value: string | null): number {
  if (!value) return 30;
  const cleaned = value.trim().toLowerCase();
  const numeric = cleaned.endsWith("d") ? cleaned.slice(0, -1) : cleaned;
  const days = Number(numeric);
  if (!Number.isFinite(days)) return 30;
  const allowed = new Set([7, 14, 30, 60, 90]);
  return allowed.has(days) ? days : 30;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const agent = await resolveAgentByIdOrSlug(id);
  if (!agent) {
    return NextResponse.json({ success: false, message: "Agent not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const windowDays = parseWindowDays(url.searchParams.get("window"));

  const current = await db.execute(
    sql`
      SELECT
        COUNT(*)::int AS total,
        SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END)::int AS success,
        AVG(cost_usd) AS avg_cost,
        AVG(latency_ms) AS avg_latency
      FROM agent_runs
      WHERE agent_id = ${agent.id}::uuid
        AND started_at >= now() - (${windowDays} || ' days')::interval
    `
  );
  const prev = await db.execute(
    sql`
      SELECT
        COUNT(*)::int AS total,
        SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END)::int AS success,
        AVG(cost_usd) AS avg_cost,
        AVG(latency_ms) AS avg_latency
      FROM agent_runs
      WHERE agent_id = ${agent.id}::uuid
        AND started_at >= now() - (${windowDays * 2} || ' days')::interval
        AND started_at < now() - (${windowDays} || ' days')::interval
    `
  );

  const currentRow = (current as unknown as { rows?: Array<Record<string, unknown>> }).rows?.[0] ?? {};
  const prevRow = (prev as unknown as { rows?: Array<Record<string, unknown>> }).rows?.[0] ?? {};

  const currentTotal = Number(currentRow.total ?? 0);
  const currentSuccess = Number(currentRow.success ?? 0);
  const currentSuccessRate = currentTotal > 0 ? currentSuccess / currentTotal : 0;
  const currentAvgCost = Number(currentRow.avg_cost ?? 0);
  const currentAvgLatency = Number(currentRow.avg_latency ?? 0);

  const prevTotal = Number(prevRow.total ?? 0);
  const prevSuccess = Number(prevRow.success ?? 0);
  const prevSuccessRate = prevTotal > 0 ? prevSuccess / prevTotal : 0;
  const prevAvgCost = Number(prevRow.avg_cost ?? 0);
  const prevAvgLatency = Number(prevRow.avg_latency ?? 0);

  const failures = await db.execute(
    sql`
      SELECT
        COALESCE(failure_type, 'UNKNOWN') AS type,
        COUNT(*)::int AS frequency
      FROM agent_runs
      WHERE agent_id = ${agent.id}::uuid
        AND started_at >= now() - (${windowDays} || ' days')::interval
        AND status != 'SUCCESS'
      GROUP BY failure_type
      ORDER BY frequency DESC
      LIMIT 5
    `
  );
  const failureRows =
    (failures as unknown as { rows?: Array<{ type: string; frequency: number }> }).rows ?? [];

  return NextResponse.json({
    agentId: agent.id,
    agentSlug: agent.slug,
    window_days: windowDays,
    current: {
      total: currentTotal,
      success: currentSuccess,
      success_rate: Number(currentSuccessRate.toFixed(4)),
      avg_cost_usd: Number(currentAvgCost.toFixed(4)),
      avg_latency_ms: Number(currentAvgLatency.toFixed(2)),
    },
    previous: {
      total: prevTotal,
      success: prevSuccess,
      success_rate: Number(prevSuccessRate.toFixed(4)),
      avg_cost_usd: Number(prevAvgCost.toFixed(4)),
      avg_latency_ms: Number(prevAvgLatency.toFixed(2)),
    },
    deltas: {
      success_rate: Number((currentSuccessRate - prevSuccessRate).toFixed(4)),
      avg_cost_usd: Number((currentAvgCost - prevAvgCost).toFixed(4)),
      avg_latency_ms: Number((currentAvgLatency - prevAvgLatency).toFixed(2)),
    },
    top_failure_modes: failureRows,
  });
}
