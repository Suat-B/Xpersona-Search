import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ZodError } from "zod";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { and, eq, desc, sql, SQL } from "drizzle-orm";

const SuggestSchema = z.object({
  q: z
    .string()
    .min(2, "Query must be at least 2 characters")
    .max(100)
    .transform((s) => s.trim()),
  limit: z.coerce.number().min(1).max(12).default(8),
});

type SuggestParams = z.infer<typeof SuggestSchema>;

/**
 * Build prefix tsquery for partial matching: "cry trad" -> "cry:* & trad:*"
 * Sanitizes to word chars only; returns empty if no valid tokens (fallback to ilike).
 */
function toPrefixTsQuery(q: string): string {
  const tokens = q
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^\w]/g, ""))
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return "";
  return tokens.map((t) => `${t}:*`).join(" & ");
}

/** Escape %, _ for safe use in ILIKE patterns. */
function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, (c) => `\\${c}`);
}

const DESC_TRUNCATE = 80;

/** Display-friendly casing for known protocols. */
function displayQuery(q: string): string {
  const lower = q.toLowerCase();
  if (lower === "openclaw" || lower === "openclew") return "OpenClaw";
  if (lower === "mcp") return "MCP";
  if (lower === "a2a") return "A2A";
  if (lower === "anp") return "ANP";
  return q;
}

const PREDEFINED_TERMS = [
  "games",
  "trading",
  "coding",
  "AI agents",
  "MCP servers",
  "agents",
];

const SUGGESTION_TEMPLATES: Array<(q: string, term: string) => string> = [
  (q, term) => `${term} on ${q}`,
  (q, term) => `${q} for ${term}`,
  (q, term) => `${q} ${term}`,
  (q, term) => `${term} with ${q}`,
];

const MAX_QUERY_SUGGESTIONS = 8;
const MAX_AGENT_SUGGESTIONS = 3;
const CAPABILITY_SAMPLE_LIMIT = 50;

export async function GET(req: NextRequest) {
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

  try {
    const baseConditions: (ReturnType<typeof eq> | SQL)[] = [
      eq(agents.status, "ACTIVE"),
    ];

    const prefixQuery = toPrefixTsQuery(params.q);
    const esc = escapeLike(params.q);
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

    const conditions = [...baseConditions, searchCondition];

    const rows = await db
      .select({
        id: agents.id,
        name: agents.name,
        slug: agents.slug,
        description: agents.description,
        protocols: agents.protocols,
        capabilities: agents.capabilities,
      })
      .from(agents)
      .where(and(...conditions))
      .orderBy(desc(agents.overallRank), desc(agents.createdAt))
      .limit(CAPABILITY_SAMPLE_LIMIT);

    const agentSuggestions = rows.slice(0, MAX_AGENT_SUGGESTIONS).map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description
        ? r.description.length > DESC_TRUNCATE
          ? r.description.slice(0, DESC_TRUNCATE) + "…"
          : r.description
        : null,
      protocols: Array.isArray(r.protocols) ? r.protocols : [],
    }));

    const capCounts = new Map<string, number>();
    for (const r of rows) {
      const caps = Array.isArray(r.capabilities) ? r.capabilities : [];
      for (const c of caps) {
        if (typeof c === "string" && c.length > 0) {
          const normalized = c.toLowerCase().trim();
          if (normalized.length >= 2 && !/[^\w\s-]/.test(normalized)) {
            capCounts.set(normalized, (capCounts.get(normalized) ?? 0) + 1);
          }
        }
      }
    }

    const dbTerms = [...capCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([term]) => term);

    const terms =
      dbTerms.length >= 3 ? dbTerms : [...new Set([...dbTerms, ...PREDEFINED_TERMS])];

    const qDisplay = displayQuery(params.q.toLowerCase());
    const seen = new Set<string>();
    const querySuggestions: string[] = [];

    for (const term of terms) {
      const termDisplay = term.charAt(0).toUpperCase() + term.slice(1);
      for (const tmpl of SUGGESTION_TEMPLATES) {
        const phrase = tmpl(qDisplay, termDisplay);
        const key = phrase.toLowerCase();
        if (!seen.has(key) && phrase !== qDisplay) {
          seen.add(key);
          querySuggestions.push(phrase);
          if (querySuggestions.length >= MAX_QUERY_SUGGESTIONS) break;
        }
      }
      if (querySuggestions.length >= MAX_QUERY_SUGGESTIONS) break;
    }

    return NextResponse.json({
      querySuggestions: querySuggestions.slice(0, MAX_QUERY_SUGGESTIONS),
      agentSuggestions,
    });
  } catch (err) {
    console.error("[Search Suggest] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Suggest failed" },
      { status: 500 }
    );
  }
}
