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
    const useFullText = prefixQuery.length > 0;

    const esc = escapeLike(params.q);
    const searchCondition = useFullText
      ? (sql`search_vector @@ to_tsquery('english', ${prefixQuery})` as SQL)
      : (sql`(
          ${agents.name} ILIKE ${esc + "%"} OR
          ${agents.name} ILIKE ${"% " + esc + "%"} OR
          (${agents.description} IS NOT NULL AND ${agents.description} ILIKE ${"%" + esc + "%"})
        )` as SQL);

    const conditions = [...baseConditions, searchCondition];

    const rows = await db
      .select({
        id: agents.id,
        name: agents.name,
        slug: agents.slug,
        description: agents.description,
        protocols: agents.protocols,
      })
      .from(agents)
      .where(and(...conditions))
      .orderBy(desc(agents.overallRank), desc(agents.createdAt))
      .limit(params.limit);

    const suggestions = rows.map((r) => ({
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

    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error("[Search Suggest] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Suggest failed" },
      { status: 500 }
    );
  }
}
