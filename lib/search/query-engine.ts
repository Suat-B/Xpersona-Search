import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

/**
 * Static synonym map for AI/agent domain terminology.
 * Keys are normalized lowercase terms; values are arrays of expansions.
 */
const SYNONYM_MAP: Record<string, string[]> = {
  chatbot: ["conversational ai", "chat agent", "dialogue system"],
  llm: ["large language model", "language model"],
  ml: ["machine learning"],
  ai: ["artificial intelligence"],
  nlp: ["natural language processing"],
  cv: ["computer vision"],
  rag: ["retrieval augmented generation"],
  genai: ["generative ai", "generative artificial intelligence"],
  devops: ["development operations", "ci cd"],
  api: ["application programming interface", "rest api", "graphql"],
  bot: ["chatbot", "automation agent"],
  scraper: ["web scraper", "web crawler", "data extraction"],
  embeddings: ["vector embeddings", "text embeddings"],
  finetuning: ["fine tuning", "model training"],
  "code review": ["code analysis", "static analysis"],
  "code generation": ["code synthesis", "code completion"],
  trading: ["algorithmic trading", "quantitative trading"],
  crypto: ["cryptocurrency", "blockchain", "web3"],
  sql: ["database query", "structured query language"],
  vector: ["vector database", "vector store", "embeddings"],
  agent: ["ai agent", "autonomous agent"],
  mcp: ["model context protocol"],
  a2a: ["agent to agent"],
  openclew: ["openclaw"],
};

const HTML_STRIP_RE = /[<>]/g;
const WHITESPACE_COLLAPSE_RE = /\s+/g;
const DANGEROUS_CHARS_RE = /[\\;'"]/g;

export interface ParsedQuery {
  textQuery: string;
  fieldFilters: {
    protocol?: string;
    lang?: string;
    safety?: string;
    source?: string;
  };
  originalQuery: string;
}

/**
 * Normalizes a raw query: trim, lowercase, collapse whitespace,
 * strip HTML/dangerous characters.
 */
export function normalizeQuery(raw: string): string {
  return raw
    .trim()
    .replace(HTML_STRIP_RE, "")
    .replace(WHITESPACE_COLLAPSE_RE, " ")
    .slice(0, 500);
}

/**
 * Strips HTML angle brackets from input to prevent stored XSS.
 */
export function sanitizeForStorage(input: string): string {
  return input.replace(HTML_STRIP_RE, "").trim();
}

const FIELD_OPERATOR_RE =
  /\b(protocol|lang|language|safety|source):(\S+)/gi;

/**
 * Parses inline field operators out of a search query string.
 *
 * Supported operators:
 *   protocol:MCP  -> filter by protocol
 *   lang:python   -> filter by language
 *   safety:>80    -> filter by minimum safety score
 *   source:github -> filter by source
 *
 * Returns the remaining text query (with operators stripped) and
 * extracted field filters.
 */
export function parseSearchOperators(query: string): ParsedQuery {
  const fieldFilters: ParsedQuery["fieldFilters"] = {};
  const originalQuery = query;

  const textQuery = query
    .replace(FIELD_OPERATOR_RE, (_, field: string, value: string) => {
      const f = field.toLowerCase();
      switch (f) {
        case "protocol":
          fieldFilters.protocol = value.toUpperCase().replace(/^OPENCLAW$/i, "OPENCLEW");
          break;
        case "lang":
        case "language":
          fieldFilters.lang = value.toLowerCase();
          break;
        case "safety":
          fieldFilters.safety = value;
          break;
        case "source":
          fieldFilters.source = value.toUpperCase();
          break;
      }
      return "";
    })
    .replace(WHITESPACE_COLLAPSE_RE, " ")
    .trim();

  return { textQuery, fieldFilters, originalQuery };
}

/**
 * Expands a query with synonyms from the static map.
 * Returns the original query OR'd with synonym expansions
 * in websearch_to_tsquery-compatible format.
 *
 * For websearch_to_tsquery: words are implicitly ANDed,
 * OR is an explicit keyword, "phrases" are exact.
 */
export function expandWithSynonyms(query: string): string {
  const lowerTokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const expansions: string[] = [];

  for (const token of lowerTokens) {
    const clean = token.replace(DANGEROUS_CHARS_RE, "");
    if (SYNONYM_MAP[clean]) {
      for (const synonym of SYNONYM_MAP[clean]) {
        if (!expansions.includes(synonym)) {
          expansions.push(synonym);
        }
      }
    }
  }

  const multiWordKey = lowerTokens.join(" ").replace(DANGEROUS_CHARS_RE, "");
  if (SYNONYM_MAP[multiWordKey]) {
    for (const synonym of SYNONYM_MAP[multiWordKey]) {
      if (!expansions.includes(synonym)) {
        expansions.push(synonym);
      }
    }
  }

  if (expansions.length === 0) return query;

  const parts = [query, ...expansions.map((s) => `"${s}"`)];
  return parts.join(" OR ");
}

/**
 * Builds a safe websearch_to_tsquery string from user input.
 * Handles edge cases where websearch_to_tsquery might throw
 * (empty string, only operators, etc.).
 */
export function buildWebsearchQuery(query: string): string {
  const cleaned = query
    .replace(DANGEROUS_CHARS_RE, "")
    .replace(WHITESPACE_COLLAPSE_RE, " ")
    .trim();
  if (cleaned.length === 0) return "";
  return cleaned;
}

/**
 * Finds a "did you mean?" suggestion when search returns 0 or very few results.
 * Uses pg_trgm similarity against the search_queries table (popular past queries)
 * and agent names.
 */
export async function findDidYouMean(
  query: string,
  minSimilarity = 0.25
): Promise<string | null> {
  const normalized = query.toLowerCase().trim();
  if (normalized.length < 2) return null;

  try {
    const result = await db.execute(
      sql`SELECT query, similarity(normalized_query, ${normalized}) AS sim
          FROM search_queries
          WHERE normalized_query % ${normalized}
            AND normalized_query != ${normalized}
            AND count >= 2
          ORDER BY sim DESC, count DESC
          LIMIT 1`
    );
    const rows = (result as unknown as { rows?: Array<{ query: string; sim: number }> }).rows ?? [];
    if (rows.length > 0 && rows[0].sim >= minSimilarity) {
      return rows[0].query;
    }

    const agentResult = await db.execute(
      sql`SELECT name, similarity(lower(name), ${normalized}) AS sim
          FROM agents
          WHERE status = 'ACTIVE'
            AND lower(name) % ${normalized}
            AND lower(name) != ${normalized}
          ORDER BY sim DESC, overall_rank DESC
          LIMIT 1`
    );
    const agentRows = (agentResult as unknown as { rows?: Array<{ name: string; sim: number }> }).rows ?? [];
    if (agentRows.length > 0 && agentRows[0].sim >= minSimilarity) {
      return agentRows[0].name;
    }

    return null;
  } catch (err) {
    console.error("[QueryEngine] didYouMean lookup failed:", err);
    return null;
  }
}

/**
 * Constructs the full search pipeline: normalize -> parse operators ->
 * expand synonyms -> build websearch query.
 */
export function processQuery(rawQuery: string): {
  parsed: ParsedQuery;
  expandedQuery: string;
  websearchInput: string;
} {
  const normalized = normalizeQuery(rawQuery);
  const parsed = parseSearchOperators(normalized);
  const expandedQuery = expandWithSynonyms(parsed.textQuery);
  const websearchInput = buildWebsearchQuery(expandedQuery);
  return { parsed, expandedQuery, websearchInput };
}
