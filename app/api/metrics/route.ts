import { NextRequest, NextResponse } from "next/server";
import { applyRequestIdHeader } from "@/lib/api/errors";
import { searchResultsCache, suggestCache, trendingCache } from "@/lib/search/cache";
import { searchCircuitBreaker, suggestCircuitBreaker } from "@/lib/search/circuit-breaker";

const startedAt = Date.now();

export async function GET(req: NextRequest) {
  const memory = process.memoryUsage();
  const response = NextResponse.json({
    ok: true,
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
    memory: {
      rss: memory.rss,
      heapTotal: memory.heapTotal,
      heapUsed: memory.heapUsed,
      external: memory.external,
    },
    caches: {
      searchResults: searchResultsCache.size,
      suggest: suggestCache.size,
      trending: trendingCache.size,
    },
    circuitBreakers: {
      search: searchCircuitBreaker.getState(),
      suggest: suggestCircuitBreaker.getState(),
    },
  });
  applyRequestIdHeader(response, req);
  return response;
}
