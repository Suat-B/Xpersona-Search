import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db } = require("@/lib/db");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { sql } = require("drizzle-orm");

async function main() {
  const result = await db.execute(sql`
    SELECT
      a.id,
      a.slug,
      a.source,
      CASE
        WHEN c.agent_id IS NULL THEN 0
        WHEN jsonb_array_length(COALESCE(c.auth_modes, '[]'::jsonb)) > 0
          AND (c.input_schema_ref IS NOT NULL OR c.output_schema_ref IS NOT NULL) THEN 100
        ELSE 50
      END AS contract_completeness,
      CASE
        WHEN m.updated_at IS NULL THEN 0
        ELSE GREATEST(0, 100 - LEAST(100, EXTRACT(EPOCH FROM (now() - m.updated_at)) / 3600))
      END AS metrics_freshness,
      COALESCE(
        CASE WHEN o.attempts > 0 THEN (o.success_count::float / o.attempts) * 100 ELSE 0 END,
        0
      ) AS execute_success_rate,
      COALESCE(
        CASE WHEN o.attempts > 0 THEN (o.failure_count::float / o.attempts) * 100 ELSE 0 END,
        0
      ) AS policy_mismatch_frequency
    FROM agents a
    LEFT JOIN agent_capability_contracts c ON c.agent_id = a.id
    LEFT JOIN agent_execution_metrics m ON m.agent_id = a.id
    LEFT JOIN search_outcomes o ON o.agent_id = a.id AND o.task_type != 'general'
    WHERE a.status = 'ACTIVE'
    ORDER BY execute_success_rate DESC, metrics_freshness DESC
    LIMIT 1000
  `);
  console.log(JSON.stringify((result as { rows?: unknown[] }).rows ?? [], null, 2));
}

main().catch((err) => {
  console.error("[search-agent-audit] failed", err);
  process.exit(1);
});
