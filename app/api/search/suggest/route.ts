import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { db } from "@/lib/db";
import { agents, searchQueries } from "@/lib/db/schema";
import { and, eq, desc, sql, SQL, ilike } from "drizzle-orm";
import { PROTOCOL_LABELS } from "@/components/search/ProtocolBadge";
import { suggestCache, buildCacheKey } from "@/lib/search/cache";
import { checkSearchRateLimit } from "@/lib/search/rate-limit";
import { suggestCircuitBreaker } from "@/lib/search/circuit-breaker";
import { sanitizeForStorage } from "@/lib/search/query-engine";

const SuggestSchema = z.object({
  q: z
    .string()
    .min(2, "Query must be at least 2 characters")
    .max(100)
    .transform((s) => s.trim()),
  limit: z.coerce.number().min(1).max(12).default(8),
});

type SuggestParams = z.infer<typeof SuggestSchema>;

function toPrefixTsQuery(q: string): string {
  const tokens = q
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^\w]/g, ""))
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return "";
  return tokens.map((t) => `${t}:*`).join(" & ");
}

function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, (c) => `\\${c}`);
}

const DESC_TRUNCATE = 80;
const MAX_QUERY_SUGGESTIONS = 8;
const MAX_AGENT_SUGGESTIONS = 3;

const STOPWORDS = new Set([
  "a", "an", "and", "be", "for", "in", "is", "it", "of", "on", "or", "the", "to",
]);

function isIncompletePhrase(text: string): boolean {
  const last = text.trim().toLowerCase().split(/\s+/).pop() ?? "";
  return STOPWORDS.has(last);
}

