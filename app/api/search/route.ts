import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { db } from "@/lib/db";
import {
  agents,
  searchQueries,
  searchOutcomes,
  agentExecutionMetrics,
  agentCapabilityContracts,
} from "@/lib/db/schema";
import { and, eq, gte, lte, desc, sql, SQL } from "drizzle-orm";
import {
  processQuery,
  sanitizeForStorage,
  findDidYouMean,
  parseSafetyFilter,
} from "@/lib/search/query-engine";
import { searchResultsCache, buildCacheKey } from "@/lib/search/cache";
import {
  checkSearchRateLimit,
  SEARCH_ANON_RATE_LIMIT,
  SEARCH_AUTH_RATE_LIMIT,
} from "@/lib/search/rate-limit";
import { searchCircuitBreaker } from "@/lib/search/circuit-breaker";
import { hashQuery } from "@/lib/search/click-tracking";
import { getEngagementParams, getRankingWeights } from "@/lib/search/scoring/hybrid-rank";
import { getAuthUser } from "@/lib/auth-utils";
import { isAdmin } from "@/lib/admin";
import {
  buildDelegationHints,
  buildFallbacks,
  buildQuerySignature,
  computePolicyMatch,
  computeRankingSignals,
  isHardBlocked,
  normalizeTokens,
  type ExecuteParams,
} from "@/lib/search/execute-mode";

let hasSearchClaimColumnsCache: boolean | null = null;
let hasSearchClicksTableCache: boolean | null = null;
let hasSearchOutcomesTableCache: boolean | null = null;
let hasAgentExecutionMetricsTableCache: boolean | null = null;
let hasAgentCapabilityContractsTableCache: boolean | null = null;

function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, (c) => `\\${c}`);
}

function toExternalProtocolName(protocol: unknown): string {
  if (typeof protocol !== "string") return "";
  if (protocol.toUpperCase() === "OPENCLEW") return "OPENCLAW";
  return protocol;
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
            .map((p) => {
              const normalized = p.trim().toUpperCase();
              if (normalized === "OPENCLAW") return "OPENCLEW";
              return normalized;
            })
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
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(100).default(30),
  includePending: z
    .string()
    .optional()
    .transform((s) => s === "1" || s === "true"),
  includePrivate: z
    .string()
    .optional()
    .transform((s) => s === "1" || s === "true"),
  debug: z
    .string()
    .optional()
    .transform((s) => s === "1" || s === "true"),
  fields: z.enum(["full", "compact"]).default("full"),
  intent: z.enum(["discover", "execute"]).default("discover"),
  taskType: z
    .string()
    .min(1)
    .max(32)
    .optional()
    .transform((s) => (s ? s.trim().toLowerCase() : undefined)),
  maxLatencyMs: z.coerce.number().int().min(1).max(300000).optional(),
  maxCostUsd: z.coerce.number().min(0).max(10000).optional(),
  requires: z
    .string()
    .optional()
    .transform((s) => (s ? normalizeTokens(s.split(",")) : [])),
  forbidden: z
    .string()
    .optional()
    .transform((s) => (s ? normalizeTokens(s.split(",")) : [])),
  dataRegion: z.enum(["us", "eu", "global"]).optional(),
  bundle: z
    .string()
    .optional()
    .transform((s) => s === "1" || s === "true"),
  explain: z
    .string()
    .optional()
    .transform((s) => s === "1" || s === "true"),
});

type SearchParams = z.infer<typeof SearchSchema>;

