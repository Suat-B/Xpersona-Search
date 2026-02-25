import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { searchOutcomes, searchQueries } from "@/lib/db/schema";
import { desc, sql } from "drizzle-orm";
import { trendingCache } from "@/lib/search/cache";
import { checkSearchRateLimit } from "@/lib/search/rate-limit";
import { suggestCircuitBreaker } from "@/lib/search/circuit-breaker";
import { applyRequestIdHeader, jsonError } from "@/lib/api/errors";
import { retryDb } from "@/lib/db/retry";
import { recordApiResponse } from "@/lib/metrics/record";

const MAX_TRENDING = 8;
const TRENDING_WINDOW_DAYS = 30;
const MIN_COUNT = 2;
const BASE_CACHE_KEY = "trending:global";

const TRAILING_STOPWORDS = new Set([
  "a", "an", "and", "be", "for", "in", "is", "it", "of", "on", "or", "the", "to",
]);

function isIncompletePhrase(text: string): boolean {
  const last = text.trim().toLowerCase().split(/\s+/).pop() ?? "";
  return TRAILING_STOPWORDS.has(last);
}

function sanitizeError(err: unknown): string {
  if (process.env.NODE_ENV !== "production" && err instanceof Error) return err.message;
  return "Trending temporarily unavailable";
}

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  // Rate limiting
  const rlResult = await checkSearchRateLimit(req);
  if (!rlResult.allowed) {
    const response = jsonError(req, {
      code: "RATE_LIMITED",
      message: "Too many requests. Please try again later.",
      status: 429,
      retryAfterMs: (rlResult.retryAfter ?? 60) * 1000,
    });
    recordApiResponse("/api/search/trending", req, response, startedAt);
    return response;
  }

  const requestedIntent = req.nextUrl.searchParams.get("intent");
  const clientType = req.headers.get("x-client-type")?.toLowerCase() ?? "";
  const executeMode = requestedIntent === "execute" || clientType === "agent";

  // Cache check (5 minute TTL for trending)
  const cacheKey = `${BASE_CACHE_KEY}:${executeMode ? "execute" : "discover"}`;
  const cached = trendingCache.get(cacheKey);
  if (cached) {
    const response = NextResponse.json(cached);
    response.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    response.headers.set("X-Cache", "HIT");
    applyRequestIdHeader(response, req);
    recordApiResponse("/api/search/trending", req, response, startedAt);
    return response;
  }

  // Circuit breaker
  if (!suggestCircuitBreaker.isAllowed()) {
    const response = NextResponse.json(
      {
        trending: [],
        error: {
          code: "CIRCUIT_OPEN",
          message: "Trending is temporarily degraded. Please try again shortly.",
          retryAfterMs: 15_000,
        },
      },
      { status: 503, headers: { "Retry-After": "15" } }
    );
    applyRequestIdHeader(response, req);
    recordApiResponse("/api/search/trending", req, response, startedAt);
    return response;
  }

  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - TRENDING_WINDOW_DAYS);

    const rows = executeMode
      ? await retryDb(() =>
          db
            .select({
              query: searchOutcomes.querySignature,
              count: searchOutcomes.successCount,
            })
            .from(searchOutcomes)
            .where(
              sql`${searchOutcomes.lastOutcomeAt} >= ${cutoff}
                AND ${searchOutcomes.successCount} >= ${MIN_COUNT}
                AND ${searchOutcomes.querySignature} IS NOT NULL`
            )
            .orderBy(desc(searchOutcomes.successCount))
            .limit(MAX_TRENDING * 2)
        )
      : await retryDb(() =>
          db
            .select({
              query: searchQueries.query,
              count: searchQueries.count,
            })
            .from(searchQueries)
            .where(
              sql`${searchQueries.lastSearchedAt} >= ${cutoff} AND ${searchQueries.count} >= ${MIN_COUNT}`
            )
            .orderBy(desc(searchQueries.count))
            .limit(MAX_TRENDING * 2)
        );

    if (!executeMode && rows.length < 4) {
      const agentRows = await retryDb(() =>
        db.execute(sql`SELECT name FROM agents WHERE status = 'ACTIVE' ORDER BY overall_rank DESC LIMIT 8`)
      );
      const agentNames = (agentRows as unknown as { rows?: Array<{ name: string }> }).rows ?? [];
      const seen = new Set(
        rows
          .map((r) => (typeof r.query === "string" ? r.query.toLowerCase() : ""))
          .filter(Boolean)
      );
      for (const a of agentNames) {
        if (rows.length >= MAX_TRENDING) break;
        if (!seen.has(a.name.toLowerCase())) {
          seen.add(a.name.toLowerCase());
          rows.push({ query: a.name, count: 0 });
        }
      }
    }

    const filtered = rows
      .filter((r) => typeof r.query === "string" && !isIncompletePhrase(r.query))
      .slice(0, MAX_TRENDING);

    suggestCircuitBreaker.recordSuccess();

    const responseBody = {
      trending: filtered.map((r) => r.query),
    };

    trendingCache.set(cacheKey, responseBody);

    const response = NextResponse.json(responseBody);
    response.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    response.headers.set("X-Cache", "MISS");
    applyRequestIdHeader(response, req);
    recordApiResponse("/api/search/trending", req, response, startedAt);
    return response;
  } catch (err) {
    console.error("[Search Trending] Error:", err);
    suggestCircuitBreaker.recordFailure();

    const stale = trendingCache.get(cacheKey);
    if (stale) {
      const response = NextResponse.json(stale);
      response.headers.set("X-Cache", "STALE");
      applyRequestIdHeader(response, req);
      recordApiResponse("/api/search/trending", req, response, startedAt);
      return response;
    }

    const response = NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: sanitizeError(err),
        },
        trending: [],
      },
      { status: 500 }
    );
    applyRequestIdHeader(response, req);
    recordApiResponse("/api/search/trending", req, response, startedAt);
    return response;
  }
}
