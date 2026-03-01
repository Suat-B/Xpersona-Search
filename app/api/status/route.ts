import { NextRequest, NextResponse } from "next/server";
import { applyRequestIdHeader } from "@/lib/api/errors";
import { graphCircuitBreaker, gpgCircuitBreaker } from "@/lib/search/circuit-breaker";
import { graphPlanCache, graphRecommendCache, graphRelatedCache, graphTopCache } from "@/lib/graph/cache";

const startedAt = Date.now();

export async function GET(req: NextRequest) {
  const uptimeSeconds = Math.floor((Date.now() - startedAt) / 1000);
  const response = NextResponse.json({
    ok: true,
    status: "ok",
    uptimeSeconds,
    timestamp: new Date().toISOString(),
    services: {
      graph: {
        circuit: graphCircuitBreaker.getState(),
        caches: {
          recommend: graphRecommendCache.size,
          plan: graphPlanCache.size,
          related: graphRelatedCache.size,
          top: graphTopCache.size,
        },
      },
      gpg: {
        circuit: gpgCircuitBreaker.getState(),
      },
    },
  });
  applyRequestIdHeader(response, req);
  return response;
}