function buildConditions(params: SearchParams, fieldFilters?: Record<string, string | undefined>): SQL[] {
  const conditions: SQL[] = [];
  if (!params.includePrivate) {
    conditions.push(eq(agents.publicSearchable, true) as unknown as SQL);
  }
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
    const parsedSafety = parseSafetyFilter(fieldFilters.safety);
    if (parsedSafety) {
      if (parsedSafety.operator === ">=") {
        conditions.push(gte(agents.safetyScore, parsedSafety.value) as unknown as SQL);
      } else if (parsedSafety.operator === "<=") {
        conditions.push(lte(agents.safetyScore, parsedSafety.value) as unknown as SQL);
      } else {
        conditions.push(eq(agents.safetyScore, parsedSafety.value) as unknown as SQL);
      }
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
  const normalized = textQuery.toLowerCase();
  const allowFuzzy = normalized.length >= 3;
  const queryTokens = normalized
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !["and", "or", "the", "for", "with", "from", "into"].includes(t));

  // Use websearch_to_tsquery for full operator support (phrases, exclusions, OR)
  // Fall back to plainto_tsquery if websearch_to_tsquery fails (malformed input)
  const tsCondition = websearchInput.length > 0
    ? sql`search_vector @@ websearch_to_tsquery('english', ${websearchInput})`
    : sql`search_vector @@ plainto_tsquery('english', ${textQuery})`;

  const tokenRecallCondition = queryTokens.length > 1
    ? sql`(
      ${sql.join(
        queryTokens.map((token) => {
          const tokenPattern = `%${escapeLike(token)}%`;
          return sql`(
            ${agents.name} ILIKE ${tokenPattern}
            OR (${agents.description} IS NOT NULL AND ${agents.description} ILIKE ${tokenPattern})
            OR EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(
                CASE WHEN jsonb_typeof(coalesce(${agents.capabilities}, '[]'::jsonb)) = 'array'
                     THEN ${agents.capabilities} ELSE '[]'::jsonb END
              ) AS cap
              WHERE cap ILIKE ${tokenPattern}
            )
            OR EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(
                CASE WHEN jsonb_typeof(coalesce(${agents.languages}, '[]'::jsonb)) = 'array'
                     THEN ${agents.languages} ELSE '[]'::jsonb END
              ) AS lang
              WHERE lang ILIKE ${tokenPattern}
            )
          )`;
        }),
        sql` AND `
      )}
    )`
    : sql`FALSE`;

  return sql`(
    ${tsCondition}
    OR ${tokenRecallCondition}
    OR (${allowFuzzy} AND lower(${agents.name}) % ${normalized})
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

function isMissingSearchClicksTableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes('relation "search_clicks" does not exist');
}

function isHybridRankingEnabled(): boolean {
  return process.env.SEARCH_HYBRID_RANKING === "1";
}

function shouldLogRanking() {
  const mode = (process.env.SEARCH_RANK_LOG_MODE ?? "sample").toLowerCase();
  if (mode === "off") return false;
  if (mode === "all") return true;
  const rate = Number(process.env.SEARCH_RANK_LOG_SAMPLE_RATE ?? "0.02");
  if (!Number.isFinite(rate) || rate <= 0) return false;
  return Math.random() < Math.min(rate, 1);
}

function shouldIncludeDebugHeaders() {
  if (process.env.SEARCH_DEBUG_HEADERS === "1") return true;
  return process.env.NODE_ENV !== "production";
}

async function hasSearchClicksTable(): Promise<boolean> {
  if (hasSearchClicksTableCache != null) return hasSearchClicksTableCache;
  try {
    const result = await db.execute(sql`SELECT to_regclass('public.search_clicks') AS regclass`);
    const row = (result as unknown as { rows?: Array<{ regclass?: string | null }> }).rows?.[0];
    hasSearchClicksTableCache = Boolean(row?.regclass);
    return hasSearchClicksTableCache;
  } catch {
    hasSearchClicksTableCache = false;
    return false;
  }
}

async function hasTable(
  tableName: string,
  cacheValue: boolean | null
): Promise<boolean> {
  if (cacheValue != null) return cacheValue;
  try {
    const result = await db.execute(sql`SELECT to_regclass(${`public.${tableName}`}) AS regclass`);
    const row = (result as unknown as { rows?: Array<{ regclass?: string | null }> }).rows?.[0];
    return Boolean(row?.regclass);
  } catch {
    return false;
  }
}

async function hasSearchOutcomesTable() {
  const value = await hasTable("search_outcomes", hasSearchOutcomesTableCache);
  hasSearchOutcomesTableCache = value;
  return value;
}

async function hasAgentExecutionMetricsTable() {
  const value = await hasTable("agent_execution_metrics", hasAgentExecutionMetricsTableCache);
  hasAgentExecutionMetricsTableCache = value;
  return value;
}

async function hasAgentCapabilityContractsTable() {
  const value = await hasTable(
    "agent_capability_contracts",
    hasAgentCapabilityContractsTableCache
  );
  hasAgentCapabilityContractsTableCache = value;
  return value;
}

export async function GET(req: NextRequest) {
  // --- Rate limiting ---
  const authProbe = await getAuthUser(req);
  const authUser = "error" in authProbe ? null : authProbe.user;
  const isAuthenticated = Boolean(authUser);
  const rateLimitLimit = isAuthenticated
    ? SEARCH_AUTH_RATE_LIMIT
    : SEARCH_ANON_RATE_LIMIT;
  const rlResult = await checkSearchRateLimit(req, isAuthenticated);
  if (!rlResult.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rlResult.retryAfter ?? 60),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Limit": String(rateLimitLimit),
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

  if (params.includePending || params.includePrivate) {
    if (!authUser || !isAdmin(authUser)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
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
    includePrivate: params.includePrivate,
    debug: params.debug,
    fields: params.fields,
    intent: params.intent,
    taskType: params.taskType ?? "",
    maxLatencyMs: params.maxLatencyMs ?? "",
    maxCostUsd: params.maxCostUsd ?? "",
    requires: params.requires.join(","),
    forbidden: params.forbidden.join(","),
    dataRegion: params.dataRegion ?? "",
    bundle: Boolean(params.bundle),
    explain: Boolean(params.explain),
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
    const useHybridRanking = useRelevance && isHybridRankingEnabled();
    const rankingWeights = getRankingWeights();
    const engagement = getEngagementParams();
    const queryHash = rawQuery ? hashQuery(textQuery || rawQuery) : "";
    const includeRankingDebug =
      Boolean(params.debug) && process.env.NODE_ENV !== "production";
    const executeParams: ExecuteParams = {
      intent: params.intent,
      taskType: params.taskType,
      maxLatencyMs: params.maxLatencyMs,
      maxCostUsd: params.maxCostUsd,
      requires: params.requires,
      forbidden: params.forbidden,
      dataRegion: params.dataRegion,
      bundle: Boolean(params.bundle),
      explain: Boolean(params.explain),
    };
    const querySignature = buildQuerySignature({
      q: textQuery || rawQuery,
      taskType: params.taskType,
      requires: params.requires,
      forbidden: params.forbidden,
    });
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
                (
                  ts_rank(search_vector, websearch_to_tsquery('english', ${websearchInput}))
                  + CASE WHEN lower(name) = lower(${textQuery}) THEN 0.4 ELSE 0 END
                  + CASE WHEN lower(name) LIKE lower(${`${textQuery}%`}) THEN 0.2 ELSE 0 END
                  + CASE WHEN lower(name) % lower(${textQuery}) THEN similarity(lower(name), lower(${textQuery})) * 0.12 ELSE 0 END
                ) AS relevance,
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
              (
                ts_rank(search_vector, websearch_to_tsquery('english', ${websearchInput}))
                + CASE WHEN lower(${agents.name}) = lower(${textQuery}) THEN 0.4 ELSE 0 END
                + CASE WHEN lower(${agents.name}) LIKE lower(${`${textQuery}%`}) THEN 0.2 ELSE 0 END
                + CASE WHEN lower(${agents.name}) % lower(${textQuery}) THEN similarity(lower(${agents.name}), lower(${textQuery})) * 0.12 ELSE 0 END
              ),
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
      ,
      includeEngagementJoin: boolean
    ): Promise<Array<Record<string, unknown>>> {
      const claimCols = includeClaimColumns
        ? sql`claim_status, verification_tier, has_custom_page,`
        : sql`'UNCLAIMED'::varchar AS claim_status, 'NONE'::varchar AS verification_tier, false::boolean AS has_custom_page,`;
      const engagementScoreExpr = includeEngagementJoin
        ? sql`COALESCE(
                    LEAST(
                      1.0,
                      GREATEST(
                        0.0,
                        (
                          (
                            COALESCE(qc.clicks, gc.clicks, 0)::float + (${engagement.priorMean} * ${engagement.priorStrength})
                          ) / (
                            COALESCE(qc.impressions, gc.impressions, 0)::float + ${engagement.priorStrength}
                          )
                        ) * LEAST(1.0, COALESCE(qc.impressions, gc.impressions, 0)::float / ${engagement.confidenceImpressions}) * ${engagement.scoreScale}
                      )
                    ),
                    0
                  )`
        : sql`0::double precision`;
      const queryHashValue = queryHash;

      if (useRelevance) {
        const escapedText = escapeLike(textQuery);
        const prefixPattern = `${escapedText}%`;
        const containsPattern = `%${escapedText}%`;
        const rawResult = await db.execute(
          sql`WITH base AS (
                SELECT
                  id, name, slug, description, url, homepage, source, source_id,
                  capabilities, protocols, canonical_agent_id,
                  safety_score, popularity_score, freshness_score, overall_rank, github_data, npm_data,
                  languages, created_at, ${claimCols}
                  (
                    ts_rank(search_vector, websearch_to_tsquery('english', ${websearchInput}))
                    + CASE WHEN lower(name) = lower(${textQuery}) THEN 0.35 ELSE 0 END
                    + CASE WHEN lower(name) LIKE lower(${prefixPattern}) THEN 0.2 ELSE 0 END
                    + CASE WHEN description IS NOT NULL AND description ILIKE ${containsPattern} THEN 0.1 ELSE 0 END
                    + CASE WHEN EXISTS (
                        SELECT 1 FROM jsonb_array_elements_text(
                          CASE WHEN jsonb_typeof(coalesce(capabilities, '[]'::jsonb)) = 'array'
                               THEN capabilities ELSE '[]'::jsonb END
                        ) AS cap
                        WHERE cap ILIKE ${containsPattern}
                      ) THEN 0.08 ELSE 0 END
                    + CASE WHEN EXISTS (
                        SELECT 1 FROM jsonb_array_elements_text(
                          CASE WHEN jsonb_typeof(coalesce(languages, '[]'::jsonb)) = 'array'
                               THEN languages ELSE '[]'::jsonb END
                        ) AS lang
                        WHERE lang ILIKE ${containsPattern}
                      ) THEN 0.04 ELSE 0 END
                    + CASE WHEN lower(name) % lower(${textQuery}) THEN similarity(lower(name), lower(${textQuery})) * 0.08 ELSE 0 END
                  ) AS lexical_score,
                  LEAST(
                    1.0,
                    GREATEST(
                      0.0,
                      COALESCE(overall_rank / 100.0, 0)
                      + CASE
                          WHEN verification_tier = 'GOLD' THEN 0.12
                          WHEN verification_tier = 'SILVER' THEN 0.08
                          WHEN verification_tier = 'BRONZE' THEN 0.04
                          ELSE 0
                        END
                      + CASE WHEN claim_status = 'CLAIMED' THEN 0.03 ELSE 0 END
                      + CASE WHEN has_custom_page THEN 0.02 ELSE 0 END
                    )
                  ) AS authority_score,
                  LEAST(1.0, GREATEST(0.0, COALESCE(freshness_score / 100.0, 0))) AS freshness_score_norm,
                  ${engagementScoreExpr} AS engagement_score,
                  ts_headline('english', coalesce(description, ''),
                    websearch_to_tsquery('english', ${websearchInput}),
                    'MaxWords=35, MinWords=15, StartSel=<mark>, StopSel=</mark>'
                  ) AS snippet
                FROM agents
                ${includeEngagementJoin ? sql`LEFT JOIN (
                  SELECT agent_id, count(*)::int AS clicks, count(*)::int * 5 AS impressions
                  FROM search_clicks
                  WHERE query_hash = ${queryHashValue}
                    AND clicked_at >= now() - interval '30 days'
                  GROUP BY agent_id
                ) qc ON qc.agent_id = agents.id
                LEFT JOIN (
                  SELECT agent_id, count(*)::int AS clicks, count(*)::int * 10 AS impressions
                  FROM search_clicks
                  WHERE clicked_at >= now() - interval '30 days'
                  GROUP BY agent_id
                ) gc ON gc.agent_id = agents.id` : sql``}
                WHERE ${and(...allConditions)}
              )
              SELECT
                *,
                lexical_score AS relevance,
                CASE
                  WHEN ${useHybridRanking}
                    THEN (
                      LEAST(1.0, GREATEST(0.0, lexical_score)) * ${rankingWeights.lexical}
                      + authority_score * ${rankingWeights.authority}
                      + engagement_score * ${rankingWeights.engagement}
                      + freshness_score_norm * ${rankingWeights.freshness}
                    )
                  ELSE lexical_score
                END AS final_score,
                count(*) OVER() AS total_count
              FROM base
              ORDER BY
                CASE WHEN homepage IS NOT NULL AND homepage != '' THEN 1 ELSE 0 END DESC,
                CASE
                  WHEN ${useHybridRanking}
                    THEN (
                      LEAST(1.0, GREATEST(0.0, lexical_score)) * ${rankingWeights.lexical}
                      + authority_score * ${rankingWeights.authority}
                      + engagement_score * ${rankingWeights.engagement}
                      + freshness_score_norm * ${rankingWeights.freshness}
                    )
                  ELSE lexical_score
                END DESC,
                overall_rank DESC, created_at DESC, id DESC
              LIMIT ${limit}`
        );
        return (rawResult as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? [];
      }

      const rawResult = await db.execute(
        sql`SELECT
              id, name, slug, description, url, homepage, source, source_id,
              capabilities, protocols, canonical_agent_id, safety_score, popularity_score,
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
    let includeEngagementJoin = await hasSearchClicksTable();
    try {
      rows = await runMainQuery(tryExtendedCols, includeEngagementJoin);
      if (tryExtendedCols) hasSearchClaimColumnsCache = true;
    } catch (mainQueryErr) {
      if (tryExtendedCols && isMissingSearchClaimColumnsError(mainQueryErr)) {
        hasSearchClaimColumnsCache = false;
        try {
          rows = await runMainQuery(false, includeEngagementJoin);
        } catch (fallbackErr) {
          if (isMissingSearchClicksTableError(fallbackErr)) {
            includeEngagementJoin = false;
            rows = await runMainQuery(false, includeEngagementJoin);
          } else {
            throw fallbackErr;
          }
        }
      } else if (isMissingSearchClicksTableError(mainQueryErr)) {
        includeEngagementJoin = false;
        rows = await runMainQuery(tryExtendedCols, includeEngagementJoin);
        if (tryExtendedCols) hasSearchClaimColumnsCache = true;
      } else {
        throw mainQueryErr;
      }
    }

    // Extract total from window function (avoids separate count query)
    const totalFromWindow = rows.length > 0 ? Number(rows[0].total_count ?? 0) : 0;
    const hasMore = rows.length > params.limit;
    const resultRows = hasMore ? rows.slice(0, -1) : rows;

    // --- Diversify results: max 2 from same source in top 10 ---
    let diversified = diversifyResults(resultRows);
    const agentIds = diversified.map((r) => String(r.id));

    const contractsByAgent = new Map<string, Record<string, unknown>>();
    const metricsByAgent = new Map<string, Record<string, unknown>>();
    const outcomesByAgent = new Map<string, Record<string, unknown>>();
    const constraintDiagnostics: string[] = [];

    if (agentIds.length > 0) {
      if (await hasAgentCapabilityContractsTable()) {
        const rowsResult = await db
          .select({
            agentId: agentCapabilityContracts.agentId,
            authModes: agentCapabilityContracts.authModes,
            requires: agentCapabilityContracts.requires,
            forbidden: agentCapabilityContracts.forbidden,
            dataRegion: agentCapabilityContracts.dataRegion,
            inputSchemaRef: agentCapabilityContracts.inputSchemaRef,
            outputSchemaRef: agentCapabilityContracts.outputSchemaRef,
            supportsStreaming: agentCapabilityContracts.supportsStreaming,
            supportsMcp: agentCapabilityContracts.supportsMcp,
            supportsA2a: agentCapabilityContracts.supportsA2a,
          })
          .from(agentCapabilityContracts)
          .where(sql`${agentCapabilityContracts.agentId} = ANY(${sql.raw(`ARRAY[${agentIds.map((id) => `'${id}'::uuid`).join(",")}]`)})`);
        for (const row of rowsResult) contractsByAgent.set(String(row.agentId), row as unknown as Record<string, unknown>);
      }
      if (await hasAgentExecutionMetricsTable()) {
        const rowsResult = await db
          .select({
            agentId: agentExecutionMetrics.agentId,
            observedLatencyMsP50: agentExecutionMetrics.observedLatencyMsP50,
            observedLatencyMsP95: agentExecutionMetrics.observedLatencyMsP95,
            estimatedCostUsd: agentExecutionMetrics.estimatedCostUsd,
            uptime30d: agentExecutionMetrics.uptime30d,
            rateLimitRpm: agentExecutionMetrics.rateLimitRpm,
            rateLimitBurst: agentExecutionMetrics.rateLimitBurst,
            lastVerifiedAt: agentExecutionMetrics.lastVerifiedAt,
          })
          .from(agentExecutionMetrics)
          .where(sql`${agentExecutionMetrics.agentId} = ANY(${sql.raw(`ARRAY[${agentIds.map((id) => `'${id}'::uuid`).join(",")}]`)})`);
        for (const row of rowsResult) metricsByAgent.set(String(row.agentId), row as unknown as Record<string, unknown>);
      }
      if (await hasSearchOutcomesTable()) {
        const rowsResult = await db
          .select({
            agentId: searchOutcomes.agentId,
            attempts: searchOutcomes.attempts,
            successCount: searchOutcomes.successCount,
            failureCount: searchOutcomes.failureCount,
            timeoutCount: searchOutcomes.timeoutCount,
          })
          .from(searchOutcomes)
          .where(
            and(
              eq(searchOutcomes.querySignature, querySignature),
              eq(searchOutcomes.taskType, params.taskType ?? "general"),
              sql`${searchOutcomes.agentId} = ANY(${sql.raw(`ARRAY[${agentIds.map((id) => `'${id}'::uuid`).join(",")}]`)})`
            )
          );
        for (const row of rowsResult) outcomesByAgent.set(String(row.agentId), row as unknown as Record<string, unknown>);
      }
    }

    if (executeParams.intent === "execute" && executeParams.forbidden.length > 0) {
      const beforeCount = diversified.length;
      diversified = diversified.filter((row) => {
        const agentId = String(row.id);
        const contract = contractsByAgent.get(agentId);
        const metrics = metricsByAgent.get(agentId);
        const policy = computePolicyMatch(
          executeParams,
          contract
            ? {
                authModes: (contract.authModes as string[]) ?? [],
                requires: (contract.requires as string[]) ?? [],
                forbidden: (contract.forbidden as string[]) ?? [],
                dataRegion: (contract.dataRegion as string | null) ?? null,
                inputSchemaRef: (contract.inputSchemaRef as string | null) ?? null,
                outputSchemaRef: (contract.outputSchemaRef as string | null) ?? null,
                supportsStreaming: Boolean(contract.supportsStreaming),
                supportsMcp: Boolean(contract.supportsMcp),
                supportsA2a: Boolean(contract.supportsA2a),
              }
            : null,
          metrics
            ? {
                observedLatencyMsP50: (metrics.observedLatencyMsP50 as number | null) ?? null,
                observedLatencyMsP95: (metrics.observedLatencyMsP95 as number | null) ?? null,
                estimatedCostUsd: (metrics.estimatedCostUsd as number | null) ?? null,
                uptime30d: (metrics.uptime30d as number | null) ?? null,
                rateLimitRpm: (metrics.rateLimitRpm as number | null) ?? null,
                rateLimitBurst: (metrics.rateLimitBurst as number | null) ?? null,
                lastVerifiedAt: (metrics.lastVerifiedAt as Date | null) ?? null,
              }
            : null
        );
        return !isHardBlocked(policy);
      });
      if (beforeCount > 0 && diversified.length === 0) {
        constraintDiagnostics.push("all-candidates-blocked-by-forbidden-constraints");
      }
    }

    const executionDecorated = diversified.map((r) => {
      const agentId = String(r.id);
      const contract = contractsByAgent.get(agentId);
      const metrics = metricsByAgent.get(agentId);
      const outcome = outcomesByAgent.get(agentId);
      const policy = computePolicyMatch(
        executeParams,
        contract
          ? {
              authModes: (contract.authModes as string[]) ?? [],
              requires: (contract.requires as string[]) ?? [],
              forbidden: (contract.forbidden as string[]) ?? [],
              dataRegion: (contract.dataRegion as string | null) ?? null,
              inputSchemaRef: (contract.inputSchemaRef as string | null) ?? null,
              outputSchemaRef: (contract.outputSchemaRef as string | null) ?? null,
              supportsStreaming: Boolean(contract.supportsStreaming),
              supportsMcp: Boolean(contract.supportsMcp),
              supportsA2a: Boolean(contract.supportsA2a),
            }
          : null,
        metrics
          ? {
              observedLatencyMsP50: (metrics.observedLatencyMsP50 as number | null) ?? null,
              observedLatencyMsP95: (metrics.observedLatencyMsP95 as number | null) ?? null,
              estimatedCostUsd: (metrics.estimatedCostUsd as number | null) ?? null,
              uptime30d: (metrics.uptime30d as number | null) ?? null,
              rateLimitRpm: (metrics.rateLimitRpm as number | null) ?? null,
              rateLimitBurst: (metrics.rateLimitBurst as number | null) ?? null,
              lastVerifiedAt: (metrics.lastVerifiedAt as Date | null) ?? null,
            }
          : null
      );
      const ranking = computeRankingSignals(
        Number(r.final_score ?? r.relevance ?? r.overall_rank ?? 0) / 100,
        Number(r.freshness_score ?? 0),
        outcome
          ? {
              attempts: Number(outcome.attempts ?? 0),
              successCount: Number(outcome.successCount ?? 0),
              failureCount: Number(outcome.failureCount ?? 0),
              timeoutCount: Number(outcome.timeoutCount ?? 0),
            }
          : null,
        policy
      );

      return {
        row: r,
        policyMatch: policy,
        rankingSignals: ranking,
        contract,
        metrics,
      };
    });

    if (executeParams.intent === "execute") {
      executionDecorated.sort((a, b) => b.rankingSignals.finalScore - a.rankingSignals.finalScore);
    }

    const executionSlugs = executionDecorated.map((item) => String(item.row.slug));
    const results = executionDecorated.map((item) => {
      const r = item.row;
      const protocolsRaw = Array.isArray(r.protocols) ? (r.protocols as string[]) : null;
      const protocols = protocolsRaw
        ?.map((p) => toExternalProtocolName(p))
        .filter((p) => p.length > 0) ?? null;
      const base = {
        id: r.id as string,
        name: r.name as string,
        slug: r.slug as string,
        description: r.description as string | null,
        snippet: (r.snippet as string | null) || null,
        capabilities: r.capabilities as string[] | null,
        protocols,
        safetyScore: r.safety_score as number,
        popularityScore: r.popularity_score as number,
        freshnessScore: r.freshness_score as number,
        overallRank: r.overall_rank as number,
      };
      const contract = item.contract;
      const metrics = item.metrics;
      const hasExecReady = Boolean(
        contract &&
        Array.isArray(contract.authModes) &&
        (contract.authModes as string[]).length > 0 &&
        ((contract.inputSchemaRef as string | null) || (contract.outputSchemaRef as string | null))
      );
      const agentExecution = {
        authModes: (contract?.authModes as string[] | undefined) ?? [],
        inputSchemaRef: (contract?.inputSchemaRef as string | null | undefined) ?? null,
        outputSchemaRef: (contract?.outputSchemaRef as string | null | undefined) ?? null,
        rateLimit:
          metrics?.rateLimitRpm || metrics?.rateLimitBurst
            ? {
                rpm: (metrics?.rateLimitRpm as number | undefined) ?? undefined,
                burst: (metrics?.rateLimitBurst as number | undefined) ?? undefined,
              }
            : null,
        observedLatencyMsP50: (metrics?.observedLatencyMsP50 as number | null | undefined) ?? null,
        observedLatencyMsP95: (metrics?.observedLatencyMsP95 as number | null | undefined) ?? null,
        estimatedCostUsd: (metrics?.estimatedCostUsd as number | null | undefined) ?? null,
        lastVerifiedAt:
          metrics?.lastVerifiedAt instanceof Date
            ? metrics.lastVerifiedAt.toISOString()
            : null,
        uptime30d: (metrics?.uptime30d as number | null | undefined) ?? null,
        execReady: hasExecReady,
      };
      const fallbacks =
        executeParams.bundle
          ? buildFallbacks(
              executionDecorated.map((entry) => ({
                id: String(entry.row.id),
                slug: String(entry.row.slug),
                policyMatch: entry.policyMatch,
              })),
              String(r.id)
            )
          : undefined;
      const delegationHints = buildDelegationHints(executeParams.taskType, executionSlugs);

      if (params.fields === "compact") {
        return {
          ...base,
          claimStatus: (r.claim_status as string | null) ?? "UNCLAIMED",
          verificationTier: (r.verification_tier as string | null) ?? "NONE",
          ...(executeParams.intent === "execute"
            ? {
                agentExecution,
                policyMatch: item.policyMatch,
                ...(executeParams.bundle ? { fallbacks } : {}),
                delegationHints,
                ...(executeParams.explain ? { rankingSignals: item.rankingSignals } : {}),
              }
            : {}),
        };
      }

      return {
        ...base,
        url: r.url as string,
        homepage: r.homepage as string | null,
        source: r.source as string,
        sourceId: r.source_id as string,
        githubData: r.github_data as Record<string, unknown> | null,
        npmData: r.npm_data as Record<string, unknown> | null,
        languages: r.languages as string[] | null,
        claimStatus: (r.claim_status as string | null) ?? "UNCLAIMED",
        verificationTier: (r.verification_tier as string | null) ?? "NONE",
        hasCustomPage: Boolean(r.has_custom_page),
        createdAt: r.created_at as Date | null,
        ...(executeParams.intent === "execute"
          ? {
              agentExecution,
              policyMatch: item.policyMatch,
              ...(executeParams.bundle ? { fallbacks } : {}),
              delegationHints,
              ...(executeParams.explain ? { rankingSignals: item.rankingSignals } : {}),
            }
          : {}),
        ...(includeRankingDebug
          ? {
              rankingDebug: {
                lexical: Number(r.lexical_score ?? r.relevance ?? 0),
                authority: Number(r.authority_score ?? 0),
                engagement: Number(r.engagement_score ?? 0),
                freshness: Number(r.freshness_score_norm ?? 0),
                finalScore: Number(r.final_score ?? r.relevance ?? 0),
              },
            }
          : {}),
      };
    });

    const nextCursor = hasMore
      ? (executionDecorated[executionDecorated.length - 1]?.row?.id as string) ?? null
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
      ...(constraintDiagnostics.length > 0 ? { constraintDiagnostics } : {}),
      ...(didYouMean ? { didYouMean } : {}),
    };

    if (shouldLogRanking() && rawQuery) {
      console.info(
        "[SearchRank]",
        JSON.stringify({
          query: rawQuery,
          queryHash,
          hybrid: useHybridRanking,
          topIds: results.slice(0, 5).map((r) => r.id),
          weights: rankingWeights,
          engagement,
        })
      );
    }

    // Store in cache
    searchResultsCache.set(cacheKey, responseBody);

    const response = NextResponse.json(responseBody);
    response.headers.set(
      "Cache-Control",
      "public, s-maxage=30, stale-while-revalidate=60"
    );
    response.headers.set("X-Cache", "MISS");
    if (shouldIncludeDebugHeaders()) {
      response.headers.set("X-Search-Ranking", useHybridRanking ? "hybrid" : "lexical");
      response.headers.set(
        "X-Search-Weights",
        `${rankingWeights.lexical.toFixed(3)},${rankingWeights.authority.toFixed(3)},${rankingWeights.engagement.toFixed(3)},${rankingWeights.freshness.toFixed(3)}`
      );
    }
    if (rlResult.remaining != null) {
      response.headers.set(
        "X-RateLimit-Remaining",
        String(rlResult.remaining)
      );
    }
    response.headers.set("X-RateLimit-Limit", String(rateLimitLimit));
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
  const protocols = rows
    .map((r) => ({
      protocol: [toExternalProtocolName(r.protocol)],
      count: parseInt(r.count, 10) || 0,
    }))
    .filter((r) => r.protocol[0].length > 0);
  return { protocols };
}

