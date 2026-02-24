import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { db } from "@/lib/db";
import { agents, searchQueries } from "@/lib/db/schema";
import { and, eq, gte, desc, sql, SQL } from "drizzle-orm";
import {
  processQuery,
  sanitizeForStorage,
  findDidYouMean,
} from "@/lib/search/query-engine";
import { searchResultsCache, buildCacheKey } from "@/lib/search/cache";
import { checkSearchRateLimit } from "@/lib/search/rate-limit";
import { searchCircuitBreaker } from "@/lib/search/circuit-breaker";

let hasSearchClaimColumnsCache: boolean | null = null;

function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, (c) => `\\${c}`);
}

const SearchSchema = z.object({
  q: z.string().max(500).optional(),
  protocols: z
    .string()
    .optional()
    .transform((s) =>
      s
        ? s
            .split(",")
            .map((p) => p.trim().toUpperCase().replace(/^OPENCLAW$/i, "OPENCLEW"))
            .filter(Boolean)
        : []
    ),
  capabilities: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(",").filter(Boolean) : [])),
  minSafety: z.coerce.number().min(0).max(100).optional(),
  minRank: z.coerce.number().min(0).max(100).optional(),
  sort: z.enum(["rank", "safety", "popularity", "freshness"]).default("rank"),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(30),
  includePending: z
    .string()
    .optional()
    .transform((s) => s === "1" || s === "true"),
});

type SearchParams = z.infer<typeof SearchSchema>;

