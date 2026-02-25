import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { planPipeline } from "@/lib/gpg/recommend";
import { ensureTaskSignature } from "@/lib/gpg/task-canonicalization";
import { applyRequestIdHeader, jsonError } from "@/lib/api/errors";
import { buildCacheKey } from "@/lib/search/cache";
import { graphPlanCache } from "@/lib/graph/cache";
import { graphCircuitBreaker } from "@/lib/search/circuit-breaker";
import { recordApiResponse } from "@/lib/metrics/record";
import { recordGraphFallback } from "@/lib/metrics/kpi";

const PlanSchema = z.object({
  q: z.string().min(1).max(500),
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
  startedAt: number,
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
  const response = NextResponse.json(payload, {
    status: 200,
    headers: { "X-Graph-Plan-Fallback": "1", "X-Cache": "MISS" },
  });
  recordGraphFallback("plan", reason === "CIRCUIT_OPEN" ? "circuit_open" : "internal_error");
  graphPlanCache.set(cacheKey, payload);
  applyRequestIdHeader(response, req);
  recordApiResponse("/api/graph/plan", req, response, startedAt);
  return response;
}

function parsePlanFromQuery(req: NextRequest) {
  const url = new URL(req.url);
  return PlanSchema.safeParse({
    q: url.searchParams.get("q"),
    taskType: url.searchParams.get("taskType") ?? undefined,
    tags: url.searchParams.get("tags")?.split(",").filter(Boolean),
    constraints: {
      budget: url.searchParams.get("budget") ? Number(url.searchParams.get("budget")) : undefined,
      maxLatencyMs: url.searchParams.get("maxLatencyMs") ? Number(url.searchParams.get("maxLatencyMs")) : undefined,
      minSuccessProb: url.searchParams.get("minSuccessProb") ? Number(url.searchParams.get("minSuccessProb")) : undefined,
      minQuality: url.searchParams.get("minQuality") ? Number(url.searchParams.get("minQuality")) : undefined,
    },
    preferences: {
      optimizeFor: url.searchParams.get("optimizeFor") as
        | "success_then_cost"
        | "cost_then_success"
        | "latency_then_success"
        | undefined,
    },
  });
}

async function buildPlanResponse(req: NextRequest, data: z.infer<typeof PlanSchema>) {
  const startedAt = Date.now();
  const cacheKey = buildCacheKey({
    endpoint: "graph-plan",
    q: data.q,
    taskType: data.taskType ?? "",
    tags: (data.tags ?? []).join(","),
    budget: data.constraints?.budget ?? "",
    maxLatencyMs: data.constraints?.maxLatencyMs ?? "",
    minSuccessProb: data.constraints?.minSuccessProb ?? "",
    minQuality: data.constraints?.minQuality ?? "",
    optimizeFor: data.preferences?.optimizeFor ?? "",
  });

  const cached = graphPlanCache.get(cacheKey);
  if (cached) {
    const response = NextResponse.json(cached);
    response.headers.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
    response.headers.set("X-Cache", "HIT");
    applyRequestIdHeader(response, req);
    recordApiResponse("/api/graph/plan", req, response, startedAt);
    return response;
  }

  if (!graphCircuitBreaker.isAllowed()) {
    const stale = graphPlanCache.get(cacheKey);
    if (stale) {
      const response = NextResponse.json({ ...(stale as Record<string, unknown>), _stale: true });
      response.headers.set("X-Cache", "STALE");
      recordGraphFallback("plan", "stale_cache");
      applyRequestIdHeader(response, req);
      recordApiResponse("/api/graph/plan", req, response, startedAt);
      return response;
    }
    return fallbackPlanResponse(req, startedAt, cacheKey, "CIRCUIT_OPEN");
  }

  try {
    const signature = await ensureTaskSignature({
      rawText: data.q,
      taskType: data.taskType,
      tags: data.tags,
    });

    const response = await planPipeline({
      clusterId: signature.clusterId,
      constraints: data.constraints,
      preferences: data.preferences,
    });

    const payload = { success: true, data: response };
    graphPlanCache.set(cacheKey, payload);
    graphCircuitBreaker.recordSuccess();
    const res = NextResponse.json(payload);
    res.headers.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
    res.headers.set("X-Cache", "MISS");
    applyRequestIdHeader(res, req);
    recordApiResponse("/api/graph/plan", req, res, startedAt);
    return res;
  } catch (err) {
    graphCircuitBreaker.recordFailure();
    const stale = graphPlanCache.get(cacheKey);
    if (stale) {
      const response = NextResponse.json({ ...(stale as Record<string, unknown>), _stale: true });
      response.headers.set("X-Cache", "STALE");
      recordGraphFallback("plan", "stale_cache");
      applyRequestIdHeader(response, req);
      recordApiResponse("/api/graph/plan", req, response, startedAt);
      return response;
    }
    return fallbackPlanResponse(
      req,
      startedAt,
      cacheKey,
      "INTERNAL_ERROR",
      process.env.NODE_ENV === "production" ? undefined : String(err)
    );
  }
}

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  const parsed = parsePlanFromQuery(req);
  if (!parsed.success) {
    const response = jsonError(req, {
      code: "BAD_REQUEST",
      message: "Invalid parameters",
      status: 400,
      details: parsed.error.flatten(),
    });
    recordApiResponse("/api/graph/plan", req, response, startedAt);
    return response;
  }
  return buildPlanResponse(req, parsed.data);
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const body = await req.json().catch(() => null);
  const parsed = PlanSchema.safeParse(body);
  if (!parsed.success) {
    const response = jsonError(req, {
      code: "BAD_REQUEST",
      message: "Invalid payload",
      status: 400,
      details: parsed.error.flatten(),
    });
    recordApiResponse("/api/graph/plan", req, response, startedAt);
    return response;
  }
  return buildPlanResponse(req, parsed.data);
}
