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

type CandidateSource = "popular" | "name" | "capability" | "protocol";

interface CandidateSuggestion {
  text: string;
  source: CandidateSource;
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
    const maxQuerySuggestions = Math.min(params.limit, MAX_QUERY_SUGGESTIONS);
    const queryIsTechnical = isTechnicalQuery(params.q);

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
      protocols: Array.isArray(r.protocols)
        ? r.protocols.map((p) => toExternalProtocolName(String(p)))
        : [],
    }));

    const candidates: CandidateSuggestion[] = [];
    for (const row of popularCompletions) {
      candidates.push({ text: row.query, source: "popular" });
    }
    for (const row of nameCompletionRows) {
      candidates.push({ text: row.name, source: "name" });
    }

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
      candidates.push({ text: cap, source: "capability" });
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
      const externalProto = toExternalProtocolName(proto);
      const label = PROTOCOL_LABELS[proto] ?? PROTOCOL_LABELS[externalProto] ?? externalProto;
      candidates.push({ text: `${params.q} ${label}`, source: "protocol" });
    }

    const seen = new Set<string>();
    const ranked = candidates
      .map((candidate, index) => ({
        ...candidate,
        index,
        key: candidate.text.toLowerCase().trim(),
        score: scoreNaturalness(candidate.text, qLower, queryIsTechnical),
      }))
      .filter((c) => {
        if (!c.key || c.key.length < 2) return false;
        if (c.key === qLower) return false;
        if (STOPWORDS.has(c.key)) return false;
        if (isIncompletePhrase(c.text)) return false;
        if (qLower.includes(c.key) && c.key.length < 8) return false;
        if (looksMalformed(c.text)) return false;
        if (!queryIsTechnical && c.score < MIN_NATURAL_SCORE) return false;
        return true;
      })
      .sort((a, b) => b.score - a.score || a.index - b.index);

    const querySuggestions: string[] = [];
    let protocolAdded = 0;

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

    suggestCircuitBreaker.recordSuccess();

    const responseBody = {
      querySuggestions: querySuggestions.slice(0, maxQuerySuggestions),
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