function buildConditions(params: SearchParams, fieldFilters?: Record<string, string | undefined>): SQL[] {
  const conditions: SQL[] = [];
  if (params.includePending) {
    conditions.push(sql`${agents.status} IN ('ACTIVE', 'PENDING_REVIEW')`);
  } else {
    conditions.push(eq(agents.status, "ACTIVE") as unknown as SQL);
  }
  if (params.minSafety != null) {
    conditions.push(gte(agents.safetyScore, params.minSafety) as unknown as SQL);
  }
  if (params.minRank != null) {
    conditions.push(gte(agents.overallRank, params.minRank) as unknown as SQL);
  }

  // Merge explicit protocol params with inline operator filters
  const protocolList = [...params.protocols];
  if (fieldFilters?.protocol && !protocolList.includes(fieldFilters.protocol)) {
    protocolList.push(fieldFilters.protocol);
  }
  if (protocolList.length > 0) {
    conditions.push(
      sql`${agents.protocols} ?| ARRAY[${sql.join(
        protocolList.map((p) => sql`${p}`),
        sql`, `
      )}]::text[]`
    );
  }

  const capList = [...params.capabilities];
  if (capList.length > 0) {
    const caps = capList.map((c) => c.toLowerCase());
    conditions.push(
      sql`${agents.capabilities} ?| ARRAY[${sql.join(
        caps.map((c) => sql`${c}`),
        sql`, `
      )}]::text[]`
    );
  }

  // Field operator: lang:python
  if (fieldFilters?.lang) {
    const langPattern = `%${escapeLike(fieldFilters.lang)}%`;
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(coalesce(${agents.languages}, '[]'::jsonb)) = 'array'
               THEN ${agents.languages} ELSE '[]'::jsonb END
        ) AS lang WHERE lower(lang) ILIKE ${langPattern}
      )`
    );
  }

  // Field operator: safety:>80
  if (fieldFilters?.safety) {
    const safetyVal = parseInt(fieldFilters.safety.replace(/[><=]/g, ""), 10);
    if (!isNaN(safetyVal)) {
      conditions.push(gte(agents.safetyScore, safetyVal) as unknown as SQL);
    }
  }

  // Field operator: source:github
  if (fieldFilters?.source) {
    const srcPattern = `%${escapeLike(fieldFilters.source)}%`;
    conditions.push(sql`${agents.source} ILIKE ${srcPattern}`);
  }

  return conditions;
}

/**
 * Build text search condition using websearch_to_tsquery for Google-like
 * operator support, with ILIKE fallback for broader recall.
 */
function buildTextCondition(textQuery: string, websearchInput: string): SQL {
  const escaped = escapeLike(textQuery);
  const pattern = `%${escaped}%`;

  // Use websearch_to_tsquery for full operator support (phrases, exclusions, OR)
  // Fall back to plainto_tsquery if websearch_to_tsquery fails (malformed input)
  const tsCondition = websearchInput.length > 0
    ? sql`search_vector @@ websearch_to_tsquery('english', ${websearchInput})`
    : sql`search_vector @@ plainto_tsquery('english', ${textQuery})`;

  return sql`(
    ${tsCondition}
    OR ${agents.name} ILIKE ${pattern}
    OR (${agents.description} IS NOT NULL AND ${agents.description} ILIKE ${pattern})
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(coalesce(${agents.capabilities}, '[]'::jsonb)) = 'array'
             THEN ${agents.capabilities} ELSE '[]'::jsonb END
      ) AS cap
      WHERE cap ILIKE ${pattern}
    )
  )`;
}

function trackSearchQuery(query: string) {
  const sanitized = sanitizeForStorage(query);
  const normalized = sanitized.toLowerCase().trim();
  if (normalized.length < 2 || normalized.length > 200) return;
  db.execute(
    sql`INSERT INTO search_queries (id, query, normalized_query, count, last_searched_at, created_at)
        VALUES (gen_random_uuid(), ${sanitized}, ${normalized}, 1, now(), now())
        ON CONFLICT (normalized_query)
        DO UPDATE SET count = search_queries.count + 1,
                      last_searched_at = now(),
                      query = CASE WHEN length(${sanitized}) > 0 THEN ${sanitized} ELSE search_queries.query END`
  ).catch((err) => console.error("[Search Track] Error:", err));
}

function sanitizeError(err: unknown): string {
  if (process.env.NODE_ENV !== "production" && err instanceof Error) return err.message;
  return "Search temporarily unavailable";
}

function isMissingSearchClaimColumnsError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('column "verification_tier" does not exist') ||
    msg.includes('column "claim_status" does not exist') ||
    msg.includes('column "has_custom_page" does not exist')
  );
}

export async function GET(req: NextRequest) {
  // --- Rate limiting ---
  const rlResult = await checkSearchRateLimit(req);
  if (!rlResult.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rlResult.retryAfter ?? 60),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  // --- Input validation ---
  let params: SearchParams;
  try {
    params = SearchSchema.parse(
      Object.fromEntries(req.nextUrl.searchParams)
    );
  } catch (err) {
    if (err instanceof ZodError) {
      const msg = err.errors
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join("; ");
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    throw err;
  }

  // --- Cache check ---
  const cacheKey = buildCacheKey({
    q: params.q ?? "",
    protocols: params.protocols.join(","),
    capabilities: params.capabilities.join(","),
    minSafety: params.minSafety ?? "",
    minRank: params.minRank ?? "",
    sort: params.sort,
    cursor: params.cursor ?? "",
    limit: params.limit,
    includePending: params.includePending,
  });

  const cached = searchResultsCache.get(cacheKey);
  if (cached) {
    const response = NextResponse.json(cached);
    response.headers.set(
      "Cache-Control",
      "public, s-maxage=30, stale-while-revalidate=60"
    );
    response.headers.set("X-Cache", "HIT");
    return response;
  }

  // --- Circuit breaker check ---
  if (!searchCircuitBreaker.isAllowed()) {
    return NextResponse.json(
      {
        results: [],
        pagination: { hasMore: false, nextCursor: null, total: 0 },
        facets: { protocols: [] },
        error: "Search is temporarily degraded. Please try again shortly.",
      },
      { status: 503, headers: { "Retry-After": "30" } }
    );
  }

  try {
    // --- Query processing pipeline ---
    const rawQuery = params.q?.trim() ?? "";
    let textQuery = rawQuery;
    let websearchInput = rawQuery;
    let fieldFilters: Record<string, string | undefined> = {};

    if (rawQuery) {
      const processed = processQuery(rawQuery);
      textQuery = processed.parsed.textQuery;
      websearchInput = processed.websearchInput;
      fieldFilters = processed.parsed.fieldFilters;
    }

    const useRelevance = !!textQuery && params.sort === "rank";
    if (rawQuery) trackSearchQuery(rawQuery);

    const filterConditions = buildConditions(params, fieldFilters);
    const conditions: SQL[] = [...filterConditions];
    if (textQuery) {
      conditions.push(buildTextCondition(textQuery, websearchInput));
    }

    const sortCol =
      params.sort === "rank"
        ? agents.overallRank
        : params.sort === "safety"
          ? agents.safetyScore
          : params.sort === "popularity"
            ? agents.popularityScore
            : agents.freshnessScore;

    const limit = params.limit + 1;
    const allConditions = [...conditions];
    const homepagePriority = sql`CASE WHEN ${agents.homepage} IS NOT NULL AND ${agents.homepage} != '' THEN 1 ELSE 0 END`;

    // --- Cursor pagination ---
    if (params.cursor) {
      if (useRelevance) {
        const cursorRows = await db.execute(
          sql`SELECT
                CASE WHEN homepage IS NOT NULL AND homepage != '' THEN 1 ELSE 0 END AS has_homepage,
                ts_rank(search_vector, websearch_to_tsquery('english', ${websearchInput})) AS relevance,
                overall_rank,
                created_at,
                id
              FROM agents
              WHERE id = ${params.cursor}::uuid
              LIMIT 1`
        );
        const cr = (cursorRows as unknown as { rows?: Array<Record<string, unknown>> }).rows?.[0];
        if (cr) {
          allConditions.push(
            sql`(
              ${homepagePriority},
              ts_rank(search_vector, websearch_to_tsquery('english', ${websearchInput})),
              ${agents.overallRank},
              ${agents.createdAt},
              ${agents.id}
            ) < (
              ${Number(cr.has_homepage)},
              ${Number(cr.relevance)},
              ${Number(cr.overall_rank)},
              ${(cr.created_at as Date) ?? new Date(0)},
              ${params.cursor}
            )`
          );
        }
      } else {
        const [cursorRow] = await db
          .select({
            homepage: agents.homepage,
            overallRank: agents.overallRank,
            safetyScore: agents.safetyScore,
            popularityScore: agents.popularityScore,
            freshnessScore: agents.freshnessScore,
            createdAt: agents.createdAt,
          })
          .from(agents)
          .where(eq(agents.id, params.cursor))
          .limit(1);
        if (cursorRow) {
          const cursorHasHomepage = cursorRow.homepage ? 1 : 0;
          const cv =
            params.sort === "rank"
              ? cursorRow.overallRank
              : params.sort === "safety"
                ? cursorRow.safetyScore
                : params.sort === "popularity"
                  ? cursorRow.popularityScore
                  : cursorRow.freshnessScore;
          const cd = cursorRow.createdAt ?? new Date(0);
          allConditions.push(
            sql`(${homepagePriority}, ${sortCol}, ${agents.createdAt}, ${agents.id}) < (${cursorHasHomepage}, ${cv}, ${cd}, ${params.cursor})`
          );
        }
      }
    }

    // --- Main query with ts_headline snippets ---
    async function runMainQuery(
      includeClaimColumns: boolean
    ): Promise<Array<Record<string, unknown>>> {
      const claimCols = includeClaimColumns
        ? sql`claim_status, verification_tier, has_custom_page,`
        : sql`'UNCLAIMED'::varchar AS claim_status, 'NONE'::varchar AS verification_tier, false::boolean AS has_custom_page,`;

      if (useRelevance) {
        const rawResult = await db.execute(
          sql`SELECT
                id, name, slug, description, url, homepage, source, source_id,
                capabilities, protocols, safety_score, popularity_score,
                freshness_score, overall_rank, github_data, npm_data,
                languages, created_at, ${claimCols}
                ts_rank(search_vector, websearch_to_tsquery('english', ${websearchInput})) AS relevance,
                ts_headline('english', coalesce(description, ''),
                  websearch_to_tsquery('english', ${websearchInput}),
                  'MaxWords=35, MinWords=15, StartSel=<mark>, StopSel=</mark>'
                ) AS snippet,
                count(*) OVER() AS total_count
              FROM agents
              WHERE ${and(...allConditions)}
              ORDER BY
                CASE WHEN homepage IS NOT NULL AND homepage != '' THEN 1 ELSE 0 END DESC,
                relevance DESC, overall_rank DESC, created_at DESC, id DESC
              LIMIT ${limit}`
        );
        return (rawResult as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? [];
      }

      const rawResult = await db.execute(
        sql`SELECT
              id, name, slug, description, url, homepage, source, source_id,
              capabilities, protocols, safety_score, popularity_score,
              freshness_score, overall_rank, github_data, npm_data,
              languages, created_at, ${claimCols}
              ${textQuery
                ? sql`ts_headline('english', coalesce(description, ''),
                    plainto_tsquery('english', ${textQuery}),
                    'MaxWords=35, MinWords=15, StartSel=<mark>, StopSel=</mark>'
                  ) AS snippet,`
                : sql`NULL AS snippet,`}
              count(*) OVER() AS total_count
            FROM agents
            WHERE ${and(...allConditions)}
            ORDER BY
              CASE WHEN homepage IS NOT NULL AND homepage != '' THEN 1 ELSE 0 END DESC,
              ${sortCol === agents.overallRank
                ? sql`overall_rank DESC`
                : sortCol === agents.safetyScore
                  ? sql`safety_score DESC`
                  : sortCol === agents.popularityScore
                    ? sql`popularity_score DESC`
                    : sql`freshness_score DESC`},
              created_at DESC, id DESC
            LIMIT ${limit}`
      );
      return (rawResult as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? [];
    }

    let rows: Array<Record<string, unknown>>;
    const tryExtendedCols = hasSearchClaimColumnsCache !== false;
    try {
      rows = await runMainQuery(tryExtendedCols);
      if (tryExtendedCols) hasSearchClaimColumnsCache = true;
    } catch (mainQueryErr) {
      if (tryExtendedCols && isMissingSearchClaimColumnsError(mainQueryErr)) {
        hasSearchClaimColumnsCache = false;
        rows = await runMainQuery(false);
      } else {
        throw mainQueryErr;
      }
    }

    // Extract total from window function (avoids separate count query)
    const totalFromWindow = rows.length > 0 ? Number(rows[0].total_count ?? 0) : 0;
    const hasMore = rows.length > params.limit;
    const resultRows = hasMore ? rows.slice(0, -1) : rows;

    // --- Diversify results: max 2 from same source in top 10 ---
    const diversified = diversifyResults(resultRows);

    const results = diversified.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      slug: r.slug as string,
      description: r.description as string | null,
      snippet: (r.snippet as string | null) || null,
      url: r.url as string,
      homepage: r.homepage as string | null,
      source: r.source as string,
      sourceId: r.source_id as string,
      capabilities: r.capabilities as string[] | null,
      protocols: r.protocols as string[] | null,
      safetyScore: r.safety_score as number,
      popularityScore: r.popularity_score as number,
      freshnessScore: r.freshness_score as number,
      overallRank: r.overall_rank as number,
      githubData: r.github_data as Record<string, unknown> | null,
      npmData: r.npm_data as Record<string, unknown> | null,
      languages: r.languages as string[] | null,
      claimStatus: (r.claim_status as string | null) ?? "UNCLAIMED",
      verificationTier: (r.verification_tier as string | null) ?? "NONE",
      hasCustomPage: Boolean(r.has_custom_page),
      createdAt: r.created_at as Date | null,
    }));

    const nextCursor = hasMore
      ? (resultRows[resultRows.length - 1]?.id as string) ?? null
      : null;

    // --- Facets (single query, not separate) ---
    const facets = await getFacets(conditions);

    // --- "Did you mean?" when few or no results ---
    let didYouMean: string | null = null;
    if (rawQuery && results.length < 3) {
      didYouMean = await findDidYouMean(rawQuery);
    }

    searchCircuitBreaker.recordSuccess();

    const responseBody = {
      results,
      pagination: { hasMore, nextCursor, total: totalFromWindow },
      facets,
      ...(didYouMean ? { didYouMean } : {}),
    };

    // Store in cache
    searchResultsCache.set(cacheKey, responseBody);

    const response = NextResponse.json(responseBody);
    response.headers.set(
      "Cache-Control",
      "public, s-maxage=30, stale-while-revalidate=60"
    );
    response.headers.set("X-Cache", "MISS");
    if (rlResult.remaining != null) {
      response.headers.set(
        "X-RateLimit-Remaining",
        String(rlResult.remaining)
      );
    }
    return response;
  } catch (err) {
    console.error("[Search] Error:", err);
    searchCircuitBreaker.recordFailure();

    // Graceful degradation: try to serve from cache
    const staleCache = searchResultsCache.get(cacheKey);
    if (staleCache) {
      const response = NextResponse.json({
        ...(staleCache as Record<string, unknown>),
        _stale: true,
      });
      response.headers.set("X-Cache", "STALE");
      return response;
    }

    return NextResponse.json(
      {
        error: sanitizeError(err),
        results: [],
        pagination: { hasMore: false, nextCursor: null, total: 0 },
        facets: { protocols: [] },
      },
      { status: 500 }
    );
  }
}

async function getFacets(conditions: SQL[]) {
  const result = await db.execute(
    sql`
      SELECT elem AS protocol, count(*)::text AS count
      FROM agents, jsonb_array_elements_text(agents.protocols) AS elem
      WHERE ${and(...conditions)}
      GROUP BY elem
      ORDER BY count DESC
    `
  );
  const rows = (
    result as unknown as { rows?: Array<{ protocol: string; count: string }> }
  ).rows ?? [];
  const protocols = rows.map((r) => ({
    protocol: [r.protocol],
    count: parseInt(r.count, 10) || 0,
  }));
  return { protocols };
}

/**
 * Diversifies results to prevent a single source from dominating.
 * In the top 10 positions, max 2 results from the same source.
 * Beyond position 10, no limit.
 */
function diversifyResults(
  rows: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  if (rows.length <= 2) return rows;

  const MAX_PER_SOURCE_IN_TOP = 2;
  const TOP_N = 10;
  const sourceCounts = new Map<string, number>();
  const diversified: Array<Record<string, unknown>> = [];
  const deferred: Array<Record<string, unknown>> = [];

  for (const row of rows) {
    const source = (row.source as string) ?? "unknown";
    const currentCount = sourceCounts.get(source) ?? 0;

    if (diversified.length < TOP_N && currentCount >= MAX_PER_SOURCE_IN_TOP) {
      deferred.push(row);
    } else {
      diversified.push(row);
      sourceCounts.set(source, currentCount + 1);
    }
  }

  return [...diversified, ...deferred];
}
