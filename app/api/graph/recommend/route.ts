import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { recommendAgents } from "@/lib/gpg/recommend";
import { ensureTaskSignature } from "@/lib/gpg/task-canonicalization";
import { applyRequestIdHeader, jsonError } from "@/lib/api/errors";
import { buildCacheKey } from "@/lib/search/cache";
import { graphRecommendCache } from "@/lib/graph/cache";
import { graphCircuitBreaker } from "@/lib/search/circuit-breaker";
import { recordApiResponse } from "@/lib/metrics/record";

const RecommendSchema = z.object({
  q: z.string().min(1).max(500),
  taskType: z.string().max(32).optional(),
  tags: z.array(z.string().min(1).max(64)).optional(),
  budget: z.number().min(0).optional(),
  maxLatencyMs: z.number().int().min(1).max(300000).optional(),
  minSuccessProb: z.number().min(0).max(1).optional(),
  minQuality: z.number().min(0).max(1).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  const url = new URL(req.url);
  const parsed = RecommendSchema.safeParse({
    q: url.searchParams.get("q"),
    taskType: url.searchParams.get("taskType") ?? undefined,
    tags: url.searchParams.get("tags")?.split(",").filter(Boolean),
    budget: url.searchParams.get("budget") ? Number(url.searchParams.get("budget")) : undefined,
    maxLatencyMs: url.searchParams.get("maxLatencyMs") ? Number(url.searchParams.get("maxLatencyMs")) : undefined,
    minSuccessProb: url.searchParams.get("minSuccessProb") ? Number(url.searchParams.get("minSuccessProb")) : undefined,
    minQuality: url.searchParams.get("minQuality") ? Number(url.searchParams.get("minQuality")) : undefined,
    limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
  });
  if (!parsed.success) {
    return jsonError(req, {
      code: "BAD_REQUEST",
      message: "Invalid parameters",
      status: 400,
      details: parsed.error.flatten(),
    });
  }

  const cacheKey = buildCacheKey({
    endpoint: "graph-recommend",
    q: parsed.data.q,
    taskType: parsed.data.taskType ?? "",
    tags: (parsed.data.tags ?? []).join(","),
    budget: parsed.data.budget ?? "",
    maxLatencyMs: parsed.data.maxLatencyMs ?? "",
    minSuccessProb: parsed.data.minSuccessProb ?? "",
    minQuality: parsed.data.minQuality ?? "",
    limit: parsed.data.limit ?? "",
  });
  const cached = graphRecommendCache.get(cacheKey);
  if (cached) {
    const response = NextResponse.json(cached);
    response.headers.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
    response.headers.set("X-Cache", "HIT");
    applyRequestIdHeader(response, req);
    recordApiResponse("/api/graph/recommend", req, response, startedAt);
    return response;
  }

  if (!graphCircuitBreaker.isAllowed()) {
    const stale = graphRecommendCache.get(cacheKey);
    if (stale) {
      const response = NextResponse.json({ ...(stale as Record<string, unknown>), _stale: true });
      response.headers.set("X-Cache", "STALE");
      applyRequestIdHeader(response, req);
      recordApiResponse("/api/graph/recommend", req, response, startedAt);
      return response;
    }
    const response = jsonError(req, {
      code: "CIRCUIT_OPEN",
      message: "Graph recommend is temporarily unavailable",
      status: 503,
      retryAfterMs: 20_000,
    });
    recordApiResponse("/api/graph/recommend", req, response, startedAt);
    return response;
  }

  try {
    const signature = await ensureTaskSignature({
      rawText: parsed.data.q,
      taskType: parsed.data.taskType,
      tags: parsed.data.tags,
    });

    const response = await recommendAgents({
      clusterId: signature.clusterId,
      constraints: {
        budget: parsed.data.budget,
        maxLatencyMs: parsed.data.maxLatencyMs,
        minSuccessProb: parsed.data.minSuccessProb,
        minQuality: parsed.data.minQuality,
      },
      limit: parsed.data.limit,
    });

    const payload = { success: true, data: response };
    graphRecommendCache.set(cacheKey, payload);
    graphCircuitBreaker.recordSuccess();
    const res = NextResponse.json(payload);
    res.headers.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
    res.headers.set("X-Cache", "MISS");
    applyRequestIdHeader(res, req);
    recordApiResponse("/api/graph/recommend", req, res, startedAt);
    return res;
  } catch (err) {
    graphCircuitBreaker.recordFailure();
    const stale = graphRecommendCache.get(cacheKey);
    if (stale) {
      const response = NextResponse.json({ ...(stale as Record<string, unknown>), _stale: true });
      response.headers.set("X-Cache", "STALE");
      applyRequestIdHeader(response, req);
      recordApiResponse("/api/graph/recommend", req, response, startedAt);
      return response;
    }
    const response = jsonError(req, {
      code: "INTERNAL_ERROR",
      message: "Graph recommend failed",
      status: 500,
      details: process.env.NODE_ENV === "production" ? undefined : String(err),
    });
    recordApiResponse("/api/graph/recommend", req, response, startedAt);
    return response;
  }
}
