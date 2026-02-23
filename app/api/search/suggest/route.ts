import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ZodError } from "zod";
import { db } from "@/lib/db";
import { agents, searchQueries } from "@/lib/db/schema";
import { and, eq, desc, sql, SQL, ilike } from "drizzle-orm";

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
      .select({
        name: agents.name,
      })
      .from(agents)
      .where(
        and(
          eq(agents.status, "ACTIVE"),
          sql`(${agents.name} ILIKE ${esc + "%"} OR ${agents.name} ILIKE ${"% " + esc + "%"})`,
        )
      )
      .orderBy(desc(agents.overallRank))
      .limit(10);

    // --- Tier 3: Capability/protocol completions matching the query ---
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

    // Build agent suggestions (top 3)
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

    // Build query suggestions - merge all tiers with deduplication
    const seen = new Set<string>();
    const querySuggestions: string[] = [];

    const addSuggestion = (text: string) => {
      const key = text.toLowerCase().trim();
      if (key.length < 2 || seen.has(key) || key === qLower) return;
      seen.add(key);
      querySuggestions.push(text.trim());
    };

    // Tier 1: Popular searches first (highest signal)
    for (const row of popularCompletions) {
      if (querySuggestions.length >= MAX_QUERY_SUGGESTIONS) break;
      addSuggestion(row.query);
    }

    // Tier 2: Agent names as completions
    for (const row of nameCompletionRows) {
      if (querySuggestions.length >= MAX_QUERY_SUGGESTIONS) break;
      addSuggestion(row.name);
    }

    // Tier 3: Matching capabilities that contain query tokens
    const capSet = new Set<string>();
    for (const r of matchingRows) {
      const caps = Array.isArray(r.capabilities) ? r.capabilities : [];
      for (const c of caps) {
        if (typeof c === "string" && c.length >= 2) {
          const normalized = c.toLowerCase().trim();
          if (normalized.includes(qLower) || qLower.includes(normalized)) {
            capSet.add(c.trim());
          }
        }
      }
    }
    const sortedCaps = [...capSet].sort((a, b) => a.length - b.length);
    for (const cap of sortedCaps) {
      if (querySuggestions.length >= MAX_QUERY_SUGGESTIONS) break;
      addSuggestion(cap);
    }

    // Tier 3b: Matching protocols
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
      addSuggestion(`${params.q} ${proto}`);
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
