import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-utils";
import {
  checkSearchRateLimit,
  SEARCH_ANON_RATE_LIMIT,
  SEARCH_AUTH_RATE_LIMIT,
} from "@/lib/search/rate-limit";

const OutcomeSchema = z.object({
  querySignature: z.string().length(64),
  selectedResultId: z.string().uuid(),
  outcome: z.enum(["success", "failure", "timeout"]),
  taskType: z.string().min(1).max(32).optional().default("general"),
  latencyMs: z.number().int().min(0).max(300000).optional(),
  costUsd: z.number().min(0).max(10000).optional(),
});

const IDEMPOTENCY_WINDOW_MS = 2 * 60 * 1000;
const idempotencyStore = new Map<string, number>();

function seenIdempotencyKey(key: string): boolean {
  const now = Date.now();
  for (const [k, expiresAt] of idempotencyStore.entries()) {
    if (expiresAt <= now) idempotencyStore.delete(k);
  }
  const expires = idempotencyStore.get(key);
  if (expires && expires > now) return true;
  idempotencyStore.set(key, now + IDEMPOTENCY_WINDOW_MS);
  return false;
}

export async function POST(req: NextRequest) {
  const authProbe = await getAuthUser(req);
  const isAuthenticated = !("error" in authProbe);
  const rateLimitLimit = isAuthenticated ? SEARCH_AUTH_RATE_LIMIT : SEARCH_ANON_RATE_LIMIT;
  const rlResult = await checkSearchRateLimit(req, isAuthenticated);
  if (!rlResult.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(rlResult.retryAfter ?? 60),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Limit": String(rateLimitLimit),
        },
      }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let params: z.infer<typeof OutcomeSchema>;
  try {
    params = OutcomeSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      const msg = err.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    throw err;
  }

  const idem = req.headers.get("idempotency-key")?.trim();
  if (idem) {
    const token = `${idem}:${params.querySignature}:${params.selectedResultId}:${params.outcome}:${params.taskType}`;
    if (seenIdempotencyKey(token)) {
      return NextResponse.json({ ok: true, deduped: true }, { status: 200 });
    }
  }

  await db.execute(sql`
    INSERT INTO search_outcomes (
      id, query_signature, agent_id, task_type, attempts, success_count, failure_count, timeout_count, last_outcome_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      ${params.querySignature},
      ${params.selectedResultId}::uuid,
      ${params.taskType},
      1,
      ${params.outcome === "success" ? 1 : 0},
      ${params.outcome === "failure" ? 1 : 0},
      ${params.outcome === "timeout" ? 1 : 0},
      now(),
      now(),
      now()
    )
    ON CONFLICT (query_signature, agent_id, task_type)
    DO UPDATE SET
      attempts = search_outcomes.attempts + 1,
      success_count = search_outcomes.success_count + ${params.outcome === "success" ? 1 : 0},
      failure_count = search_outcomes.failure_count + ${params.outcome === "failure" ? 1 : 0},
      timeout_count = search_outcomes.timeout_count + ${params.outcome === "timeout" ? 1 : 0},
      last_outcome_at = now(),
      updated_at = now()
  `);

  if (params.latencyMs != null || params.costUsd != null) {
    await db.execute(sql`
      INSERT INTO agent_execution_metrics (
        id, agent_id, observed_latency_ms_p50, observed_latency_ms_p95, estimated_cost_usd, updated_at, created_at
      ) VALUES (
        gen_random_uuid(),
        ${params.selectedResultId}::uuid,
        ${params.latencyMs ?? null},
        ${params.latencyMs ?? null},
        ${params.costUsd ?? null},
        now(),
        now()
      )
      ON CONFLICT (agent_id)
      DO UPDATE SET
        observed_latency_ms_p50 = COALESCE(agent_execution_metrics.observed_latency_ms_p50, EXCLUDED.observed_latency_ms_p50),
        observed_latency_ms_p95 = GREATEST(COALESCE(agent_execution_metrics.observed_latency_ms_p95, 0), COALESCE(EXCLUDED.observed_latency_ms_p95, 0)),
        estimated_cost_usd = COALESCE(EXCLUDED.estimated_cost_usd, agent_execution_metrics.estimated_cost_usd),
        updated_at = now()
    `);
  }

  return NextResponse.json(
    { ok: true },
    {
      status: 200,
      headers: {
        "X-RateLimit-Remaining": String(rlResult.remaining ?? 0),
        "X-RateLimit-Limit": String(rateLimitLimit),
      },
    }
  );
}
