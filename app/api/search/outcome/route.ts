import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { trustReceipts } from "@/lib/db/schema";
import { getAuthUser } from "@/lib/auth-utils";
import { sanitizeForStorage } from "@/lib/search/query-engine";
import { EXECUTION_PATHS, FAILURE_CODES, TASK_TYPES } from "@/lib/search/taxonomy";
import {
  checkSearchRateLimit,
  SEARCH_ANON_RATE_LIMIT,
  SEARCH_AUTH_RATE_LIMIT,
} from "@/lib/search/rate-limit";
import { ingestRun } from "@/lib/gpg/ingest";
import type { FailureType, RunStatus } from "@/lib/reliability/types";
import {
  canonicalizePayload,
  getActiveReceiptKeyId,
  hashPayload,
  signPayloadHash,
} from "@/lib/trust/receipts";
import { hasTrustTable } from "@/lib/trust/db";

const OutcomeSchema = z.object({
  querySignature: z.string().length(64),
  selectedResultId: z.string().uuid(),
  outcome: z.enum(["success", "failure", "timeout"]),
  taskType: z.enum(TASK_TYPES).optional().default("general"),
  query: z.string().min(1).max(500).optional(),
  failureCode: z.enum(FAILURE_CODES).optional(),
  executionPath: z.enum(EXECUTION_PATHS).optional().default("single"),
  budgetExceeded: z.boolean().optional().default(false),
  latencyMs: z.number().int().min(0).max(300000).optional(),
  costUsd: z.number().min(0).max(10000).optional(),
});

const IDEMPOTENCY_WINDOW_MS = 2 * 60 * 1000;
const idempotencyStore = new Map<string, number>();
const RELIABILITY_FROM_OUTCOMES = process.env.RELIABILITY_FROM_OUTCOMES !== "0";

function mapOutcomeStatus(outcome: "success" | "failure" | "timeout"): RunStatus {
  if (outcome === "success") return "SUCCESS";
  if (outcome === "timeout") return "TIMEOUT";
  return "FAILURE";
}

