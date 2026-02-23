import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ZodError } from "zod";
import { db } from "@/lib/db";
import { agents, searchQueries } from "@/lib/db/schema";
import { and, eq, gte, desc, sql, SQL } from "drizzle-orm";

function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, (c) => `\\${c}`);
}

const SearchSchema = z.object({
  q: z.string().optional(),
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

function buildConditions(params: SearchParams): SQL[] {
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
  return conditions;
}

function buildTextCondition(qTrim: string): SQL {
  const escaped = escapeLike(qTrim);
  const pattern = `%${escaped}%`;
  return sql`(
    search_vector @@ plainto_tsquery('english', ${qTrim})
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
  const rows = (result as unknown as { rows?: Array<{ protocol: string; count: string }> }).rows ?? [];
  const protocols = rows.map((r) => ({
    protocol: [r.protocol],
    count: parseInt(r.count, 10) || 0,
  }));
  return { protocols };
}

function trackSearchQuery(query: string) {
  const normalized = query.toLowerCase().trim();
  if (normalized.length < 2 || normalized.length > 200) return;
  db.execute(
    sql`INSERT INTO search_queries (id, query, normalized_query, count, last_searched_at, created_at)
        VALUES (gen_random_uuid(), ${query.trim()}, ${normalized}, 1, now(), now())
        ON CONFLICT (normalized_query)
        DO UPDATE SET count = search_queries.count + 1,
                      last_searched_at = now(),
                      query = CASE WHEN length(${query.trim()}) > 0 THEN ${query.trim()} ELSE search_queries.query END`
  ).catch((err) => console.error("[Search Track] Error:", err));
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
    const filterConditions = buildConditions(params);
    const qTrim = params.q?.trim();
    const useRelevance = !!qTrim && params.sort === "rank";

    if (qTrim) trackSearchQuery(qTrim);

    const conditions: SQL[] = [...filterConditions];
    if (qTrim) {
      conditions.push(buildTextCondition(qTrim));
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

    if (params.cursor) {
      if (useRelevance) {
        const cursorRows = await db.execute(
          sql`SELECT
                CASE WHEN homepage IS NOT NULL AND homepage != '' THEN 1 ELSE 0 END AS has_homepage,
                ts_rank(search_vector, plainto_tsquery('english', ${qTrim})) AS relevance,
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
              ts_rank(search_vector, plainto_tsquery('english', ${qTrim})),
              ${agents.overallRank},
              ${agents.createdAt},
              ${agents.id}
            ) < (
              ${Number(cr.has_homepage)},
              ${Number(cr.relevance)},
              ${Number(cr.overall_rank)},
              ${cr.created_at as Date ?? new Date(0)},
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

    let rows;
    if (useRelevance) {
      const rawResult = await db.execute(
        sql`SELECT
              id, name, slug, description, url, homepage, source, source_id,
              capabilities, protocols, safety_score, popularity_score,
              freshness_score, overall_rank, github_data, npm_data,
              languages, created_at,
              ts_rank(search_vector, plainto_tsquery('english', ${qTrim})) AS relevance
            FROM agents
            WHERE ${and(...allConditions)}
            ORDER BY
              CASE WHEN homepage IS NOT NULL AND homepage != '' THEN 1 ELSE 0 END DESC,
              relevance DESC, overall_rank DESC, created_at DESC, id DESC
            LIMIT ${limit}`
      );
      const raw = (rawResult as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? [];
      rows = raw.map((r) => ({
        id: r.id as string,
        name: r.name as string,
        slug: r.slug as string,
        description: r.description as string | null,
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
        createdAt: r.created_at as Date | null,
      }));
    } else {
      const orderBy =
        params.sort === "rank"
          ? desc(agents.overallRank)
          : params.sort === "safety"
            ? desc(agents.safetyScore)
            : params.sort === "popularity"
              ? desc(agents.popularityScore)
              : desc(agents.freshnessScore);

      rows = await db
        .select({
          id: agents.id,
          name: agents.name,
          slug: agents.slug,
          description: agents.description,
          url: agents.url,
          homepage: agents.homepage,
          source: agents.source,
          sourceId: agents.sourceId,
          capabilities: agents.capabilities,
          protocols: agents.protocols,
          safetyScore: agents.safetyScore,
          popularityScore: agents.popularityScore,
          freshnessScore: agents.freshnessScore,
          overallRank: agents.overallRank,
          githubData: agents.githubData,
          npmData: agents.npmData,
          languages: agents.languages,
          createdAt: agents.createdAt,
        })
        .from(agents)
        .where(and(...allConditions))
        .orderBy(desc(homepagePriority), orderBy, desc(agents.createdAt), desc(agents.id))
        .limit(limit);
    }

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
