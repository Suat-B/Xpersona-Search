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
import { TASK_TYPES } from "@/lib/search/taxonomy";
import { SUGGEST_ENTITIES } from "@/lib/search/suggest-entities";
import { applyRequestIdHeader, jsonError } from "@/lib/api/errors";
import { recordApiResponse } from "@/lib/metrics/record";

const SuggestSchema = z.object({
  q: z
    .string()
    .min(2, "Query must be at least 2 characters")
    .max(100)
    .transform((s) => s.trim()),
  limit: z.coerce.number().min(1).max(12).default(8),
  intent: z.enum(["discover", "execute"]).default("discover"),
});

type SuggestParams = z.infer<typeof SuggestSchema>;

function toExternalProtocolName(protocol: string): string {
  if (protocol.toUpperCase() === "OPENCLEW") return "OPENCLAW";
  return protocol;
}

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
const MAX_PROTOCOL_APPENDS = 2;
const DEFAULT_MIN_RESULTS = 7;

const NATURAL_BONUS = 12;
const TECHNICAL_PENALTY = 14;
const MIN_NATURAL_SCORE = -8;
const MIN_NON_TECH_CAP_WORDS = 2;

const STOPWORDS = new Set([
  "a", "an", "and", "be", "for", "in", "is", "it", "of", "on", "or", "the", "to",
]);

const INTENT_TERMS = [
  "find",
  "best",
  "for",
  "with",
  "how to",
  "compare",
  "near me",
  "for beginners",
  "top",
  "what is",
];

const TECHNICAL_TERMS = [
  "npm",
  "pypi",
  "crate",
  "pip",
  "package",
  "library",
  "sdk",
  "plugin",
];

const QUESTION_PREFIXES = [
  "why is",
  "what is",
  "how to",
  "how do",
  "how can",
  "what are",
  "who is",
  "where is",
  "when is",
  "can i",
  "should i",
] as const;

const QUESTION_TAILS = [
  "important",
  "popular",
  "controversial",
  "useful",
  "trusted",
  "in the news",
  "so valuable",
  "so powerful",
] as const;

const QUESTION_BLOCKLIST = [
  "tutorial",
  "guide",
  "step by step",
  "best practices",
  "for beginners",
  "mcp",
  "openclaw",
  "task:",
  "requires:",
  "forbidden:",
  "dataregion:",
] as const;

type CandidateSource = "popular" | "name" | "capability" | "protocol";
type CandidateSourceV2 =
  | CandidateSource
  | "template"
  | "entity"
  | "fallback";

interface ParsedQueryIntent {
  query: string;
  lower: string;
  tokens: string[];
  actionToken: string | null;
  slotPreposition: string | null;
  stablePrefix: string | null;
  mutableEntity: string | null;
}

interface SuggestionCandidateV2 {
  text: string;
  source: CandidateSourceV2;
  confidence: number;
  templateId: string | null;
  semanticSignals: string[];
}

function isIncompletePhrase(text: string): boolean {
  const last = text.trim().toLowerCase().split(/\s+/).pop() ?? "";
  return STOPWORDS.has(last);
}

function sanitizeError(err: unknown): string {
  if (process.env.NODE_ENV !== "production" && err instanceof Error) return err.message;
  return "Suggest temporarily unavailable";
}

function isTechnicalQuery(query: string): boolean {
  const q = query.toLowerCase();
  return TECHNICAL_TERMS.some((term) => q.includes(term)) || /[._/-]/.test(q);
}

function isQuestionQuery(query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q.endsWith("?")) return true;
  return QUESTION_PREFIXES.some((prefix) => q.startsWith(prefix));
}

function isQuestionUnsafeSuggestion(text: string): boolean {
  const t = text.toLowerCase();
  return QUESTION_BLOCKLIST.some((token) => t.includes(token));
}

function hasVersionLikeTail(text: string): boolean {
  return /\bv?\d+(\.\d+){0,2}\b/i.test(text);
}

function isPackageLikeText(text: string): boolean {
  const t = text.toLowerCase().trim();
  if (TECHNICAL_TERMS.some((term) => t.includes(term))) return true;
  if (hasVersionLikeTail(t)) return true;
  if (/^[a-z0-9]+([_-][a-z0-9]+)+$/i.test(t)) return true;
  if (/^[a-z]+(?:[A-Z][a-z0-9]+)+$/.test(text.trim())) return true;
  const punctCount = (t.match(/[._/@:-]/g) ?? []).length;
  if (punctCount >= 2) return true;
  return false;
}

