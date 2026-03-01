import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { planPipeline } from "@/lib/gpg/recommend";
import { ensureTaskSignature } from "@/lib/gpg/task-canonicalization";
import { hasTrustTable } from "@/lib/trust/db";
import { getActiveReceiptKeyId } from "@/lib/trust/receipts";
import { buildGpgReceiptPayload, signGpgReceipt } from "@/lib/gpg/receipts";
import { db } from "@/lib/db";
import { trustReceipts } from "@/lib/db/schema";
import { applyRequestIdHeader, jsonError } from "@/lib/api/errors";
import { buildCacheKey, LRUCache } from "@/lib/search/cache";
import { gpgCircuitBreaker } from "@/lib/search/circuit-breaker";

const gpgPlanCache = new LRUCache<unknown>(150, 60_000);

const PlanSchema = z.object({
  task: z.string().min(1).max(500),
  taskType: z.string().max(32).optional(),
  tags: z.array(z.string().min(1).max(64)).optional(),
  constraints: z
    .object({
      budget: z.number().min(0).optional(),
      maxLatencyMs: z.number().int().min(1).max(300000).optional(),
      minSuccessProb: z.number().min(0).max(1).optional(),
      minQuality: z.number().min(0).max(1).optional(),
    })
    .optional(),
  preferences: z
    .object({
      optimizeFor: z.enum(["success_then_cost", "cost_then_success", "latency_then_success"]).optional(),
    })
    .optional(),
});

function fallbackPlanResponse(
  req: NextRequest,
  cacheKey: string,
  reason: "CIRCUIT_OPEN" | "INTERNAL_ERROR",
  details?: unknown
) {
  const payload = {
    success: true,
    _fallback: true,
    fallbackReason: reason,
    data: {
      clusterId: null,
      clusterName: null,
      taskType: "general",
      plan: null,
      alternatives: [],
    },
    ...(details !== undefined ? { error: details } : {}),
  };
  gpgPlanCache.set(cacheKey, payload);
  const response = NextResponse.json(payload, {
    status: 200,
    headers: { "X-Gpg-Plan-Fallback": "1", "X-Cache": "MISS" },
  });
  applyRequestIdHeader(response, req);
  return response;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = PlanSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(req, {
      code: "BAD_REQUEST",
      message: "Invalid payload",
      status: 400,
      details: parsed.error.flatten(),
    });
  }

  const cacheKey = buildCacheKey({
    endpoint: "gpg-plan",
    task: parsed.data.task,
    taskType: parsed.data.taskType ?? "",
    tags: (parsed.data.tags ?? []).join(","),
    budget: parsed.data.constraints?.budget ?? "",
    maxLatencyMs: parsed.data.constraints?.maxLatencyMs ?? "",
    minSuccessProb: parsed.data.constraints?.minSuccessProb ?? "",
    minQuality: parsed.data.constraints?.minQuality ?? "",
    optimizeFor: parsed.data.preferences?.optimizeFor ?? "",
  });

  const cached = gpgPlanCache.get(cacheKey);
  if (cached) {
    const response = NextResponse.json(cached);
    response.headers.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
    response.headers.set("X-Cache", "HIT");
    applyRequestIdHeader(response, req);
    return response;
  }

  if (!gpgCircuitBreaker.isAllowed()) {
    const stale = gpgPlanCache.get(cacheKey);
    if (stale) {
      const response = NextResponse.json({ ...(stale as Record<string, unknown>), _stale: true });
      response.headers.set("X-Cache", "STALE");
      applyRequestIdHeader(response, req);
      return response;
    }
    return fallbackPlanResponse(req, cacheKey, "CIRCUIT_OPEN");
  }

  let response;
  try {
    const signature = await ensureTaskSignature({
      rawText: parsed.data.task,
      taskType: parsed.data.taskType,
      tags: parsed.data.tags,
    });

    response = await planPipeline({
      clusterId: signature.clusterId,
      constraints: parsed.data.constraints,
      preferences: parsed.data.preferences,
    });
    gpgCircuitBreaker.recordSuccess();
  } catch (err) {
    gpgCircuitBreaker.recordFailure();
    const stale = gpgPlanCache.get(cacheKey);
    if (stale) {
      const response = NextResponse.json({ ...(stale as Record<string, unknown>), _stale: true });
      response.headers.set("X-Cache", "STALE");
      applyRequestIdHeader(response, req);
      return response;
    }
    return fallbackPlanResponse(
      req,
      cacheKey,
      "INTERNAL_ERROR",
      process.env.NODE_ENV === "production" ? undefined : String(err)
    );
  }

  const idempotencyKey = req.headers.get("idempotency-key")?.trim() ?? null;
  const leadAgentId = response.plan?.agents?.[0] ?? null;
  if (leadAgentId && (await hasTrustTable("trust_receipts"))) {
    const keyId = getActiveReceiptKeyId();
    if (keyId) {
      const receiptIdempotency = idempotencyKey && idempotencyKey.length <= 64 ? idempotencyKey : null;
      const { payload, payloadHash } = buildGpgReceiptPayload({
        receiptType: "gpg_plan_issued",
        agentId: leadAgentId,
        eventPayload: {
          clusterId: response.clusterId,
          taskType: response.taskType,
          task: parsed.data.task,
          constraints: parsed.data.constraints ?? null,
          preferences: parsed.data.preferences ?? null,
          plan: response.plan,
          alternatives: response.alternatives,
          issuedAt: new Date().toISOString(),
        },
        idempotencyKey: receiptIdempotency,
      });
      const signatureValue = signGpgReceipt(payloadHash, keyId);
      try {
        await db.insert(trustReceipts).values({
          receiptType: payload.receiptType,
          agentId: payload.agentId,
          counterpartyAgentId: payload.counterpartyAgentId ?? null,
          eventPayload: payload.eventPayload,
          payloadHash,
          signature: signatureValue,
          keyId,
          nonce: crypto.randomUUID(),
          idempotencyKey: receiptIdempotency,
        });
      } catch {
        // best-effort
      }
    }
  }

  const payload = { success: true, data: response };
  gpgPlanCache.set(cacheKey, payload);
  const res = NextResponse.json(payload);
  res.headers.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
  res.headers.set("X-Cache", "MISS");
  applyRequestIdHeader(res, req);
  return res;
}