/**
 * Diversifies results to prevent a single source or canonical duplicate from dominating.
 * In the top 10 positions, max 2 results from the same source and one per canonical id.
 * Beyond position 10, no limit.
 */
function diversifyResults(
  rows: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  if (rows.length <= 2) return rows;

  const MAX_PER_SOURCE_IN_TOP = 2;
  const TOP_N = 10;
  const sourceCounts = new Map<string, number>();
  const seenCanonical = new Set<string>();
  const diversified: Array<Record<string, unknown>> = [];
  const deferred: Array<Record<string, unknown>> = [];

  for (const row of rows) {
    const source = (row.source as string) ?? "unknown";
    const currentCount = sourceCounts.get(source) ?? 0;
    const canonicalId = (row.canonical_agent_id as string | null) ?? null;
    const canonicalKey = canonicalId ? canonicalId.toLowerCase() : null;
    const isCanonicalDuplicate =
      canonicalKey != null && diversified.length < TOP_N && seenCanonical.has(canonicalKey);

    if (
      diversified.length < TOP_N &&
      (currentCount >= MAX_PER_SOURCE_IN_TOP || isCanonicalDuplicate)
    ) {
      deferred.push(row);
    } else {
      diversified.push(row);
      sourceCounts.set(source, currentCount + 1);
      if (canonicalKey) seenCanonical.add(canonicalKey);
    }
  }

  return [...diversified, ...deferred];
}
