import { NextRequest, NextResponse } from "next/server";
import { fetchWithTimeout } from "@/lib/api/fetch-timeout";
import { applyRequestIdHeader } from "@/lib/api/errors";
import { buildCacheKey } from "@/lib/search/cache";
import { graphTopCache } from "@/lib/graph/cache";
import { graphCircuitBreaker } from "@/lib/search/circuit-breaker";
import { recordApiResponse } from "@/lib/metrics/record";
import { recordGraphFallback } from "@/lib/metrics/kpi";

function fallbackTopResponse(
  req: NextRequest,
  startedAt: number,
  cacheKey: string,
  reason: "CIRCUIT_OPEN" | "INTERNAL_ERROR" | "UPSTREAM_ERROR",
  details?: unknown
) {
  const payload = {
    results: [],
    count: 0,
    _fallback: true,
    fallbackReason: reason,
    ...(details !== undefined ? { error: details } : {}),
  };
  graphTopCache.set(cacheKey, payload);
  const response = NextResponse.json(payload, {
    status: 200,
    headers: { "X-Graph-Top-Fallback": "1", "X-Cache": "MISS" },
  });
  recordGraphFallback(
    "top",
    reason === "CIRCUIT_OPEN" ? "circuit_open" : reason === "UPSTREAM_ERROR" ? "upstream_error" : "internal_error"
  );
  applyRequestIdHeader(response, req);
  recordApiResponse("/api/graph/top", req, response, startedAt);
  return response;
}

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  const url = new URL(req.url);
  const params = new URLSearchParams();
  const capability = url.searchParams.get("capability");
  const budget = url.searchParams.get("budget");
  const cluster = url.searchParams.get("cluster");
  const taskType = url.searchParams.get("taskType");
  const tier = url.searchParams.get("tier");
  const limit = url.searchParams.get("limit");

  if (capability) params.set("capability", capability);
  if (budget) params.set("budget", budget);
  if (cluster) params.set("cluster", cluster);
  if (taskType) params.set("taskType", taskType);
  if (tier) params.set("tier", tier);
  if (limit) params.set("limit", limit);

  const cacheKey = buildCacheKey({
    endpoint: "graph-top",
    capability: capability ?? "",
    budget: budget ?? "",
    cluster: cluster ?? "",
    taskType: taskType ?? "",
    tier: tier ?? "",
    limit: limit ?? "",
  });
  const cached = graphTopCache.get(cacheKey);
  if (cached) {
    const response = NextResponse.json(cached);
    response.headers.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
    response.headers.set("X-Cache", "HIT");
    applyRequestIdHeader(response, req);
    recordApiResponse("/api/graph/top", req, response, startedAt);
    return response;
  }

  if (!graphCircuitBreaker.isAllowed()) {
    const stale = graphTopCache.get(cacheKey);
    if (stale) {
      const response = NextResponse.json({ ...(stale as Record<string, unknown>), _stale: true });
      response.headers.set("X-Cache", "STALE");
      recordGraphFallback("top", "stale_cache");
      applyRequestIdHeader(response, req);
      recordApiResponse("/api/graph/top", req, response, startedAt);
      return response;
    }
    return fallbackTopResponse(req, startedAt, cacheKey, "CIRCUIT_OPEN");
  }

  try {
    const upstream = await fetchWithTimeout(
      new URL(`/api/v1/reliability/top?${params.toString()}`, req.nextUrl.origin),
      { method: "GET" },
      Number(process.env.API_UPSTREAM_TIMEOUT_MS ?? "8000")
    );
    const json = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return fallbackTopResponse(req, startedAt, cacheKey, "UPSTREAM_ERROR", {
        upstreamStatus: upstream.status,
        upstream: json,
      });
    }
    graphTopCache.set(cacheKey, json);
    graphCircuitBreaker.recordSuccess();
    const response = NextResponse.json(json);
    response.headers.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
    response.headers.set("X-Cache", "MISS");
    applyRequestIdHeader(response, req);
    recordApiResponse("/api/graph/top", req, response, startedAt);
    return response;
  } catch (err) {
    graphCircuitBreaker.recordFailure();
    const stale = graphTopCache.get(cacheKey);
    if (stale) {
      const response = NextResponse.json({ ...(stale as Record<string, unknown>), _stale: true });
      response.headers.set("X-Cache", "STALE");
      recordGraphFallback("top", "stale_cache");
      applyRequestIdHeader(response, req);
      recordApiResponse("/api/graph/top", req, response, startedAt);
      return response;
    }
    return fallbackTopResponse(
      req,
      startedAt,
      cacheKey,
      "INTERNAL_ERROR",
      process.env.NODE_ENV === "production" ? undefined : String(err)
    );
  }
}
