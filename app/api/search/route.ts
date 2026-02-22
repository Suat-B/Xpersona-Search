import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ZodError } from "zod";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { and, eq, gte, desc, sql, SQL } from "drizzle-orm";

const SearchSchema = z.object({
  q: z.string().optional(),
  protocols: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(",").filter(Boolean) : [])),
  capabilities: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(",").filter(Boolean) : [])),
  minSafety: z.coerce.number().min(0).max(100).optional(),
  minRank: z.coerce.number().min(0).max(100).optional(),
  sort: z.enum(["rank", "safety", "popularity", "freshness"]).default("rank"),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(50).default(20),
});

type SearchParams = z.infer<typeof SearchSchema>;

function buildConditions(params: SearchParams): (ReturnType<typeof eq> | ReturnType<typeof gte> | SQL)[] {
  const conditions: (ReturnType<typeof eq> | ReturnType<typeof gte> | SQL)[] = [
    eq(agents.status, "ACTIVE"),
  ];
  if (params.minSafety != null) {
    conditions.push(gte(agents.safetyScore, params.minSafety));
  }
  if (params.minRank != null) {
    conditions.push(gte(agents.overallRank, params.minRank));
  }
  if (params.protocols.length > 0) {
    conditions.push(
      sql`${agents.protocols} ?| ARRAY[${sql.join(
        params.protocols.map((p) => sql`${p}`),
        sql`, `
      )}]::text[]`
    );
  }
  if (params.capabilities.length > 0) {
    const caps = params.capabilities.map((c) => c.toLowerCase());
    conditions.push(
      sql`${agents.capabilities} ?| ARRAY[${sql.join(
        caps.map((c) => sql`${c}`),
        sql`, `
      )}]::text[]`
    );
  }
  const qTrim = params.q?.trim();
  if (qTrim) {
    conditions.push(
      sql`search_vector @@ plainto_tsquery('english', ${qTrim})`
    );
  }
  return conditions;
}

async function getFacets(conditions: (ReturnType<typeof eq> | ReturnType<typeof gte> | SQL)[]) {
  const result = await db.execute(
    sql`
      SELECT elem AS protocol, count(*)::text AS count
      FROM agents, jsonb_array_elements_text(agents.protocols) AS elem
      WHERE ${and(...conditions)}
      GROUP BY elem
      ORDER BY count DESC
    `
  );
  const rows = (result as unknown as { rows?: Array<{ protocol: string; count: string }> }).rows ?? [];
  const protocols = rows.map((r) => ({
    protocol: [r.protocol],
    count: parseInt(r.count, 10) || 0,
  }));
  return { protocols };
}

export async function GET(req: NextRequest) {
  let params: SearchParams;
  try {
    params = SearchSchema.parse(
      Object.fromEntries(req.nextUrl.searchParams)
    );
  } catch (err) {
    if (err instanceof ZodError) {
      const msg = err.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    throw err;
  }

  try {
    const conditions = buildConditions(params);

    const orderBy =
      params.sort === "rank"
        ? desc(agents.overallRank)
        : params.sort === "safety"
          ? desc(agents.safetyScore)
          : params.sort === "popularity"
            ? desc(agents.popularityScore)
            : desc(agents.freshnessScore);

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

    if (params.cursor) {
      const [cursorRow] = await db
        .select({
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
          sql`(${sortCol}, ${agents.createdAt}, ${agents.id}) < (${cv}, ${cd}, ${params.cursor})`
        );
      }
    }

    const rows = await db
      .select({
        id: agents.id,
        name: agents.name,
        slug: agents.slug,
        description: agents.description,
        capabilities: agents.capabilities,
        protocols: agents.protocols,
        safetyScore: agents.safetyScore,
        popularityScore: agents.popularityScore,
        freshnessScore: agents.freshnessScore,
        overallRank: agents.overallRank,
        githubData: agents.githubData,
        createdAt: agents.createdAt,
      })
      .from(agents)
      .where(and(...allConditions))
      .orderBy(orderBy, desc(agents.createdAt), desc(agents.id))
      .limit(limit);

    const hasMore = rows.length > params.limit;
    const results = hasMore ? rows.slice(0, -1) : rows;
    const nextCursor = hasMore ? results[results.length - 1]?.id ?? null : null;

    const [facets, countResult] = await Promise.all([
      getFacets(conditions),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(agents)
        .where(and(...conditions)),
    ]);

    const total = Math.max(0, Number(countResult[0]?.count ?? 0));

    return NextResponse.json({
      results,
      pagination: { hasMore, nextCursor, total },
      facets,
    });
  } catch (err) {
    console.error("[Search] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Search failed" },
      { status: 500 }
    );
  }
}
