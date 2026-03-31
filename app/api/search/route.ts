import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { db } from "@/lib/db";
import {
  agents,
  agentMediaAssets,
  searchQueries,
  searchOutcomes,
  agentExecutionMetrics,
  agentCapabilityContracts,
  agentEmbeddings,
  agentCapabilityHandshakes,
  agentReputationSnapshots,
  searchDocuments,
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
import { calibrateSafetyScore } from "@/lib/search/scoring/safety";
import { getAuthUser } from "@/lib/auth-utils";
import { isAdmin } from "@/lib/admin";
import { applyRequestIdHeader, jsonError } from "@/lib/api/errors";
import { recordApiResponse } from "@/lib/metrics/record";
import { recordSearchOutcome } from "@/lib/metrics/kpi";
import {
  getEmbeddingProvider,
  getSemanticCandidatesLimit,
  isSemanticSearchEnabled,
} from "@/lib/search/semantic/config";
import { getOrCreateQueryEmbedding } from "@/lib/search/semantic/query-embed-cache";
import { vectorToSqlLiteral } from "@/lib/search/semantic/provider";
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
import { TASK_TYPES } from "@/lib/search/taxonomy";
import { blendExecuteScore } from "@/lib/gpg/execute-blend";
import { recommendAgents } from "@/lib/gpg/recommend";
import { ensureTaskSignature } from "@/lib/gpg/task-canonicalization";
import {
  buildFallbackContentMetaFromSearchResult,
  getEditorialContentMetaMap,
} from "@/lib/agents/editorial-content";
import { parseCapabilityParam } from "@/lib/search/capability-tokens";
import {
  canonicalSourceSql,
  canonicalizeSource,
  expandSourceBuckets,
  REGISTRY_SOURCES,
} from "@/lib/search/source-taxonomy";
import {
  getCanonicalEntityPath,
  normalizeRequestedEntityTypes,
  parseEntityTypesParam,
} from "@/lib/entities/public-entities";

let hasSearchClaimColumnsCache: boolean | null = null;
let hasSearchClicksTableCache: boolean | null = null;
let hasSearchOutcomesTableCache: boolean | null = null;
let hasAgentExecutionMetricsTableCache: boolean | null = null;
let hasAgentCapabilityContractsTableCache: boolean | null = null;
let hasAgentEmbeddingsTableCache: boolean | null = null;
let hasAgentHandshakeTableCache: boolean | null = null;
let hasAgentReputationTableCache: boolean | null = null;
let hasSearchDocumentsTableCache: boolean | null = null;

type SearchMatchMode =
  | "strict_lexical"
  | "relaxed_lexical"
  | "semantic"
  | "filter_only_fallback"
  | "global_fallback";

const SKILL_PRIORITY_SOURCES = [...REGISTRY_SOURCES, "CLAWHUB", "GITHUB_OPENCLEW", "GITHUB_REPOS"] as const;

function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, (c) => `\\${c}`);
}

function toExternalProtocolName(protocol: unknown): string {
  if (typeof protocol !== "string") return "";
  if (protocol.toUpperCase() === "OPENCLEW") return "OPENCLAW";
  return protocol;
}

const CONTRACT_MAX_AGE_HOURS = Number(process.env.SEARCH_CONTRACT_MAX_AGE_HOURS ?? "168");
const METRICS_MAX_AGE_HOURS = Number(process.env.SEARCH_METRICS_MAX_AGE_HOURS ?? "168");

function isExecuteBiasEnabled(clientType: string | null): boolean {
  if (process.env.SEARCH_EXECUTE_BIAS_ENABLED === "1") return true;
  return clientType?.toLowerCase() === "agent";
}

function isStrictContractsEnabled(clientType: string | null): boolean {
  if (process.env.SEARCH_STRICT_CONTRACTS_ENABLED === "1") return true;
  return clientType?.toLowerCase() === "agent";
}

const SearchSchema = z.object({
  q: z.string().max(500).optional(),
  mediaCursor: z.string().optional(),
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
    .transform((s) => parseCapabilityParam(s)),
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
  includeUnsafeMedia: z
    .string()
    .optional()
    .transform((s) => s === "1" || s === "true"),
  vertical: z.enum(["agents", "images", "artifacts", "all", "docs"]).default("agents"),
  minMediaQuality: z.coerce.number().min(0).max(100).optional(),
  artifactType: z
    .string()
    .optional()
    .transform((s) =>
      s
        ? s
            .split(",")
            .map((v) => v.trim().toUpperCase())
            .filter(Boolean)
        : []
    ),
  recall: z.enum(["normal", "high"]).default("normal"),
  includeSources: z
    .string()
    .optional()
    .transform((s) =>
      s
        ? s
            .split(",")
            .map((v) => v.trim().toUpperCase())
            .filter(Boolean)
        : []
    ),
  entityTypes: z
    .string()
    .optional()
    .transform((s) => parseEntityTypesParam(s)),
  skillsOnly: z
    .string()
    .optional()
    .transform((s) => s === "1" || s === "true"),
  debug: z
    .string()
    .optional()
    .transform((s) => s === "1" || s === "true"),
  fields: z.enum(["full", "compact", "card"]).default("full"),
  includeTotal: z
    .string()
    .optional()
    .transform((s) => (s === "0" || s === "false" ? false : true)),
  intent: z.enum(["discover", "execute"]).default("discover"),
  taskType: z.enum(TASK_TYPES).optional(),
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
  strictContracts: z
    .string()
    .optional()
    .transform((s) => s === "1" || s === "true"),
  returnPlan: z
    .string()
    .optional()
    .transform((s) => s === "1" || s === "true"),
  include: z
    .string()
    .optional()
    .transform((s) =>
      s
        ? s
            .split(",")
            .map((item) => item.trim().toLowerCase())
            .filter(Boolean)
        : []
    ),
});

type SearchParams = z.infer<typeof SearchSchema>;

function buildCapabilityTokenMatchCondition(tokens: string[]): SQL {
  return sql`EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(coalesce(${agents.capabilities}, '[]'::jsonb)) = 'array'
           THEN ${agents.capabilities} ELSE '[]'::jsonb END
    ) AS cap
    WHERE lower(trim(both '-' from regexp_replace(cap, '[^a-zA-Z0-9]+', '-', 'g'))) = ANY(ARRAY[${sql.join(
      tokens.map((token) => sql`${token}`),
      sql`, `
    )}]::text[])
  )`;
}

function buildCapabilityPresenceCondition(): SQL {
  return sql`EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(coalesce(${agents.capabilities}, '[]'::jsonb)) = 'array'
           THEN ${agents.capabilities} ELSE '[]'::jsonb END
    ) AS cap
    WHERE lower(trim(both '-' from regexp_replace(cap, '[^a-zA-Z0-9]+', '-', 'g'))) <> ''
  )`;
}

function buildSkillPriorityExpr(sourceExpr: SQL): SQL {
  return sql`CASE
    WHEN ${sourceExpr} = ANY(ARRAY[${sql.join(
      SKILL_PRIORITY_SOURCES.map((source) => sql`${source}`),
      sql`, `
    )}]::text[]) THEN 2
    WHEN ${agents.openclawData} IS NOT NULL THEN 2
    WHEN ${buildCapabilityPresenceCondition()} THEN 1
    WHEN (
      ${agents.readme} IS NOT NULL
      AND (
        ${agents.readme} ILIKE '%protocols:%'
        OR ${agents.readme} ILIKE '%capability:%'
      )
    ) THEN 1
    ELSE 0
  END`;
}

function hasCapabilityTokens(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.some((entry) => typeof entry === "string" && entry.trim().length > 0);
}

function computeSkillPriorityFromCursorRow(row: {
  source: string | null;
  sourceId: string | null;
  openclawData: unknown;
  capabilities: unknown;
  readme: string | null;
}): number {
  const source = canonicalizeSource(row.source ?? "", row.sourceId ?? null);
  if (SKILL_PRIORITY_SOURCES.includes(source as (typeof SKILL_PRIORITY_SOURCES)[number])) {
    return 2;
  }
  if (row.openclawData != null) return 2;
  if (hasCapabilityTokens(row.capabilities)) return 1;
  if (typeof row.readme === "string" && /protocols:|capability:/i.test(row.readme)) return 1;
  return 0;
}

