import { NextRequest, NextResponse } from "next/server";
import { fetchWithTimeout } from "@/lib/api/fetch-timeout";
import { applyRequestIdHeader, jsonError } from "@/lib/api/errors";
import { buildCacheKey } from "@/lib/search/cache";
import { graphTopCache } from "@/lib/graph/cache";
import { graphCircuitBreaker } from "@/lib/search/circuit-breaker";
import { recordApiResponse } from "@/lib/metrics/record";

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
      applyRequestIdHeader(response, req);
      recordApiResponse("/api/graph/top", req, response, startedAt);
      return response;
    }
    const response = jsonError(req, {
      code: "CIRCUIT_OPEN",
      message: "Graph top is temporarily unavailable",
      status: 503,
      retryAfterMs: 20_000,
    });
    recordApiResponse("/api/graph/top", req, response, startedAt);
    return response;
  }

  try {
    const upstream = await fetchWithTimeout(
      new URL(`/api/reliability/top?${params.toString()}`, req.nextUrl.origin),
      { method: "GET" },
      Number(process.env.API_UPSTREAM_TIMEOUT_MS ?? "8000")
    );
    const json = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return jsonError(req, {
        code: "UPSTREAM_ERROR",
        message: "Failed to fetch top agents",
        status: 502,
        details: json,
        retryable: true,
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
      applyRequestIdHeader(response, req);
      recordApiResponse("/api/graph/top", req, response, startedAt);
      return response;
    }
    const response = jsonError(req, {
      code: "UPSTREAM_ERROR",
      message: "Failed to fetch top agents",
      status: 502,
      details: process.env.NODE_ENV === "production" ? undefined : String(err),
      retryable: true,
    });
    recordApiResponse("/api/graph/top", req, response, startedAt);
    return response;
  }
}