function mapFailureCode(code?: (typeof FAILURE_CODES)[number]): FailureType | null {
  switch (code) {
    case "tool_error":
      return "TOOL_ERROR";
    case "schema_mismatch":
      return "INVALID_FORMAT";
    case "rate_limit":
      return "TIMEOUT";
    case "auth":
      return "POLICY_BLOCK";
    default:
      return null;
  }
}

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
    const token = `${idem}:${params.querySignature}:${params.selectedResultId}:${params.outcome}:${params.taskType}:${params.executionPath}`;
    if (seenIdempotencyKey(token)) {
      return NextResponse.json({ ok: true, deduped: true }, { status: 200 });
    }
  }
  const querySanitized = params.query ? sanitizeForStorage(params.query).slice(0, 255) : null;
  const queryNormalized = querySanitized ? querySanitized.toLowerCase().trim() : null;

  await db.execute(sql`
    INSERT INTO search_outcomes (
      id, query_signature, agent_id, task_type, attempts, success_count, failure_count, timeout_count,
      auth_failure_count, rate_limit_failure_count, tool_error_count, schema_mismatch_count,
      budget_exceeded_count, single_path_count, delegated_path_count, bundled_path_count,
      last_query, last_query_normalized,
      last_outcome_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      ${params.querySignature},
      ${params.selectedResultId}::uuid,
      ${params.taskType},
      1,
      ${params.outcome === "success" ? 1 : 0},
      ${params.outcome === "failure" ? 1 : 0},
      ${params.outcome === "timeout" ? 1 : 0},
      ${params.failureCode === "auth" ? 1 : 0},
      ${params.failureCode === "rate_limit" ? 1 : 0},
      ${params.failureCode === "tool_error" ? 1 : 0},
      ${params.failureCode === "schema_mismatch" ? 1 : 0},
      ${params.budgetExceeded ? 1 : 0},
      ${params.executionPath === "single" ? 1 : 0},
      ${params.executionPath === "delegated" ? 1 : 0},
      ${params.executionPath === "bundled" ? 1 : 0},
      ${querySanitized},
      ${queryNormalized},
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
      auth_failure_count = search_outcomes.auth_failure_count + ${params.failureCode === "auth" ? 1 : 0},
      rate_limit_failure_count = search_outcomes.rate_limit_failure_count + ${params.failureCode === "rate_limit" ? 1 : 0},
      tool_error_count = search_outcomes.tool_error_count + ${params.failureCode === "tool_error" ? 1 : 0},
      schema_mismatch_count = search_outcomes.schema_mismatch_count + ${params.failureCode === "schema_mismatch" ? 1 : 0},
      budget_exceeded_count = search_outcomes.budget_exceeded_count + ${params.budgetExceeded ? 1 : 0},
      single_path_count = search_outcomes.single_path_count + ${params.executionPath === "single" ? 1 : 0},
      delegated_path_count = search_outcomes.delegated_path_count + ${params.executionPath === "delegated" ? 1 : 0},
      bundled_path_count = search_outcomes.bundled_path_count + ${params.executionPath === "bundled" ? 1 : 0},
      last_query = COALESCE(${querySanitized}, search_outcomes.last_query),
      last_query_normalized = COALESCE(${queryNormalized}, search_outcomes.last_query_normalized),
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

  const issueReceipts = process.env.TRUST_RECEIPT_ON_OUTCOME === "1";
  if (issueReceipts && (await hasTrustTable("trust_receipts"))) {
    const keyId = getActiveReceiptKeyId();
    if (keyId) {
      const eventPayload = {
        querySignature: params.querySignature,
        selectedResultId: params.selectedResultId,
        outcome: params.outcome,
        taskType: params.taskType,
        executionPath: params.executionPath,
        failureCode: params.failureCode ?? null,
        latencyMs: params.latencyMs ?? null,
        costUsd: params.costUsd ?? null,
        budgetExceeded: params.budgetExceeded ?? false,
        observedAt: new Date().toISOString(),
      };
      const canonical = canonicalizePayload(eventPayload);
      const payloadHash = hashPayload(canonical);
      const signature = signPayloadHash(payloadHash, keyId);
      try {
        await db.insert(trustReceipts).values({
          receiptType:
            params.outcome === "success" ? "execution_complete" : "fallback_switch",
          agentId: params.selectedResultId,
          eventPayload,
          payloadHash,
          signature,
          keyId,
          nonce: crypto.randomUUID(),
        });
      } catch {
        // best-effort, do not fail outcome ingestion
      }
    }
  }

  if (RELIABILITY_FROM_OUTCOMES) {
    const startedAt =
      params.latencyMs != null
        ? new Date(Date.now() - Math.max(0, params.latencyMs))
        : new Date();
    try {
      await ingestRun({
        agentId: params.selectedResultId,
        jobId: params.querySignature,
        taskText: params.query ?? null,
        taskType: params.taskType ?? "general",
        tags: null,
        pipeline: params.executionPath
          ? {
              id: params.querySignature,
              agentPath: [params.selectedResultId],
              step: 0,
            }
          : null,
        status: mapOutcomeStatus(params.outcome),
        latencyMs: params.latencyMs ?? 0,
        costUsd: params.costUsd ?? 0,
        confidence: null,
        hallucinationScore: null,
        failureType: mapFailureCode(params.failureCode) ?? null,
        trace: {
          source: "search_outcome",
          failureCode: params.failureCode ?? null,
          executionPath: params.executionPath,
          budgetExceeded: params.budgetExceeded ?? false,
          latencyMs: params.latencyMs ?? null,
          costUsd: params.costUsd ?? null,
          observedAt: new Date().toISOString(),
        },
        inputHash: params.querySignature,
        outputHash: null,
        modelUsed: "unknown",
        tokensInput: null,
        tokensOutput: null,
        startedAt,
        completedAt: new Date(),
        isVerified: false,
        ingestIdempotencyKey: idem ?? null,
        ingestKeyId: null,
      });
    } catch (err) {
      console.warn("[Reliability] Outcome ingest failed:", err);
    }
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