function buildSourceFilterCondition(values: string[]): SQL {
  const expanded = expandSourceBuckets(values);
  const canonicalSource = canonicalSourceSql(agents.source, agents.sourceId);
  return sql`${canonicalSource} = ANY(ARRAY[${sql.join(
    expanded.map((value) => sql`${value}`),
    sql`, `
  )}]::text[])`;
}

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
  if (params.includeSources.length > 0) {
    conditions.push(buildSourceFilterCondition(params.includeSources));
  }
  const requestedEntityTypes = normalizeRequestedEntityTypes({
    entityTypes: params.entityTypes,
    skillsOnly: params.skillsOnly,
  });
  conditions.push(
    sql`${agents.entityType} = ANY(ARRAY[${sql.join(
      requestedEntityTypes.map((entityType) => sql`${entityType}`),
      sql`, `
    )}]::text[])`
  );

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
    conditions.push(buildCapabilityTokenMatchCondition(capList));
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
    conditions.push(sql`${canonicalSourceSql(agents.source, agents.sourceId)} ILIKE ${srcPattern}`);
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

function isMissingSearchDocumentsTableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes('relation "search_documents" does not exist');
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

async function hasAgentEmbeddingsTable() {
  const value = await hasTable("agent_embeddings", hasAgentEmbeddingsTableCache);
  hasAgentEmbeddingsTableCache = value;
  return value;
}

async function hasAgentHandshakeTable() {
  const value = await hasTable("agent_capability_handshakes", hasAgentHandshakeTableCache);
  hasAgentHandshakeTableCache = value;
  return value;
}

async function hasAgentReputationTable() {
  const value = await hasTable("agent_reputation_snapshots", hasAgentReputationTableCache);
  hasAgentReputationTableCache = value;
  return value;
}

async function hasSearchDocumentsTable() {
  const value = await hasTable("search_documents", hasSearchDocumentsTableCache);
  hasSearchDocumentsTableCache = value;
  return value;
}