function looksMalformed(text: string): boolean {
  const t = text.trim();
  if (t.length < 2) return true;
  if (/[<>]/.test(t)) return true;
  if (/^[^a-z0-9]+$/i.test(t)) return true;
  return false;
}

function toIntEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.floor(parsed);
}

function getSuggestBounds(limit: number): { minResults: number; maxResults: number } {
  const configuredMin = Math.max(1, toIntEnv(process.env.SEARCH_SUGGEST_MIN_RESULTS, DEFAULT_MIN_RESULTS));
  const configuredMax = Math.max(configuredMin, toIntEnv(process.env.SEARCH_SUGGEST_MAX_RESULTS, MAX_QUERY_SUGGESTIONS));
  const maxResults = Math.min(limit, configuredMax);
  const minResults = limit < configuredMin ? Math.min(limit, maxResults) : Math.min(configuredMin, maxResults);
  return { minResults, maxResults };
}

function normalizeSkeleton(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseQueryIntent(query: string): ParsedQueryIntent {
  const trimmed = query.trim();
  const lower = trimmed.toLowerCase();
  const tokens = lower.split(/\s+/).filter(Boolean);
  const actionToken = tokens.find((token) =>
    ["deploy", "build", "create", "run", "host", "launch", "publish", "automate", "integrate"].includes(token)
  ) ?? null;

  const prepMatch = lower.match(/\b(on|for|with|in|via|using)\s+([a-z0-9.+/_-]{2,})\s*$/i);
  const slotPreposition = prepMatch?.[1]?.toLowerCase() ?? null;
  const mutableEntity = prepMatch?.[2]?.toLowerCase() ?? null;
  const stablePrefix = prepMatch ? trimmed.slice(0, prepMatch.index).trim() : null;

  return {
    query: trimmed,
    lower,
    tokens,
    actionToken,
    slotPreposition,
    stablePrefix,
    mutableEntity,
  };
}

function sourceWeight(source: CandidateSourceV2): number {
  switch (source) {
    case "popular":
      return 12;
    case "template":
      return 10;
    case "entity":
      return 9;
    case "capability":
      return 8;
    case "name":
      return 6;
    case "protocol":
      return 5;
    case "fallback":
      return 2;
    default:
      return 1;
  }
}

function addCandidate(
  target: SuggestionCandidateV2[],
  text: string,
  source: CandidateSourceV2,
  confidence: number,
  templateId: string | null,
  semanticSignals: string[]
) {
  target.push({ text, source, confidence, templateId, semanticSignals });
}

function scoreNaturalness(text: string, qLower: string, queryIsTechnical: boolean): number {
  const raw = text.trim();
  const lower = raw.toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean);
  let score = 0;

  if (raw.length >= 8 && raw.length <= 60) score += NATURAL_BONUS;
  if (words.length >= 2) score += NATURAL_BONUS;
  if (lower.startsWith(qLower)) score += 10;
  else if (lower.includes(qLower)) score += 5;

  if (INTENT_TERMS.some((term) => lower.includes(term))) score += 9;

  if (words.length === 1 && raw.length <= 3 && !lower.startsWith(qLower)) score -= 12;

  if (isPackageLikeText(raw) && !queryIsTechnical) score -= TECHNICAL_PENALTY;

  return score;
}

