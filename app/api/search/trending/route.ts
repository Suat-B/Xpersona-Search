import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { searchQueries } from "@/lib/db/schema";
import { desc, sql } from "drizzle-orm";
import { trendingCache } from "@/lib/search/cache";
import { checkSearchRateLimit } from "@/lib/search/rate-limit";
import { suggestCircuitBreaker } from "@/lib/search/circuit-breaker";

const MAX_TRENDING = 8;
const TRENDING_WINDOW_DAYS = 30;
const MIN_COUNT = 2;
const CACHE_KEY = "trending:global";

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
  // Rate limiting
  const rlResult = await checkSearchRateLimit(req);
  if (!rlResult.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(rlResult.retryAfter ?? 60) },
      }
    );
  }

  // Cache check (5 minute TTL for trending)
  const cached = trendingCache.get(CACHE_KEY);
  if (cached) {
    const response = NextResponse.json(cached);
    response.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    response.headers.set("X-Cache", "HIT");
    return response;
  }

  // Circuit breaker
  if (!suggestCircuitBreaker.isAllowed()) {
    return NextResponse.json(
      { trending: [] },
      { status: 503, headers: { "Retry-After": "15" } }
    );
  }

  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - TRENDING_WINDOW_DAYS);

    const rows = await db
      .select({
        query: searchQueries.query,
        count: searchQueries.count,
      })
      .from(searchQueries)
      .where(
        sql`${searchQueries.lastSearchedAt} >= ${cutoff} AND ${searchQueries.count} >= ${MIN_COUNT}`
      )
      .orderBy(desc(searchQueries.count))
      .limit(MAX_TRENDING * 2);

    if (rows.length < 4) {
      const agentRows = await db.execute(
        sql`SELECT name FROM agents WHERE status = 'ACTIVE' ORDER BY overall_rank DESC LIMIT 8`
      );
      const agentNames = (agentRows as unknown as { rows?: Array<{ name: string }> }).rows ?? [];
      const seen = new Set(rows.map((r) => r.query.toLowerCase()));
      for (const a of agentNames) {
        if (rows.length >= MAX_TRENDING) break;
        if (!seen.has(a.name.toLowerCase())) {
          seen.add(a.name.toLowerCase());
          rows.push({ query: a.name, count: 0 });
        }
      }
    }

    const filtered = rows
      .filter((r) => !isIncompletePhrase(r.query))
      .slice(0, MAX_TRENDING);

    suggestCircuitBreaker.recordSuccess();

    const responseBody = {
      trending: filtered.map((r) => r.query),
    };

    trendingCache.set(CACHE_KEY, responseBody);

    const response = NextResponse.json(responseBody);
    response.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    response.headers.set("X-Cache", "MISS");
    return response;
  } catch (err) {
    console.error("[Search Trending] Error:", err);
    suggestCircuitBreaker.recordFailure();

    const stale = trendingCache.get(CACHE_KEY);
    if (stale) {
      const response = NextResponse.json(stale);
      response.headers.set("X-Cache", "STALE");
      return response;
    }

    return NextResponse.json(
      { error: sanitizeError(err), trending: [] },
      { status: 500 }
    );
  }
}