function sanitizeError(err: unknown): string {
  if (process.env.NODE_ENV !== "production" && err instanceof Error) return err.message;
  return "Suggest temporarily unavailable";
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

  let params: SuggestParams;
  try {
    params = SuggestSchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  } catch (err) {
    if (err instanceof ZodError) {
      const msg = err.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    throw err;
  }

  // Sanitize input
  params = { ...params, q: sanitizeForStorage(params.q) };

  // Cache check
  const cacheKey = buildCacheKey({ endpoint: "suggest", q: params.q, limit: params.limit });
  const cached = suggestCache.get(cacheKey);
  if (cached) {
    const response = NextResponse.json(cached);
    response.headers.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
    response.headers.set("X-Cache", "HIT");
    return response;
  }

  // Circuit breaker
  if (!suggestCircuitBreaker.isAllowed()) {
    return NextResponse.json(
      { querySuggestions: [], agentSuggestions: [] },
      { status: 503, headers: { "Retry-After": "15" } }
    );
  }

  try {
    const qLower = params.q.toLowerCase();
    const esc = escapeLike(params.q);

    // --- Tier 1: Popular search completions from search_queries table ---
    const popularCompletions = await db
      .select({
        query: searchQueries.query,
        count: searchQueries.count,
      })
      .from(searchQueries)
      .where(
        and(
          ilike(searchQueries.normalizedQuery, `${escapeLike(qLower)}%`),
        )
      )
      .orderBy(desc(searchQueries.count))
      .limit(MAX_QUERY_SUGGESTIONS);

    // --- Tier 2: Agent name prefix completions ---
    const nameCompletionRows = await db
      .select({ name: agents.name })
      .from(agents)
      .where(
        and(
          eq(agents.status, "ACTIVE"),
          sql`(${agents.name} ILIKE ${esc + "%"} OR ${agents.name} ILIKE ${"% " + esc + "%"})`,
        )
      )
      .orderBy(desc(agents.overallRank))
      .limit(10);

    // --- Tier 3: Capability/protocol completions ---
    const prefixQuery = toPrefixTsQuery(params.q);
    const pattern = `%${esc}%`;

    const tsPart = prefixQuery.length > 0
      ? sql`search_vector @@ to_tsquery('english', ${prefixQuery})`
      : sql`FALSE`;

    const searchCondition = sql`(
      ${tsPart}
      OR ${agents.name} ILIKE ${esc + "%"}
      OR ${agents.name} ILIKE ${"% " + esc + "%"}
      OR (${agents.description} IS NOT NULL AND ${agents.description} ILIKE ${pattern})
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(coalesce(${agents.capabilities}, '[]'::jsonb)) = 'array'
               THEN ${agents.capabilities} ELSE '[]'::jsonb END
        ) AS cap
        WHERE cap ILIKE ${pattern}
      )
    )` as SQL;

    const matchingRows = await db
      .select({
        id: agents.id,
        name: agents.name,
        slug: agents.slug,
        description: agents.description,
        protocols: agents.protocols,
        capabilities: agents.capabilities,
      })
      .from(agents)
      .where(and(eq(agents.status, "ACTIVE"), searchCondition))
      .orderBy(desc(agents.overallRank), desc(agents.createdAt))
      .limit(30);

    const agentSuggestions = matchingRows.slice(0, MAX_AGENT_SUGGESTIONS).map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description
        ? r.description.length > DESC_TRUNCATE
          ? r.description.slice(0, DESC_TRUNCATE) + "\u2026"
          : r.description
        : null,
      protocols: Array.isArray(r.protocols) ? r.protocols : [],
    }));

    const seen = new Set<string>();
    const querySuggestions: string[] = [];

    const addSuggestion = (text: string) => {
      const key = text.toLowerCase().trim();
      if (key.length < 2 || seen.has(key) || key === qLower) return;
      if (STOPWORDS.has(key)) return;
      if (isIncompletePhrase(text)) return;
      if (qLower.includes(key) && key.length < 8) return;
      seen.add(key);
      querySuggestions.push(text.trim());
    };

    for (const row of popularCompletions) {
      if (querySuggestions.length >= MAX_QUERY_SUGGESTIONS) break;
      addSuggestion(row.query);
    }

    for (const row of nameCompletionRows) {
      if (querySuggestions.length >= MAX_QUERY_SUGGESTIONS) break;
      addSuggestion(row.name);
    }

    const capSet = new Set<string>();
    for (const r of matchingRows) {
      const caps = Array.isArray(r.capabilities) ? r.capabilities : [];
      for (const c of caps) {
        if (typeof c === "string" && c.length >= 2) {
          const normalized = c.toLowerCase().trim();
          if (STOPWORDS.has(normalized)) continue;
          if (qLower.includes(normalized)) continue;
          if (normalized.includes(qLower)) capSet.add(c.trim());
        }
      }
    }
    const sortedCaps = [...capSet].sort((a, b) => a.length - b.length);
    for (const cap of sortedCaps) {
      if (querySuggestions.length >= MAX_QUERY_SUGGESTIONS) break;
      addSuggestion(cap);
    }

    const protoSet = new Set<string>();
    for (const r of matchingRows) {
      const protos = Array.isArray(r.protocols) ? r.protocols : [];
      for (const p of protos) {
        if (typeof p === "string" && p.length >= 2) {
          protoSet.add(p);
        }
      }
    }
    for (const proto of protoSet) {
      if (querySuggestions.length >= MAX_QUERY_SUGGESTIONS) break;
      const label = PROTOCOL_LABELS[proto] ?? proto;
      addSuggestion(`${params.q} ${label}`);
    }

    suggestCircuitBreaker.recordSuccess();

    const responseBody = {
      querySuggestions: querySuggestions.slice(0, MAX_QUERY_SUGGESTIONS),
      agentSuggestions,
    };

    suggestCache.set(cacheKey, responseBody);

    const response = NextResponse.json(responseBody);
    response.headers.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
    response.headers.set("X-Cache", "MISS");
    return response;
  } catch (err) {
    console.error("[Search Suggest] Error:", err);
    suggestCircuitBreaker.recordFailure();

    const stale = suggestCache.get(cacheKey);
    if (stale) {
      const response = NextResponse.json(stale);
      response.headers.set("X-Cache", "STALE");
      return response;
    }

    return NextResponse.json(
      { error: sanitizeError(err), querySuggestions: [], agentSuggestions: [] },
      { status: 500 }
    );
  }
}