function generateTemplateVariants(
  parsed: ParsedQueryIntent,
  entityPool: string[],
  queryIsTechnical: boolean
): SuggestionCandidateV2[] {
  if (!parsed.stablePrefix || !parsed.slotPreposition) return [];
  const out: SuggestionCandidateV2[] = [];
  const base = parsed.stablePrefix.trim();
  const prep = parsed.slotPreposition;
  const originalEntity = parsed.mutableEntity;
  const uniqueEntities = [...new Set(entityPool.map((e) => e.toLowerCase().trim()).filter(Boolean))];
  for (const entity of uniqueEntities) {
    if (entity === originalEntity) continue;
    if (!queryIsTechnical && isPackageLikeText(entity)) continue;
    addCandidate(
      out,
      `${base} ${prep} ${entity}`,
      "template",
      0.9,
      "entity-substitute",
      ["prefix-preserved", "entity-substituted"]
    );
    if (out.length >= 20) break;
  }
  return out;
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
    recordApiResponse("/api/search/suggest", req, response, startedAt);
    return response;
  }

  let params: SuggestParams;
  try {
    params = SuggestSchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  } catch (err) {
    if (err instanceof ZodError) {
      const msg = err.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
      const response = jsonError(req, {
        code: "BAD_REQUEST",
        message: msg,
        status: 400,
      });
      recordApiResponse("/api/search/suggest", req, response, startedAt);
      return response;
    }
    throw err;
  }

  // Sanitize input
  params = { ...params, q: sanitizeForStorage(params.q) };
  const clientType = req.headers.get("x-client-type")?.toLowerCase() ?? "";
  const executeSuggestMode =
    params.intent === "execute" ||
    clientType === "agent" ||
    process.env.SEARCH_EXECUTE_SUGGEST_ENABLED === "1";

  // Cache check
  const cacheKey = buildCacheKey({
    v: "suggest-v3",
    endpoint: "suggest",
    q: params.q,
    limit: params.limit,
    intent: params.intent,
    executeSuggestMode,
  });
  const cached = suggestCache.get(cacheKey);
  if (cached) {
    const response = NextResponse.json(cached);
    response.headers.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
    response.headers.set("X-Cache", "HIT");
    applyRequestIdHeader(response, req);
    recordApiResponse("/api/search/suggest", req, response, startedAt);
    return response;
  }

  // Circuit breaker
  if (!suggestCircuitBreaker.isAllowed()) {
    const response = NextResponse.json(
      {
        querySuggestions: [],
        agentSuggestions: [],
        error: {
          code: "CIRCUIT_OPEN",
          message: "Suggest is temporarily degraded. Please try again shortly.",
          retryAfterMs: 15_000,
        },
      },
      { status: 503, headers: { "Retry-After": "15" } }
    );
    applyRequestIdHeader(response, req);
    recordApiResponse("/api/search/suggest", req, response, startedAt);
    return response;
  }

  try {
    const qLower = params.q.toLowerCase();
    const qSkeleton = normalizeSkeleton(params.q);
    const esc = escapeLike(params.q);
    const questionMode = isQuestionQuery(params.q);
    const bounds = getSuggestBounds(params.limit);
    const maxQuerySuggestions = bounds.maxResults;
    const minQuerySuggestions = questionMode
      ? Math.max(3, bounds.minResults - 2)
      : bounds.minResults;
    const relevanceFloor = toIntEnv(process.env.SEARCH_SUGGEST_V2_RELEVANCE_FLOOR, MIN_NATURAL_SCORE);
    const enableTemplateExpansion =
      process.env.SEARCH_SUGGEST_V2_ENABLE_TEMPLATE_EXPANSION !== "0" && !questionMode;
    const queryIsTechnical = isTechnicalQuery(params.q) || executeSuggestMode;
    const parsedIntent = parseQueryIntent(params.q);
    const sourceUsage = new Set<string>();

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
      .limit(maxQuerySuggestions);
    if (executeSuggestMode) {
      for (const task of TASK_TYPES) {
        popularCompletions.push({ query: `task:${task}`, count: 0 });
      }
      popularCompletions.push(
        { query: "requires:mcp", count: 0 },
        { query: "requires:streaming", count: 0 },
        { query: "forbidden:rate_limit", count: 0 },
        { query: "dataRegion:us", count: 0 }
      );
    }
    if (popularCompletions.length > 0) sourceUsage.add("popular");

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
    if (nameCompletionRows.length > 0) sourceUsage.add("name");

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
    if (matchingRows.length > 0) sourceUsage.add("corpus");

    const agentSuggestions = matchingRows.slice(0, MAX_AGENT_SUGGESTIONS).map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description
        ? r.description.length > DESC_TRUNCATE
          ? r.description.slice(0, DESC_TRUNCATE) + "\u2026"
          : r.description
        : null,
      protocols: Array.isArray(r.protocols)
        ? r.protocols.map((p) => toExternalProtocolName(String(p)))
        : [],
    }));

    const candidates: SuggestionCandidateV2[] = [];
    for (const row of popularCompletions) {
      if (questionMode) {
        const lower = row.query.toLowerCase();
        if (!lower.startsWith(qLower)) continue;
        if (isQuestionUnsafeSuggestion(lower)) continue;
      }
      addCandidate(candidates, row.query, "popular", 0.95, null, ["history"]);
    }
    if (!questionMode) {
      for (const row of nameCompletionRows) {
        addCandidate(candidates, row.name, "name", 0.6, null, ["agent-name"]);
      }
    }

    if (!questionMode) {
      const capSet = new Set<string>();
      for (const r of matchingRows) {
        const caps = Array.isArray(r.capabilities) ? r.capabilities : [];
        for (const c of caps) {
          if (typeof c === "string" && c.length >= 2) {
            const normalized = c.toLowerCase().trim();
            if (STOPWORDS.has(normalized)) continue;
            if (qLower.includes(normalized)) continue;
            if (!normalized.includes(qLower)) continue;
            if (!queryIsTechnical && isPackageLikeText(normalized)) continue;
            if (!queryIsTechnical && normalized.split(/\s+/).length < MIN_NON_TECH_CAP_WORDS) continue;
            capSet.add(c.trim());
          }
        }
      }
      const sortedCaps = [...capSet].sort((a, b) => a.length - b.length);
      for (const cap of sortedCaps) {
        addCandidate(candidates, cap, "capability", 0.7, null, ["capability"]);
      }
    }

    const protoSet = new Set<string>();
    if (queryIsTechnical && !questionMode) {
      for (const r of matchingRows) {
        const protos = Array.isArray(r.protocols) ? r.protocols : [];
        for (const p of protos) {
          if (typeof p === "string" && p.length >= 2) {
            protoSet.add(p);
          }
        }
      }
      for (const proto of protoSet) {
        const externalProto = toExternalProtocolName(proto);
        const label = PROTOCOL_LABELS[proto] ?? PROTOCOL_LABELS[externalProto] ?? externalProto;
        addCandidate(candidates, `${params.q} ${label}`, "protocol", 0.45, "protocol-append", ["protocol"]);
      }
    }

    const corpusEntities = new Set<string>();
    for (const row of matchingRows) {
      if (Array.isArray(row.protocols)) {
        for (const p of row.protocols) {
          if (typeof p === "string" && p.length >= 2) corpusEntities.add(p.toLowerCase());
        }
      }
      if (Array.isArray(row.capabilities)) {
        for (const c of row.capabilities) {
          if (typeof c === "string" && c.length >= 2 && c.length <= 32) {
            const token = c.toLowerCase().trim();
            if (!token.includes(" ")) corpusEntities.add(token);
          }
        }
      }
    }
    const hybridEntities = [...new Set([...SUGGEST_ENTITIES, ...corpusEntities])];
    if (hybridEntities.length > 0) sourceUsage.add("entity");
    if (!questionMode) {
      for (const entity of hybridEntities) {
        if (!parsedIntent.slotPreposition || !parsedIntent.stablePrefix) break;
        if (entity === parsedIntent.mutableEntity) continue;
        addCandidate(
          candidates,
          `${parsedIntent.stablePrefix} ${parsedIntent.slotPreposition} ${entity}`,
          "entity",
          0.8,
          "hybrid-entity",
          ["entity-replace"]
        );
      }
    }

    if (enableTemplateExpansion) {
      const templateCandidates = generateTemplateVariants(parsedIntent, hybridEntities, queryIsTechnical);
      for (const candidate of templateCandidates) candidates.push(candidate);
      if (templateCandidates.length > 0) sourceUsage.add("template");
    }

    const seen = new Set<string>();
    const ranked = candidates
      .map((candidate, index) => ({
        ...candidate,
        index,
        key: normalizeSkeleton(candidate.text),
        score:
          scoreNaturalness(candidate.text, qLower, queryIsTechnical) +
          sourceWeight(candidate.source) +
          Math.round(candidate.confidence * 8) +
          (parsedIntent.stablePrefix && normalizeSkeleton(candidate.text).startsWith(normalizeSkeleton(parsedIntent.stablePrefix))
            ? 8
            : 0) +
          (parsedIntent.actionToken && normalizeSkeleton(candidate.text).includes(parsedIntent.actionToken) ? 6 : 0),
      }))
      .filter((c) => {
        if (!c.key || c.key.length < 2) return false;
        if (c.key === qSkeleton) return false;
        if (STOPWORDS.has(c.key)) return false;
        if (isIncompletePhrase(c.text)) return false;
        if (qSkeleton.includes(c.key) && c.key.length < 8) return false;
        if (looksMalformed(c.text)) return false;
        if (questionMode && !c.text.toLowerCase().startsWith(qLower)) return false;
        if (questionMode && isQuestionUnsafeSuggestion(c.text)) return false;
        if (!queryIsTechnical && c.score < relevanceFloor) return false;
        return true;
      })
      .sort((a, b) => b.score - a.score || a.index - b.index);

    const querySuggestions: string[] = [];
    let protocolAdded = 0;
    let generationUsed = false;

    for (const item of ranked) {
      if (querySuggestions.length >= maxQuerySuggestions) break;
      if (seen.has(item.key)) continue;
      if (
        item.source === "protocol" &&
        !queryIsTechnical &&
        (querySuggestions.length >= maxQuerySuggestions - 1 || protocolAdded >= MAX_PROTOCOL_APPENDS)
      ) {
        continue;
      }
      seen.add(item.key);
      querySuggestions.push(item.text.trim());
      if (item.source === "protocol") protocolAdded += 1;
    }

    if (querySuggestions.length < minQuerySuggestions) {
      const fallbackQueue: SuggestionCandidateV2[] = [];
      for (const entity of hybridEntities) {
        if (!parsedIntent.stablePrefix || !parsedIntent.slotPreposition) break;
        if (entity === parsedIntent.mutableEntity) continue;
        addCandidate(
          fallbackQueue,
          `${parsedIntent.stablePrefix} ${parsedIntent.slotPreposition} ${entity}`,
          "fallback",
          0.65,
          "hard-fill-prefix",
          ["hard-fill"]
        );
      }
      if (fallbackQueue.length === 0) {
        const suffixes = questionMode
          ? QUESTION_TAILS
          : ["tutorial", "guide", "step by step", "best practices", "for beginners", "without coding"];
        for (const suffix of suffixes) {
          const candidateText = `${params.q} ${suffix}`.trim();
          if (questionMode && !candidateText.toLowerCase().startsWith(qLower)) continue;
          addCandidate(
            fallbackQueue,
            candidateText,
            "fallback",
            0.45,
            questionMode ? "question-tail" : "hard-fill-suffix",
            ["hard-fill"]
          );
        }
      }
      for (const item of fallbackQueue) {
        if (querySuggestions.length >= minQuerySuggestions || querySuggestions.length >= maxQuerySuggestions) break;
        const key = normalizeSkeleton(item.text);
        if (!key || seen.has(key) || looksMalformed(item.text) || isIncompletePhrase(item.text)) continue;
        seen.add(key);
        querySuggestions.push(item.text.trim());
        generationUsed = true;
      }
      if (querySuggestions.length > 0) sourceUsage.add("fallback");
    }

    suggestCircuitBreaker.recordSuccess();

    const responseBody = {
      querySuggestions: querySuggestions.slice(0, maxQuerySuggestions),
      agentSuggestions,
      meta: {
        countRequested: params.limit,
        countReturned: querySuggestions.slice(0, maxQuerySuggestions).length,
        generationUsed,
        relevanceFloorApplied: true,
        sourcesUsed: [...sourceUsage],
      },
    };

    suggestCache.set(cacheKey, responseBody);

    const response = NextResponse.json(responseBody);
    response.headers.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
    response.headers.set("X-Cache", "MISS");
    applyRequestIdHeader(response, req);
    recordApiResponse("/api/search/suggest", req, response, startedAt);
    return response;
  } catch (err) {
    console.error("[Search Suggest] Error:", err);
    suggestCircuitBreaker.recordFailure();

    const stale = suggestCache.get(cacheKey);
    if (stale) {
      const response = NextResponse.json(stale);
      response.headers.set("X-Cache", "STALE");
      applyRequestIdHeader(response, req);
      recordApiResponse("/api/search/suggest", req, response, startedAt);
      return response;
    }

    const response = NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: sanitizeError(err),
        },
        querySuggestions: [],
        agentSuggestions: [],
      },
      { status: 500 }
    );
    applyRequestIdHeader(response, req);
    recordApiResponse("/api/search/suggest", req, response, startedAt);
    return response;
  }
}
