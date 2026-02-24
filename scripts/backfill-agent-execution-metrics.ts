#!/usr/bin/env npx tsx
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db } = require("@/lib/db");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { sql } = require("drizzle-orm");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { agentExecutionMetrics } = require("@/lib/db/schema");

async function main() {
  const result = await db.execute(sql`
    WITH agg AS (
      SELECT
        agent_id,
        SUM(attempts)::int AS attempts,
        SUM(success_count)::int AS success_count,
        SUM(timeout_count)::int AS timeout_count,
        MAX(last_outcome_at) AS last_outcome_at
      FROM search_outcomes
      GROUP BY agent_id
    )
    INSERT INTO agent_execution_metrics (
      id,
      agent_id,
      observed_latency_ms_p50,
      observed_latency_ms_p95,
      estimated_cost_usd,
      uptime_30d,
      rate_limit_rpm,
      rate_limit_burst,
      verification_source,
      last_verified_at,
      updated_at,
      created_at
    )
    SELECT
      gen_random_uuid(),
      agg.agent_id,
      NULL,
      NULL,
      NULL,
      LEAST(1.0, GREATEST(0.0, CASE WHEN agg.attempts > 0 THEN agg.success_count::float / agg.attempts ELSE 0 END)),
      NULL,
      NULL,
      'search_outcomes_backfill',
      agg.last_outcome_at,
      now(),
      now()
    FROM agg
    ON CONFLICT (agent_id)
    DO UPDATE SET
      uptime_30d = EXCLUDED.uptime_30d,
      verification_source = 'search_outcomes_backfill',
      last_verified_at = COALESCE(EXCLUDED.last_verified_at, agent_execution_metrics.last_verified_at),
      updated_at = now()
    RETURNING agent_id
  `);

  const updated = (result as unknown as { rows?: Array<{ agent_id: string }> }).rows?.length ?? 0;
  console.log(`[backfill-agent-execution-metrics] updated=${updated}`);
}

main().catch((err) => {
  console.error("[backfill-agent-execution-metrics] failed", err);
  process.exit(1);
});