function buildAgentIdInCondition(ids: string[]): SQL {
  if (ids.length === 0) return sql`FALSE`;
  return sql`${agents.id} IN (${sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `
  )})`;
}

async function getSemanticCandidateIds(query: string): Promise<string[]> {
  if (!isSemanticSearchEnabled()) return [];
  const trimmed = query.trim();
  if (!trimmed) return [];
  if (!(await hasAgentEmbeddingsTable())) return [];

  const provider = getEmbeddingProvider();
  if (!provider || !provider.isAvailable()) return [];

  try {
    const queryEmbedding = await getOrCreateQueryEmbedding(
      provider.provider,
      provider.model,
      trimmed,
      async () => {
        const vectors = await provider.embed([trimmed]);
        return vectors[0] ?? [];
      }
    );
    if (queryEmbedding.length === 0) return [];

    const limit = getSemanticCandidatesLimit();
    const result = await db.execute(
      sql`SELECT agent_id
          FROM ${agentEmbeddings}
          WHERE ${agentEmbeddings.provider} = ${provider.provider}
            AND ${agentEmbeddings.model} = ${provider.model}
          ORDER BY ${agentEmbeddings.embedding} <=> ${vectorToSqlLiteral(queryEmbedding)}::vector
          LIMIT ${limit}`
    );
    const rows = (result as unknown as { rows?: Array<{ agent_id: string }> }).rows ?? [];
    return rows.map((row) => row.agent_id);
  } catch (err) {
    console.warn("[Search] semantic retrieval unavailable:", err);
    return [];
  }
}

async function runMediaVerticalQuery(params: SearchParams): Promise<{
  mediaResults: Array<Record<string, unknown>>;
  pagination: { hasMore: boolean; nextCursor: string | null; total: number };
  facets: { protocols: never[] };
  searchMeta: {
    fallbackApplied: boolean;
    matchMode: "strict_lexical";
    queryOriginal: string;
    queryInterpreted: string;
    filtersHonored: boolean;
    stagesTried: string[];
  };
}> {
  const rawQuery = params.q?.trim() ?? "";
  const queryTokens = rawQuery
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const mediaSynonyms: Record<string, string[]> = {
    diagram: ["architecture", "flowchart"],
    arch: ["architecture", "diagram"],
    benchmark: ["performance", "latency"],
    screenshot: ["ui", "preview"],
    openapi: ["swagger", "api spec"],
    schema: ["json schema", "contract"],
  };
  const expandedTerms = new Set<string>(queryTokens);
  for (const t of queryTokens) {
    (mediaSynonyms[t] ?? []).forEach((v) => expandedTerms.add(v));
  }
  const queryPattern = expandedTerms.size > 0 ? `%${escapeLike([...expandedTerms].join(" "))}%` : null;
  const conditions: SQL[] = [eq(agents.status, "ACTIVE") as unknown as SQL];
  if (!params.includePrivate) {
    conditions.push(eq(agents.publicSearchable, true) as unknown as SQL);
  }
  if (!params.includeUnsafeMedia) {
    conditions.push(eq(agentMediaAssets.isPublic, true) as unknown as SQL);
  }

  if (params.vertical === "images") {
    conditions.push(eq(agentMediaAssets.assetKind, "IMAGE") as unknown as SQL);
  } else if (params.vertical === "artifacts") {
    conditions.push(eq(agentMediaAssets.assetKind, "ARTIFACT") as unknown as SQL);
  }

  if (params.includeSources.length > 0) {
    conditions.push(buildSourceFilterCondition(params.includeSources));
  }

  if (params.artifactType.length > 0) {
    conditions.push(
      sql`${agentMediaAssets.artifactType} = ANY(ARRAY[${sql.join(
        params.artifactType.map((v) => sql`${v}`),
        sql`, `
      )}]::text[])`
    );
  }

  if (params.minMediaQuality != null) {
    conditions.push(
      gte(agentMediaAssets.qualityScore, params.minMediaQuality) as unknown as SQL
    );
  }

  if (queryPattern) {
    conditions.push(
      sql`(
        ${agents.name} ILIKE ${queryPattern}
        OR COALESCE(${agentMediaAssets.title}, '') ILIKE ${queryPattern}
        OR COALESCE(${agentMediaAssets.caption}, '') ILIKE ${queryPattern}
        OR COALESCE(${agentMediaAssets.altText}, '') ILIKE ${queryPattern}
        OR COALESCE(${agentMediaAssets.artifactType}, '') ILIKE ${queryPattern}
      )`
    );
  }

  const pageLimit = params.recall === "high" ? Math.min(200, params.limit * 3) : params.limit;
  const mediaSkillPriorityExpr = buildSkillPriorityExpr(
    canonicalSourceSql(agents.source, agents.sourceId)
  );
  const mediaCursor = params.mediaCursor?.trim() || null;
  if (mediaCursor) {
    const parts = mediaCursor.split("|");
    if (parts.length === 3 || parts.length === 4) {
      const hasPriority = parts.length === 4;
      const cursorSkillPriority = hasPriority ? Number(parts[0]) : 0;
      const rankIndex = hasPriority ? 1 : 0;
      const updatedAtIndex = hasPriority ? 2 : 1;
      const idIndex = hasPriority ? 3 : 2;
      const cursorRank = Number(parts[rankIndex]);
      const cursorUpdatedAt = new Date(parts[updatedAtIndex]);
      const cursorId = parts[idIndex];
      if (
        (hasPriority ? Number.isFinite(cursorSkillPriority) : true) &&
        Number.isFinite(cursorRank) &&
        !Number.isNaN(cursorUpdatedAt.getTime()) &&
        cursorId.length > 0
      ) {
        if (hasPriority) {
          conditions.push(
            sql`(
              ${mediaSkillPriorityExpr},
              coalesce(${agentMediaAssets.rankScore}, 0),
              ${agentMediaAssets.updatedAt},
              ${agentMediaAssets.id}
            ) < (${cursorSkillPriority}, ${cursorRank}, ${cursorUpdatedAt}, ${cursorId}::uuid)`
          );
        } else {
          conditions.push(
            sql`(
              coalesce(${agentMediaAssets.rankScore}, 0),
              ${agentMediaAssets.updatedAt},
              ${agentMediaAssets.id}
            ) < (${cursorRank}, ${cursorUpdatedAt}, ${cursorId}::uuid)`
          );
        }
      }
    }
  }

  const result = await db.execute(sql`
    SELECT
      ${agentMediaAssets.id} AS id,
      ${agentMediaAssets.agentId} AS agent_id,
      ${agents.slug} AS agent_slug,
      ${agents.name} AS agent_name,
      ${agentMediaAssets.assetKind} AS asset_kind,
      ${agentMediaAssets.artifactType} AS artifact_type,
      ${agentMediaAssets.url} AS url,
      ${agentMediaAssets.sourcePageUrl} AS source_page_url,
      ${canonicalSourceSql(agents.source, agents.sourceId)} AS source,
      ${agentMediaAssets.title} AS title,
      ${agentMediaAssets.caption} AS caption,
      ${agentMediaAssets.width} AS width,
      ${agentMediaAssets.height} AS height,
      ${agentMediaAssets.mimeType} AS mime_type,
      ${agentMediaAssets.qualityScore} AS quality_score,
      ${agentMediaAssets.safetyScore} AS safety_score,
      ${agentMediaAssets.rankScore} AS rank_score,
      ${mediaSkillPriorityExpr} AS skill_priority,
      ${agentMediaAssets.updatedAt} AS updated_at,
      ${agentMediaAssets.crawlDomain} AS crawl_domain,
      ${agentMediaAssets.discoveryMethod} AS discovery_method
    FROM ${agentMediaAssets}
    INNER JOIN ${agents} ON ${agents.id} = ${agentMediaAssets.agentId}
    WHERE ${and(...conditions)}
    ORDER BY
      ${mediaSkillPriorityExpr} DESC,
      ${agentMediaAssets.rankScore} DESC,
      ${agentMediaAssets.qualityScore} DESC,
      ${agents.overallRank} DESC,
      ${agentMediaAssets.updatedAt} DESC,
      ${agentMediaAssets.id} DESC
    LIMIT ${pageLimit + 1}
  `);
  const rows = (result as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? [];
  const hasMore = rows.length > pageLimit;
  const pageRows = hasMore ? rows.slice(0, pageLimit) : rows;
  const lastRow = pageRows[pageRows.length - 1];
  const nextCursor =
    hasMore && lastRow
      ? `${Number(lastRow.skill_priority ?? 0)}|${Number(lastRow.rank_score ?? 0)}|${new Date(lastRow.updated_at as Date).toISOString()}|${
          lastRow.id as string
        }`
      : null;
  const mediaResults = pageRows.map((row) => ({
    id: row.id as string,
    agentId: row.agent_id as string,
    agentSlug: row.agent_slug as string,
    agentName: row.agent_name as string,
    assetKind: row.asset_kind as string,
    artifactType: (row.artifact_type as string | null) ?? null,
    url: row.url as string,
    sourcePageUrl: (row.source_page_url as string | null) ?? null,
    source: (row.source as string | null) ?? null,
    title: (row.title as string | null) ?? null,
    caption: (row.caption as string | null) ?? null,
    width: (row.width as number | null) ?? null,
    height: (row.height as number | null) ?? null,
    mimeType: (row.mime_type as string | null) ?? null,
    qualityScore: Number(row.quality_score ?? 0),
    safetyScore: Number(row.safety_score ?? 0),
    crawlDomain: (row.crawl_domain as string | null) ?? null,
    discoveryMethod: (row.discovery_method as string | null) ?? null,
  }));

  return {
    mediaResults,
    pagination: { hasMore, nextCursor, total: mediaResults.length },
    facets: { protocols: [] },
    searchMeta: {
      fallbackApplied: false,
      matchMode: "strict_lexical",
      queryOriginal: rawQuery,
      queryInterpreted: rawQuery,
      filtersHonored: true,
      stagesTried: ["media_vertical"],
    },
  };
}

async function runDocumentVerticalQuery(
  params: SearchParams,
  mode: "all" | "docs"
): Promise<{
  results: Array<Record<string, unknown>>;
  pagination: { hasMore: boolean; nextCursor: string | null; total: number };
  facets: { protocols: never[] };
  searchMeta: {
    fallbackApplied: boolean;
    matchMode: "strict_lexical";
    queryOriginal: string;
    queryInterpreted: string;
    filtersHonored: boolean;
    stagesTried: string[];
  };
}> {
  const rawQuery = params.q?.trim() ?? "";
  const hasQuery = rawQuery.length > 0;
  const queryPattern = hasQuery ? `%${escapeLike(rawQuery)}%` : null;
  const pageLimit = params.recall === "high" ? Math.min(200, params.limit * 3) : params.limit;

  const sourceCondition =
    params.includeSources.length > 0
      ? sql`AND sd.source = ANY(ARRAY[${sql.join(
          params.includeSources.map((v) => sql`${v}`),
          sql`, `
        )}]::text[])`
      : sql``;
  const docTypeCondition =
    mode === "docs"
      ? sql`AND sd.doc_type = ANY(ARRAY['web_page','web_chunk']::text[])`
      : sql``;
  const lexicalRankExpr = hasQuery
    ? sql`ts_rank_cd(sd.body_tsv, websearch_to_tsquery('english', ${rawQuery}))`
    : sql`0::double precision`;
  const finalScoreExpr = hasQuery
    ? sql`(
        ${lexicalRankExpr} * 45
        + sd.quality_score * 0.20
        + sd.freshness_score * 0.15
        + sd.safety_score * 0.10
        + sd.confidence_score * 0.10
      )`
    : sql`(
        sd.quality_score * 0.45
        + sd.freshness_score * 0.25
        + sd.safety_score * 0.15
        + sd.confidence_score * 0.15
      )`;
  const documentPriorityExpr = sql`CASE
    WHEN sd.doc_type = 'agent' THEN 2
    WHEN doc_agent.slug IS NOT NULL THEN 2
    WHEN sd.source = ANY(ARRAY[${sql.join(
      SKILL_PRIORITY_SOURCES.map((source) => sql`${source}`),
      sql`, `
    )}]::text[]) THEN 1
    ELSE 0
  END`;
  const textCondition = hasQuery
    ? sql`AND (
        sd.body_tsv @@ websearch_to_tsquery('english', ${rawQuery})
        OR coalesce(sd.title, '') ILIKE ${queryPattern!}
        OR coalesce(sd.snippet, '') ILIKE ${queryPattern!}
        OR sd.canonical_url ILIKE ${queryPattern!}
      )`
    : sql``;
  const syntheticSourceIdExpr = sql`('CRAWLED_DOC:' || sd.url_norm_hash || ':' || left(sd.content_hash, 16))`;
  const baseWhere = sql`
    FROM search_documents sd
    LEFT JOIN agents doc_agent ON doc_agent.source_id = ${syntheticSourceIdExpr}
    WHERE sd.is_public = true
      ${docTypeCondition}
      ${sourceCondition}
      ${textCondition}
  `;

  const totalResult = await db.execute(sql`
    SELECT COUNT(*)::int AS total
    ${baseWhere}
  `);
  const totalMatches =
    Number(
      (totalResult as unknown as { rows?: Array<{ total?: number | string }> }).rows?.[0]?.total ??
        0
    ) || 0;

  const result = await db.execute(sql`
    SELECT
      sd.id,
      sd.doc_type,
      sd.source,
      sd.source_id,
      sd.canonical_url,
      sd.domain,
      sd.title,
      sd.snippet,
      sd.quality_score,
      sd.safety_score,
      sd.freshness_score,
      sd.confidence_score,
      sd.indexed_at,
      sd.url_norm_hash,
      sd.content_hash,
      doc_agent.slug AS agent_slug,
      doc_agent.entity_type AS agent_entity_type,
      ${documentPriorityExpr} AS document_priority,
      ${lexicalRankExpr} AS lexical_rank,
      ${finalScoreExpr} AS final_score
    ${baseWhere}
    ORDER BY document_priority DESC, final_score DESC, sd.indexed_at DESC, sd.id DESC
    LIMIT ${pageLimit + 1}
  `);

  const rows = (result as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? [];
  const hasMore = rows.length > pageLimit;
  const pageRows = hasMore ? rows.slice(0, pageLimit) : rows;
  const last = pageRows[pageRows.length - 1];
  const nextCursor = hasMore && last ? String(last.id ?? "") : null;

  const mapped = pageRows.map((row) => {
    const docType = String(row.doc_type ?? "web_chunk");
    const urlNormHash = String(row.url_norm_hash ?? "");
    const contentHash = String(row.content_hash ?? "");
    const fallbackSlug =
      urlNormHash && contentHash
        ? `crawl-${urlNormHash.slice(0, 16)}-${contentHash.slice(0, 12)}`
        : null;
    const mappedAgentSlug =
      (typeof row.agent_slug === "string" && row.agent_slug.trim().length > 0
        ? row.agent_slug.trim()
        : fallbackSlug) ?? null;
    const mappedAgentEntityType =
      row.agent_entity_type === "skill" || row.agent_entity_type === "mcp" || row.agent_entity_type === "agent"
        ? row.agent_entity_type
        : "agent";
    const kind =
      docType === "web_page"
        ? "page"
        : docType === "web_chunk"
          ? "doc"
        : docType === "artifact"
          ? "artifact"
          : "agent";
    return {
      id: String(row.id ?? ""),
      kind,
      docType,
      source: String(row.source ?? ""),
      sourceId: String(row.source_id ?? ""),
      url: String(row.canonical_url ?? ""),
      domain: String(row.domain ?? ""),
      agentSlug: mappedAgentSlug,
      agentUrl: mappedAgentSlug ? getCanonicalEntityPath(mappedAgentEntityType, mappedAgentSlug) : null,
      title: row.title as string | null,
      snippet: row.snippet as string | null,
      qualityScore: Number(row.quality_score ?? 0),
      safetyScore: Number(row.safety_score ?? 0),
      freshnessScore: Number(row.freshness_score ?? 0),
      confidenceScore: Number(row.confidence_score ?? 0),
      indexedAt:
        row.indexed_at instanceof Date
          ? row.indexed_at.toISOString()
          : String(row.indexed_at ?? ""),
      overallRank: Number(row.final_score ?? 0),
    };
  });

  return {
    results: mapped,
    pagination: { hasMore, nextCursor, total: totalMatches },
    facets: { protocols: [] },
    searchMeta: {
      fallbackApplied: false,
      matchMode: "strict_lexical",
      queryOriginal: rawQuery,
      queryInterpreted: rawQuery,
      filtersHonored: true,
      stagesTried: [`${mode}_vertical_documents`],
    },
  };
}

function buildDocsUnavailableResponse(params: SearchParams) {
  const rawQuery = params.q?.trim() ?? "";
  return {
    results: [],
    pagination: { hasMore: false, nextCursor: null, total: 0 },
    facets: { protocols: [] },
    searchMeta: {
      fallbackApplied: true,
      matchMode: "filter_only_fallback" as const,
      queryOriginal: rawQuery,
      queryInterpreted: rawQuery,
      filtersHonored: false,
      stagesTried: ["documents_vertical_unavailable"],
      fallbackReason: "documents-index-unavailable",
    },
  };
}

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  // --- Rate limiting ---
  const authProbe = await getAuthUser(req);
  const authUser = "error" in authProbe ? null : authProbe.user;
  const isAuthenticated = Boolean(authUser);
  const rateLimitLimit = isAuthenticated
    ? SEARCH_AUTH_RATE_LIMIT
    : SEARCH_ANON_RATE_LIMIT;
  const rlResult = await checkSearchRateLimit(req, isAuthenticated);
  if (!rlResult.allowed) {
    const response = jsonError(req, {
      code: "RATE_LIMITED",
      message: "Too many requests. Please try again later.",
      status: 429,
      retryAfterMs: (rlResult.retryAfter ?? 60) * 1000,
      details: { limit: rateLimitLimit },
    });
    response.headers.set("X-RateLimit-Remaining", "0");
    response.headers.set("X-RateLimit-Limit", String(rateLimitLimit));
    recordApiResponse("/api/search", req, response, startedAt);
    return response;
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
      const response = jsonError(req, {
        code: "BAD_REQUEST",
        message: msg,
        status: 400,
      });
      recordApiResponse("/api/search", req, response, startedAt);
      return response;
    }
    throw err;
  }

  if (
    !req.nextUrl.searchParams.has("vertical") &&
    process.env.SEARCH_DEFAULT_VERTICAL_ALL === "1"
  ) {
    params.vertical = "all";
  }

  if (params.includePending || params.includePrivate || params.includeUnsafeMedia) {
    if (!authUser || !isAdmin(authUser)) {
      const response = jsonError(req, {
        code: "FORBIDDEN",
        message: "FORBIDDEN",
        status: 403,
      });
      recordApiResponse("/api/search", req, response, startedAt);
      return response;
    }
  }
  const clientType = req.headers.get("x-client-type");
  const executeBias = params.intent === "execute" && isExecuteBiasEnabled(clientType);
  const strictContracts =
    params.intent === "execute" &&
    (Boolean(params.strictContracts) || isStrictContractsEnabled(clientType));
  const includeContent = params.fields !== "card" && params.include.includes("content");
  const includeTotal = params.includeTotal !== false;

  // --- Cache check ---
  const cacheKey = buildCacheKey({
    algoVersion: "hybrid_v2",
    q: params.q ?? "",
    protocols: params.protocols.join(","),
    capabilities: params.capabilities.join(","),
    minSafety: params.minSafety ?? "",
    minRank: params.minRank ?? "",
    sort: params.sort,
    cursor: params.cursor ?? "",
    mediaCursor: params.mediaCursor ?? "",
    limit: params.limit,
    includePending: params.includePending,
    includePrivate: params.includePrivate,
    includeUnsafeMedia: params.includeUnsafeMedia,
    vertical: params.vertical,
    minMediaQuality: params.minMediaQuality ?? "",
    artifactType: params.artifactType.join(","),
    recall: params.recall,
    includeSources: params.includeSources.join(","),
    entityTypes: normalizeRequestedEntityTypes({
      entityTypes: params.entityTypes,
      skillsOnly: params.skillsOnly,
    }).join(","),
    skillsOnly: Boolean(params.skillsOnly),
    debug: params.debug,
    fields: params.fields,
    includeTotal,
    intent: params.intent,
    taskType: params.taskType ?? "",
    maxLatencyMs: params.maxLatencyMs ?? "",
    maxCostUsd: params.maxCostUsd ?? "",
    requires: params.requires.join(","),
    forbidden: params.forbidden.join(","),
    dataRegion: params.dataRegion ?? "",
    bundle: Boolean(params.bundle),
    explain: Boolean(params.explain),
    strictContracts,
    returnPlan: Boolean(params.returnPlan),
    include: params.include.join(","),
    executeBias,
    clientType: clientType ?? "",
  });

  const cached = searchResultsCache.get(cacheKey);
  if (cached) {
    const response = NextResponse.json(cached);
    response.headers.set(
      "Cache-Control",
      "public, s-maxage=30, stale-while-revalidate=60"
    );
    response.headers.set("X-Cache", "HIT");
    applyRequestIdHeader(response, req);
    recordApiResponse("/api/search", req, response, startedAt);
    return response;
  }

  // --- Circuit breaker check ---
  if (!searchCircuitBreaker.isAllowed()) {
    const response = NextResponse.json(
      {
        results: [],
        pagination: { hasMore: false, nextCursor: null, total: 0 },
        facets: { protocols: [] },
        error: {
          code: "CIRCUIT_OPEN",
          message: "Search is temporarily degraded. Please try again shortly.",
          retryAfterMs: 30_000,
        },
      },
      { status: 503, headers: { "Retry-After": "30" } }
    );
    applyRequestIdHeader(response, req);
    recordApiResponse("/api/search", req, response, startedAt);
    return response;
  }

  try {
    if (params.vertical === "images" || params.vertical === "artifacts") {
      const mediaResponse = await runMediaVerticalQuery(params);
      searchResultsCache.set(cacheKey, mediaResponse);
      const response = NextResponse.json(mediaResponse);
      response.headers.set(
        "Cache-Control",
        "public, s-maxage=30, stale-while-revalidate=60"
      );
      response.headers.set("X-Cache", "MISS");
      applyRequestIdHeader(response, req);
      recordApiResponse("/api/search", req, response, startedAt);
      return response;
    }

    if (params.vertical === "all" || params.vertical === "docs") {
      const docsTableAvailable = await hasSearchDocumentsTable();
      if (docsTableAvailable) {
        try {
          const docsResponse = await runDocumentVerticalQuery(
            params,
            params.vertical === "docs" ? "docs" : "all"
          );
          searchResultsCache.set(cacheKey, docsResponse);
          const response = NextResponse.json(docsResponse);
          response.headers.set(
            "Cache-Control",
            "public, s-maxage=30, stale-while-revalidate=60"
          );
          response.headers.set("X-Cache", "MISS");
          applyRequestIdHeader(response, req);
          recordApiResponse("/api/search", req, response, startedAt);
          return response;
        } catch (err) {
          if (!isMissingSearchDocumentsTableError(err)) throw err;
          hasSearchDocumentsTableCache = false;
        }
      }

      if (params.vertical === "docs") {
        const docsFallbackResponse = buildDocsUnavailableResponse(params);
        searchResultsCache.set(cacheKey, docsFallbackResponse);
        const response = NextResponse.json(docsFallbackResponse);
        response.headers.set(
          "Cache-Control",
          "public, s-maxage=30, stale-while-revalidate=60"
        );
        response.headers.set("X-Cache", "MISS");
        response.headers.set("X-Search-Degraded", "documents-index-unavailable");
        applyRequestIdHeader(response, req);
        recordApiResponse("/api/search", req, response, startedAt);
        return response;
      }

      params.vertical = "agents";
    }

    // --- Query processing pipeline ---
    const rawQuery = params.q?.trim() ?? "";
    let strictTextQuery = rawQuery;
    let interpretedTextQuery = rawQuery;
    let strictWebsearchInput = rawQuery;
    let interpretedWebsearchInput = rawQuery;
    let interpretedIsNaturalLanguage = false;
    let fieldFilters: Record<string, string | undefined> = {};

    if (rawQuery) {
      const processed = processQuery(rawQuery);
      strictTextQuery = processed.parsed.textQuery;
      interpretedTextQuery = processed.interpretedQuery;
      strictWebsearchInput = processed.strictWebsearchInput;
      interpretedWebsearchInput = processed.websearchInput;
      interpretedIsNaturalLanguage = processed.interpretation.isNaturalLanguage;
      fieldFilters = processed.parsed.fieldFilters;
    }

    let textQuery = strictTextQuery;
    let websearchInput = strictWebsearchInput;
    let useRelevance = !!textQuery && params.sort === "rank";
    let useHybridRanking = useRelevance && isHybridRankingEnabled();
    const rankingWeights = getRankingWeights();
    const engagement = getEngagementParams();
    const queryHash = rawQuery ? hashQuery(strictTextQuery || rawQuery) : "";
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
      q: interpretedTextQuery || strictTextQuery || rawQuery,
      taskType: params.taskType,
      requires: params.requires,
      forbidden: params.forbidden,
    });
    if (rawQuery) trackSearchQuery(rawQuery);

    const filterConditions = buildConditions(params, fieldFilters);
    const hasExplicitFilters =
      params.protocols.length > 0 ||
      params.capabilities.length > 0 ||
      params.entityTypes.length > 0 ||
      Boolean(params.skillsOnly) ||
      params.minSafety != null ||
      params.minRank != null ||
      Boolean(fieldFilters.protocol || fieldFilters.lang || fieldFilters.safety || fieldFilters.source);
    let conditions: SQL[] = [...filterConditions];
    if (textQuery) conditions.push(buildTextCondition(textQuery, websearchInput));

    const sortCol =
      params.sort === "rank"
        ? agents.overallRank
        : params.sort === "safety"
          ? agents.safetyScore
          : params.sort === "popularity"
            ? agents.popularityScore
            : agents.freshnessScore;
    const canonicalSourceForRanking = canonicalSourceSql(agents.source, agents.sourceId);
    const skillPriorityExpr = buildSkillPriorityExpr(canonicalSourceForRanking);

    const limit = params.limit + 1;
    let allConditions = [...conditions];
    const homepagePriority = sql`CASE WHEN ${agents.homepage} IS NOT NULL AND ${agents.homepage} != '' THEN 1 ELSE 0 END`;

    async function applyCursorCondition() {
      if (!params.cursor) return;

      if (useRelevance) {
        const cursorRows = await db.execute(
          sql`SELECT
                CASE WHEN homepage IS NOT NULL AND homepage != '' THEN 1 ELSE 0 END AS has_homepage,
                ${skillPriorityExpr} AS skill_priority,
                (
                  ts_rank(
                    search_vector,
                    ${websearchInput.length > 0
                      ? sql`websearch_to_tsquery('english', ${websearchInput})`
                      : sql`plainto_tsquery('english', ${textQuery})`}
                  )
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
              ${skillPriorityExpr},
              (
                ts_rank(
                  search_vector,
                  ${websearchInput.length > 0
                    ? sql`websearch_to_tsquery('english', ${websearchInput})`
                    : sql`plainto_tsquery('english', ${textQuery})`}
                )
                + CASE WHEN lower(${agents.name}) = lower(${textQuery}) THEN 0.4 ELSE 0 END
                + CASE WHEN lower(${agents.name}) LIKE lower(${`${textQuery}%`}) THEN 0.2 ELSE 0 END
                + CASE WHEN lower(${agents.name}) % lower(${textQuery}) THEN similarity(lower(${agents.name}), lower(${textQuery})) * 0.12 ELSE 0 END
              ),
              ${agents.overallRank},
              ${agents.createdAt},
              ${agents.id}
            ) < (
              ${Number(cr.has_homepage)},
              ${Number(cr.skill_priority ?? 0)},
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
            source: agents.source,
            sourceId: agents.sourceId,
            openclawData: agents.openclawData,
            capabilities: agents.capabilities,
            readme: agents.readme,
          })
          .from(agents)
          .where(eq(agents.id, params.cursor))
          .limit(1);
        if (cursorRow) {
          const cursorHasHomepage = cursorRow.homepage ? 1 : 0;
          const cursorSkillPriority = computeSkillPriorityFromCursorRow({
            source: (cursorRow.source as string | null) ?? null,
            sourceId: (cursorRow.sourceId as string | null) ?? null,
            openclawData: cursorRow.openclawData,
            capabilities: cursorRow.capabilities,
            readme: (cursorRow.readme as string | null) ?? null,
          });
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
            sql`(${homepagePriority}, ${skillPriorityExpr}, ${sortCol}, ${agents.createdAt}, ${agents.id}) < (${cursorHasHomepage}, ${cursorSkillPriority}, ${cv}, ${cd}, ${params.cursor})`
          );
        }
      }
    }

    async function getTotalCount(activeConditions: SQL[]): Promise<number> {
      const [row] = await db
        .select({ count: sql<number>`count(*)` })
        .from(agents)
        .where(and(...activeConditions));
      return Number(row?.count ?? 0);
    }

    // --- Main query with ts_headline snippets ---
    async function runMainQuery(
      includeClaimColumns: boolean,
      includeEngagementJoin: boolean
    ): Promise<Array<Record<string, unknown>>> {
      const claimStatusExpr = includeClaimColumns
        ? sql`${agents.claimStatus}`
        : sql`'UNCLAIMED'::varchar`;
      const verificationTierExpr = includeClaimColumns
        ? sql`${agents.verificationTier}`
        : sql`'NONE'::varchar`;
      const hasCustomPageExpr = includeClaimColumns
        ? sql`${agents.hasCustomPage}`
        : sql`false::boolean`;
      const claimCols = includeClaimColumns
        ? sql`${agents.claimStatus} AS claim_status, ${agents.verificationTier} AS verification_tier, ${agents.hasCustomPage} AS has_custom_page,`
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
      const rankTsQuery =
        websearchInput.length > 0
          ? sql`websearch_to_tsquery('english', ${websearchInput})`
          : sql`plainto_tsquery('english', ${textQuery})`;
      const canonicalSourceExpr = canonicalSourceSql(agents.source, agents.sourceId);
      const marketplaceAuthorityExpr = sql`LEAST(
        0.22,
        GREATEST(
          0.0,
          CASE
            WHEN ${canonicalSourceExpr} = ANY(ARRAY[${sql.join(
              REGISTRY_SOURCES.map((source) => sql`${source}`),
              sql`, `
            )}]::text[])
              OR ${canonicalSourceExpr} IN ('CLAWHUB', 'HUGGINGFACE')
              THEN 0.05
            WHEN ${canonicalSourceExpr} IN ('NPM', 'PYPI', 'DOCKER')
              THEN -0.06
            ELSE 0
          END
          + LEAST(
            0.08,
            LN(
              GREATEST(
                1.0,
                COALESCE(
                  NULLIF(${agents.openclawData}->'discoverySignals'->>'installCount', '')::double precision,
                  NULLIF(${agents.openclawData}->'marketplace'->>'installCount', '')::double precision,
                  NULLIF(${agents.openclawData}->'smithery'->>'useCount', '')::double precision,
                  NULLIF(${agents.openclawData}->'dify'->>'usageCount', '')::double precision,
                  NULLIF(${agents.openclawData}->'n8n'->>'totalViews', '')::double precision,
                  0
                ) + 1.0
              )
            ) / 12.0
          )
          + CASE
              WHEN COALESCE(NULLIF(${agents.openclawData}->'discoverySignals'->>'verified', '')::boolean, false)
                OR ${verificationTierExpr} IN ('BRONZE', 'SILVER', 'GOLD')
                THEN 0.04
              ELSE 0
            END
          + CASE
              WHEN COALESCE(NULLIF(${agents.openclawData}->'discoverySignals'->>'featured', '')::boolean, false)
                THEN 0.03
              ELSE 0
            END
          + CASE
              WHEN ${agents.agentCard} IS NOT NULL
                OR COALESCE(NULLIF(${agents.openclawData}->'discoverySignals'->>'hasManifest', '')::boolean, false)
                THEN 0.03
              ELSE 0
            END
          + CASE
              WHEN COALESCE(NULLIF(${agents.openclawData}->'discoverySignals'->>'supportsMcp', '')::boolean, false)
                OR COALESCE(NULLIF(${agents.openclawData}->'discoverySignals'->>'supportsA2a', '')::boolean, false)
                OR ${agents.protocols} ?| ARRAY['MCP', 'A2A']::text[]
                THEN 0.02
              ELSE 0
            END
          + CASE
              WHEN ${agents.homepage} IS NOT NULL
                AND ${agents.homepage} != ''
                AND ${agents.url} ILIKE '%github.com%'
                THEN 0.01
              ELSE 0
            END
          + CASE
              WHEN COALESCE(
                NULLIF(${agents.openclawData}->'discoverySignals'->>'lastUpdatedAt', '')::timestamptz,
                NULLIF(${agents.openclawData}->'marketplace'->>'lastUpdatedAt', '')::timestamptz,
                NULLIF(${agents.openclawData}->'dify'->>'updatedAt', '')::timestamptz,
                NULLIF(${agents.openclawData}->'n8n'->>'createdAt', '')::timestamptz,
                ${agents.updatedAt}
              ) >= now() - interval '30 days'
                THEN 0.02
              ELSE 0
            END
        )
      )`;

      if (useRelevance) {
        const escapedText = escapeLike(textQuery);
        const prefixPattern = `${escapedText}%`;
        const containsPattern = `%${escapedText}%`;
        const rawResult = await db.execute(
          sql`WITH base AS (
                SELECT
                  id, name, slug, description, url, homepage, ${canonicalSourceExpr} AS source, source_id,
                  entity_type,
                  capabilities, protocols, canonical_agent_id,
                  safety_score, popularity_score, freshness_score, overall_rank, github_data, npm_data, openclaw_data,
                  languages, created_at, updated_at, ${claimCols}
                  ${skillPriorityExpr} AS skill_priority,
                  (
                    ts_rank(search_vector, ${rankTsQuery})
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
                          WHEN ${verificationTierExpr} = 'GOLD' THEN 0.12
                          WHEN ${verificationTierExpr} = 'SILVER' THEN 0.08
                          WHEN ${verificationTierExpr} = 'BRONZE' THEN 0.04
                          ELSE 0
                        END
                      + CASE WHEN ${claimStatusExpr} = 'CLAIMED' THEN 0.03 ELSE 0 END
                      + CASE WHEN ${hasCustomPageExpr} THEN 0.02 ELSE 0 END
                      + ${marketplaceAuthorityExpr}
                    )
                  ) AS authority_score,
                  LEAST(1.0, GREATEST(0.0, COALESCE(freshness_score / 100.0, 0))) AS freshness_score_norm,
                  ${engagementScoreExpr} AS engagement_score,
                  ts_headline('english', coalesce(description, ''), ${rankTsQuery},
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
                END AS final_score
                ${includeTotal ? sql`, count(*) OVER() AS total_count` : sql``}
              FROM base
              ORDER BY
                CASE WHEN homepage IS NOT NULL AND homepage != '' THEN 1 ELSE 0 END DESC,
                skill_priority DESC,
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
              id, name, slug, description, url, homepage, ${canonicalSourceExpr} AS source, source_id,
              entity_type,
              capabilities, protocols, canonical_agent_id, safety_score, popularity_score,
              freshness_score, overall_rank, github_data, npm_data, openclaw_data,
              languages, created_at, updated_at, ${claimCols}
              ${skillPriorityExpr} AS skill_priority,
              ${textQuery
                ? sql`ts_headline('english', coalesce(description, ''),
                    plainto_tsquery('english', ${textQuery}),
                    'MaxWords=35, MinWords=15, StartSel=<mark>, StopSel=</mark>'
                  ) AS snippet,`
                : sql`NULL AS snippet,`}
              ${includeTotal ? sql`count(*) OVER() AS total_count` : sql`NULL::bigint AS total_count`}
            FROM agents
            WHERE ${and(...allConditions)}
            ORDER BY
              CASE WHEN homepage IS NOT NULL AND homepage != '' THEN 1 ELSE 0 END DESC,
              skill_priority DESC,
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

    const stagesTried: SearchMatchMode[] = [];
    const stageTimings: Array<{ mode: SearchMatchMode; durationMs: number; total: number }> = [];
    const stageNotes: string[] = [];
    let stageMatchMode: SearchMatchMode = "strict_lexical";

    async function executeCurrentStage(mode: SearchMatchMode): Promise<Array<Record<string, unknown>>> {
      const startedAt = Date.now();
      stagesTried.push(mode);
      allConditions = [...conditions];
      await applyCursorCondition();

      let stageRows: Array<Record<string, unknown>>;
      const tryExtendedCols = hasSearchClaimColumnsCache !== false;
      let includeEngagementJoin = await hasSearchClicksTable();
      try {
        stageRows = await runMainQuery(tryExtendedCols, includeEngagementJoin);
        if (tryExtendedCols) hasSearchClaimColumnsCache = true;
      } catch (mainQueryErr) {
        if (tryExtendedCols && isMissingSearchClaimColumnsError(mainQueryErr)) {
          hasSearchClaimColumnsCache = false;
          try {
            stageRows = await runMainQuery(false, includeEngagementJoin);
          } catch (fallbackErr) {
            if (isMissingSearchClicksTableError(fallbackErr)) {
              includeEngagementJoin = false;
              stageRows = await runMainQuery(false, includeEngagementJoin);
            } else {
              throw fallbackErr;
            }
          }
        } else if (isMissingSearchClicksTableError(mainQueryErr)) {
          includeEngagementJoin = false;
          stageRows = await runMainQuery(tryExtendedCols, includeEngagementJoin);
          if (tryExtendedCols) hasSearchClaimColumnsCache = true;
        } else {
          throw mainQueryErr;
        }
      }

      stageTimings.push({
        mode,
        durationMs: Date.now() - startedAt,
        total: Number(stageRows[0]?.total_count ?? 0),
      });
      return stageRows;
    }

    let rows: Array<Record<string, unknown>> = [];

    const runStrict = async () => {
      stageMatchMode = "strict_lexical";
      textQuery = strictTextQuery;
      websearchInput = strictWebsearchInput;
      useRelevance = !!textQuery && params.sort === "rank";
      useHybridRanking = useRelevance && isHybridRankingEnabled();
      conditions = [...filterConditions];
      if (textQuery) conditions.push(buildTextCondition(textQuery, websearchInput));
      rows = await executeCurrentStage("strict_lexical");
    };

    await runStrict();

    if (rawQuery && rows.length === 0 && interpretedTextQuery && interpretedTextQuery !== strictTextQuery) {
      stageMatchMode = "relaxed_lexical";
      textQuery = interpretedTextQuery;
      websearchInput = interpretedWebsearchInput;
      useRelevance = !!textQuery && params.sort === "rank";
      useHybridRanking = useRelevance && isHybridRankingEnabled();
      conditions = [...filterConditions];
      if (textQuery) conditions.push(buildTextCondition(textQuery, websearchInput));
      rows = await executeCurrentStage("relaxed_lexical");
    }

    if (rawQuery && rows.length === 0) {
      const semanticIds = await getSemanticCandidateIds(interpretedTextQuery || strictTextQuery || rawQuery);
      if (semanticIds.length > 0) {
        stageMatchMode = "semantic";
        textQuery = interpretedTextQuery || strictTextQuery;
        websearchInput = interpretedWebsearchInput || strictWebsearchInput;
        useRelevance = false;
        useHybridRanking = false;
        conditions = [...filterConditions, buildAgentIdInCondition(semanticIds)];
        rows = await executeCurrentStage("semantic");
      } else {
        stageNotes.push("semantic-unavailable-or-no-candidates");
      }
    }

    if (rawQuery && rows.length === 0) {
      stageMatchMode = hasExplicitFilters ? "filter_only_fallback" : "global_fallback";
      textQuery = interpretedTextQuery || strictTextQuery;
      websearchInput = interpretedWebsearchInput || strictWebsearchInput;
      useRelevance = false;
      useHybridRanking = false;
      conditions = [...filterConditions];
      rows = await executeCurrentStage(stageMatchMode);
    }

    const totalFromWindow = includeTotal && rows.length > 0 ? Number(rows[0].total_count ?? 0) : null;
    const totalMatches = includeTotal
      ? params.cursor
        ? await getTotalCount(conditions)
        : (totalFromWindow ?? 0)
      : null;
    const hasMore = rows.length > params.limit;
    const resultRows = hasMore ? rows.slice(0, -1) : rows;

    // --- Diversify results: max 2 from same source in top 10 ---
    let diversified = diversifyResults(resultRows);
    if (params.fields === "card") {
      const results = diversified.map((r) => {
        const entityType =
          r.entity_type === "skill" || r.entity_type === "mcp" || r.entity_type === "agent"
            ? r.entity_type
            : "agent";
        const protocolsRaw = Array.isArray(r.protocols) ? (r.protocols as string[]) : [];
        return {
          id: r.id as string,
          name: r.name as string,
          slug: r.slug as string,
          canonicalPath: getCanonicalEntityPath(entityType, r.slug as string),
          entityType,
          description: (r.description as string | null) ?? null,
          capabilities: Array.isArray(r.capabilities) ? (r.capabilities as string[]) : [],
          protocols: protocolsRaw
            .map((p) => toExternalProtocolName(p))
            .filter((p) => p.length > 0),
          safetyScore: calibrateSafetyScore({
            baseScore: Number(r.safety_score ?? 0),
            verificationTier: (r.verification_tier as string | null) ?? "NONE",
            claimStatus: (r.claim_status as string | null) ?? "UNCLAIMED",
          }),
          overallRank: Number(r.overall_rank ?? 0),
          githubData: (r.github_data as Record<string, unknown> | null) ?? null,
          updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : undefined,
        };
      });

      const nextCursor = hasMore
        ? (resultRows[resultRows.length - 1]?.id as string | undefined) ?? null
        : null;
      const facets = await getFacets(conditions);
      let didYouMean: string | null = null;
      if (rawQuery && results.length < 3) {
        didYouMean = await findDidYouMean(rawQuery);
      }
      const fallbackApplied = rawQuery.length > 0 && stageMatchMode !== "strict_lexical";
      const fallbackReason =
        results.length === 0 && rawQuery
          ? hasExplicitFilters
            ? "no-matches-with-current-filters"
            : "no-related-results"
          : undefined;
      const searchMeta = {
        fallbackApplied,
        matchMode: stageMatchMode,
        queryOriginal: rawQuery,
        queryInterpreted: interpretedTextQuery || strictTextQuery || rawQuery,
        filtersHonored: true,
        stagesTried,
        ...(fallbackReason
          ? {
              fallbackReason:
                stageNotes.length > 0 ? `${fallbackReason}; ${stageNotes.join(",")}` : fallbackReason,
            }
          : {}),
        ...(includeRankingDebug
          ? {
              diagnostics: {
                stageTimings,
                interpretedIsNaturalLanguage,
              },
            }
          : {}),
      };

      searchCircuitBreaker.recordSuccess();

      const responseBody = {
        results,
        pagination: {
          hasMore,
          nextCursor,
          ...(typeof totalMatches === "number" ? { total: totalMatches } : {}),
        },
        facets,
        searchMeta,
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
            matchMode: stageMatchMode,
            stagesTried,
            stageTimings,
            fallbackApplied,
          })
        );
      }

      searchResultsCache.set(cacheKey, responseBody);

      const response = NextResponse.json(responseBody);
      response.headers.set(
        "Cache-Control",
        "public, s-maxage=30, stale-while-revalidate=60"
      );
      response.headers.set("X-Cache", "MISS");
      if (shouldIncludeDebugHeaders()) {
        response.headers.set("X-Search-Ranking", useHybridRanking ? "hybrid" : "lexical");
        response.headers.set("X-Search-Match-Mode", stageMatchMode);
        response.headers.set("X-Search-Fallback", fallbackApplied ? "1" : "0");
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
      recordSearchOutcome(results.length > 0 ? "success" : "no_results");
      applyRequestIdHeader(response, req);
      recordApiResponse("/api/search", req, response, startedAt);
      return response;
    }

    const agentIds = diversified.map((r) => String(r.id));
    const editorialMetaByAgent = includeContent
      ? await getEditorialContentMetaMap(agentIds)
      : new Map();

    const contractsByAgent = new Map<string, Record<string, unknown>>();
    const metricsByAgent = new Map<string, Record<string, unknown>>();
    const outcomesByAgent = new Map<string, Record<string, unknown>>();
    const handshakesByAgent = new Map<string, { status: string; verifiedAt: Date | null }>();
    const reputationByAgent = new Map<string, { scoreTotal: number | null; computedAt: Date | null }>();
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
            updatedAt: agentCapabilityContracts.updatedAt,
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
            updatedAt: agentExecutionMetrics.updatedAt,
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
      if (await hasAgentHandshakeTable()) {
        const rowsResult = await db.execute(
          sql`SELECT agent_id, status, verified_at
              FROM ${agentCapabilityHandshakes}
              WHERE ${agentCapabilityHandshakes.agentId} = ANY(${sql.raw(`ARRAY[${agentIds.map((id) => `'${id}'::uuid`).join(",")}]`)})
              ORDER BY agent_id, verified_at DESC`
        );
        const rows = (rowsResult as unknown as { rows?: Array<{ agent_id: string; status: string; verified_at: Date | null }> }).rows ?? [];
        for (const row of rows) {
          const agentId = String(row.agent_id);
          if (handshakesByAgent.has(agentId)) continue;
          handshakesByAgent.set(agentId, { status: row.status, verifiedAt: row.verified_at ?? null });
        }
      }
      if (await hasAgentReputationTable()) {
        const rowsResult = await db.execute(
          sql`SELECT agent_id, score_total, computed_at
              FROM ${agentReputationSnapshots}
              WHERE ${agentReputationSnapshots.agentId} = ANY(${sql.raw(`ARRAY[${agentIds.map((id) => `'${id}'::uuid`).join(",")}]`)})
              ORDER BY agent_id, computed_at DESC`
        );
        const rows = (rowsResult as unknown as { rows?: Array<{ agent_id: string; score_total: number | null; computed_at: Date | null }> }).rows ?? [];
        for (const row of rows) {
          const agentId = String(row.agent_id);
          if (reputationByAgent.has(agentId)) continue;
          reputationByAgent.set(agentId, { scoreTotal: row.score_total ?? null, computedAt: row.computed_at ?? null });
        }
      }
    }
    const nowMs = Date.now();
    const maxContractAgeMs = Math.max(1, CONTRACT_MAX_AGE_HOURS) * 60 * 60 * 1000;
    const maxMetricsAgeMs = Math.max(1, METRICS_MAX_AGE_HOURS) * 60 * 60 * 1000;

    if (strictContracts) {
      const beforeCount = diversified.length;
      diversified = diversified.filter((row) => {
        const agentId = String(row.id);
        const contract = contractsByAgent.get(agentId);
        const metrics = metricsByAgent.get(agentId);
        if (!contract || !metrics) return false;
        const authModes = (contract.authModes as string[] | undefined) ?? [];
        const hasSchemas = Boolean(
          (contract.inputSchemaRef as string | null | undefined) ||
            (contract.outputSchemaRef as string | null | undefined)
        );
        const contractUpdatedAt = contract.updatedAt instanceof Date
          ? contract.updatedAt.getTime()
          : Number.NaN;
        const metricsUpdatedAt = metrics.updatedAt instanceof Date
          ? metrics.updatedAt.getTime()
          : Number.NaN;
        if (authModes.length === 0 || !hasSchemas) return false;
        if (!Number.isFinite(contractUpdatedAt) || !Number.isFinite(metricsUpdatedAt)) return false;
        return (nowMs - contractUpdatedAt) <= maxContractAgeMs && (nowMs - metricsUpdatedAt) <= maxMetricsAgeMs;
      });
      if (beforeCount > 0 && diversified.length === 0) {
        constraintDiagnostics.push("strict-contracts-filter-eliminated-all-candidates");
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

    let gpgByAgent = new Map<string, { clusterId: string | null; pSuccess: number; risk: number; expectedCost: number; expectedLatencyMs: number; gpgScore: number }>();
    if (executeParams.intent === "execute" && (params.q ?? "").trim().length > 0) {
      try {
        const signature = await ensureTaskSignature({
          rawText: params.q ?? "",
          taskType: executeParams.taskType,
        });
        const gpgResponse = await recommendAgents({
          clusterId: signature.clusterId,
          constraints: {
            budget: executeParams.maxCostUsd,
            maxLatencyMs: executeParams.maxLatencyMs,
          },
          limit: 25,
        });
        for (const item of gpgResponse.topAgents.concat(gpgResponse.alternatives)) {
          gpgByAgent.set(item.agentId, {
            clusterId: gpgResponse.clusterId,
            pSuccess: item.p_success,
            risk: item.risk,
            expectedCost: item.expected_cost,
            expectedLatencyMs: item.p95_latency_ms,
            gpgScore: item.gpg_score,
          });
        }
      } catch {
        gpgByAgent = new Map();
      }
    }

    if (executeBias) {
      executionDecorated.sort((a, b) => {
        const aGpg = gpgByAgent.get(String(a.row.id))?.gpgScore ?? null;
        const bGpg = gpgByAgent.get(String(b.row.id))?.gpgScore ?? null;
        const aScore = blendExecuteScore(a.rankingSignals.finalScore, aGpg);
        const bScore = blendExecuteScore(b.rankingSignals.finalScore, bGpg);
        return bScore - aScore;
      });
    }

    const executionSlugs = executionDecorated.map((item) => String(item.row.slug));
    const results = executionDecorated.map((item) => {
      const r = item.row;
      const gpg = gpgByAgent.get(String(r.id));
      const protocolsRaw = Array.isArray(r.protocols) ? (r.protocols as string[]) : null;
      const protocols = protocolsRaw
        ?.map((p) => toExternalProtocolName(p))
        .filter((p) => p.length > 0) ?? null;
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
      const agentId = String(r.id);
      const contractUpdatedAt = contract?.updatedAt instanceof Date ? contract.updatedAt : null;
      const metricsUpdatedAt = metrics?.updatedAt instanceof Date ? metrics.updatedAt : null;
      const contractFreshnessHours = contractUpdatedAt
        ? Math.round((Date.now() - contractUpdatedAt.getTime()) / (1000 * 60 * 60))
        : null;
      const metricsFreshnessHours = metricsUpdatedAt
        ? Math.round((Date.now() - metricsUpdatedAt.getTime()) / (1000 * 60 * 60))
        : null;
      const trust = buildTrustSummary(
        handshakesByAgent.get(agentId),
        reputationByAgent.get(agentId)
      );
      const entityType =
        r.entity_type === "skill" || r.entity_type === "mcp" || r.entity_type === "agent"
          ? r.entity_type
          : "agent";
      const safetyScore = calibrateSafetyScore({
        baseScore: r.safety_score as number,
        trust,
        verificationTier: (r.verification_tier as string | null) ?? "NONE",
        claimStatus: (r.claim_status as string | null) ?? "UNCLAIMED",
      });
      const base = {
        id: r.id as string,
        name: r.name as string,
        slug: r.slug as string,
        entityType,
        canonicalPath: getCanonicalEntityPath(entityType, r.slug as string),
        description: r.description as string | null,
        snippet: (r.snippet as string | null) || null,
        capabilities: r.capabilities as string[] | null,
        protocols,
        safetyScore,
        popularityScore: r.popularity_score as number,
        freshnessScore: r.freshness_score as number,
        overallRank: r.overall_rank as number,
      };
      const contentMeta = includeContent
        ? editorialMetaByAgent.get(agentId) ??
          buildFallbackContentMetaFromSearchResult({
            description: (r.description as string | null) ?? null,
            capabilities: (r.capabilities as string[] | null) ?? null,
            openclawData: (r.openclaw_data as Record<string, unknown> | null) ?? null,
            createdAt: (r.created_at as Date | null) ?? null,
            updatedAt: (r.updated_at as Date | null) ?? null,
          })
        : undefined;
      const executionFit = {
        score: item.policyMatch.score,
        reasons: item.policyMatch.matched,
        blockers: item.policyMatch.blockedBy,
      };

      if (params.fields === "compact") {
        return {
          ...base,
          claimStatus: (r.claim_status as string | null) ?? "UNCLAIMED",
          verificationTier: (r.verification_tier as string | null) ?? "NONE",
          trust,
          ...(includeContent ? { contentMeta } : {}),
          ...(executeParams.intent === "execute"
            ? {
                agentExecution,
                policyMatch: item.policyMatch,
                executionFit,
                contractFreshnessHours,
                metricsFreshnessHours,
                fallbackCandidates: fallbacks ?? [],
                ...(executeParams.bundle ? { fallbacks } : {}),
                delegationHints,
                ...(executeParams.explain ? {
                  rankingSignals: {
                    ...item.rankingSignals,
                    finalScore: blendExecuteScore(item.rankingSignals.finalScore, gpg?.gpgScore ?? null),
                  },
                } : {}),
                ...(gpg ? { gpg } : {}),
              }
            : {}),
        };
      }

        return {
          ...base,
          url: r.url as string,
          homepage: r.homepage as string | null,
          primaryImageUrl: (r.primary_image_url as string | null) ?? null,
          source: r.source as string,
          sourceId: r.source_id as string,
          githubData: r.github_data as Record<string, unknown> | null,
          npmData: r.npm_data as Record<string, unknown> | null,
          openclawData: r.openclaw_data as Record<string, unknown> | null,
          languages: r.languages as string[] | null,
          claimStatus: (r.claim_status as string | null) ?? "UNCLAIMED",
          verificationTier: (r.verification_tier as string | null) ?? "NONE",
          hasCustomPage: Boolean(r.has_custom_page),
          createdAt: r.created_at as Date | null,
          trust,
          ...(includeContent ? { contentMeta } : {}),
          ...(executeParams.intent === "execute"
            ? {
                agentExecution,
                policyMatch: item.policyMatch,
                executionFit,
              contractFreshnessHours,
              metricsFreshnessHours,
              fallbackCandidates: fallbacks ?? [],
              ...(executeParams.bundle ? { fallbacks } : {}),
              delegationHints,
              ...(executeParams.explain ? {
                rankingSignals: {
                  ...item.rankingSignals,
                  finalScore: blendExecuteScore(item.rankingSignals.finalScore, gpg?.gpgScore ?? null),
                },
              } : {}),
              ...(gpg ? { gpg } : {}),
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

    if (includeContent) {
      results.sort((a, b) => {
        const aRank = Number((a as { overallRank?: number }).overallRank ?? 0);
        const bRank = Number((b as { overallRank?: number }).overallRank ?? 0);
        if (Math.round(aRank * 1000) !== Math.round(bRank * 1000)) return 0;
        const aQuality = Number(
          (a as { contentMeta?: { qualityScore?: number | null } }).contentMeta?.qualityScore ?? 0
        );
        const bQuality = Number(
          (b as { contentMeta?: { qualityScore?: number | null } }).contentMeta?.qualityScore ?? 0
        );
        return bQuality - aQuality;
      });
    }

    const nextCursor = hasMore
      ? (resultRows[resultRows.length - 1]?.id as string | undefined) ?? null
      : null;

    // --- Facets (single query, not separate) ---
    const facets = await getFacets(conditions);

    // --- "Did you mean?" when few or no results ---
    let didYouMean: string | null = null;
    if (rawQuery && results.length < 3) {
      didYouMean = await findDidYouMean(rawQuery);
    }
    const fallbackApplied = rawQuery.length > 0 && stageMatchMode !== "strict_lexical";
    const fallbackReason =
      results.length === 0 && rawQuery
        ? hasExplicitFilters
          ? "no-matches-with-current-filters"
          : "no-related-results"
        : undefined;
    const searchMeta = {
      fallbackApplied,
      matchMode: stageMatchMode,
      queryOriginal: rawQuery,
      queryInterpreted: interpretedTextQuery || strictTextQuery || rawQuery,
      filtersHonored: true,
      stagesTried,
      ...(fallbackReason
        ? {
            fallbackReason:
              stageNotes.length > 0 ? `${fallbackReason}; ${stageNotes.join(",")}` : fallbackReason,
          }
        : {}),
      ...(includeRankingDebug
        ? {
            diagnostics: {
              stageTimings,
              interpretedIsNaturalLanguage,
            },
          }
        : {}),
    };

    searchCircuitBreaker.recordSuccess();

    const responseBody = {
      results,
      pagination: {
        hasMore,
        nextCursor,
        ...(typeof totalMatches === "number" ? { total: totalMatches } : {}),
      },
      facets,
      searchMeta,
      ...(params.returnPlan && executeParams.intent === "execute"
        ? {
            executionPlan: {
              querySignature,
              taskType: executeParams.taskType ?? "general",
              primaryAgentId: results[0]?.id ?? null,
              primaryAgentSlug: results[0]?.slug ?? null,
              fallbackCandidates: (results[0] as { fallbackCandidates?: unknown[] } | undefined)
                ?.fallbackCandidates ?? [],
              delegationHints: (results[0] as { delegationHints?: unknown[] } | undefined)
                ?.delegationHints ?? [],
            },
          }
        : {}),
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
          matchMode: stageMatchMode,
          stagesTried,
          stageTimings,
          fallbackApplied,
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
      response.headers.set("X-Search-Match-Mode", stageMatchMode);
      response.headers.set("X-Search-Fallback", fallbackApplied ? "1" : "0");
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
    recordSearchOutcome(results.length > 0 ? "success" : "no_results");
    applyRequestIdHeader(response, req);
    recordApiResponse("/api/search", req, response, startedAt);
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
      recordSearchOutcome("fallback");
      applyRequestIdHeader(response, req);
      recordApiResponse("/api/search", req, response, startedAt);
      return response;
    }

    const response = NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: sanitizeError(err),
        },
        results: [],
        pagination: { hasMore: false, nextCursor: null, total: 0 },
        facets: { protocols: [] },
      },
      { status: 500 }
    );
    recordSearchOutcome("error");
    applyRequestIdHeader(response, req);
    recordApiResponse("/api/search", req, response, startedAt);
    return response;
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

function buildTrustSummary(
  handshake: { status: string; verifiedAt: Date | null } | undefined,
  reputation: { scoreTotal: number | null; computedAt: Date | null } | undefined
) {
  const lastVerifiedAt = handshake?.verifiedAt ?? reputation?.computedAt ?? null;
  const freshnessHours = lastVerifiedAt
    ? Math.round((Date.now() - lastVerifiedAt.getTime()) / (1000 * 60 * 60))
    : null;
  return {
    handshakeStatus: handshake?.status ?? "UNKNOWN",
    lastVerifiedAt: lastVerifiedAt ? lastVerifiedAt.toISOString() : null,
    verificationFreshnessHours: freshnessHours,
    reputationScore: reputation?.scoreTotal ?? null,
    receiptSupport: true,
  };
}
