import { NextResponse } from "next/server";
import { and, eq, sql, or, isNull } from "drizzle-orm";
import { getAuthUser } from "@/lib/auth-utils";
import { isAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { agents, agentEditorialContent } from "@/lib/db/schema";

export async function GET(request: Request) {
  const authResult = await getAuthUser(request as any);
  if ("error" in authResult) {
    return NextResponse.json({ success: false, error: authResult.error }, { status: 401 });
  }
  if (!isAdmin(authResult.user)) {
    return NextResponse.json({ success: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const [totalActive] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agents)
    .where(and(eq(agents.status, "ACTIVE"), eq(agents.publicSearchable, true)));

  const [readyCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agents)
    .leftJoin(
      agentEditorialContent,
      eq(agentEditorialContent.agentId, agents.id)
    )
    .where(
      and(
        eq(agents.status, "ACTIVE"),
        eq(agents.publicSearchable, true),
        eq(agentEditorialContent.status, "READY")
      )
    );

  const [thinCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agents)
    .leftJoin(
      agentEditorialContent,
      eq(agentEditorialContent.agentId, agents.id)
    )
    .where(
      and(
        eq(agents.status, "ACTIVE"),
        eq(agents.publicSearchable, true),
        or(
          isNull(agentEditorialContent.id),
          sql`${agentEditorialContent.status} != 'READY'`
        )
      )
    );

  const topNeedingContent = await db
    .select({
      id: agents.id,
      name: agents.name,
      slug: agents.slug,
      source: agents.source,
      overallRank: agents.overallRank,
      status: agentEditorialContent.status,
      qualityScore: agentEditorialContent.qualityScore,
      updatedAt: agentEditorialContent.updatedAt,
    })
    .from(agents)
    .leftJoin(agentEditorialContent, eq(agentEditorialContent.agentId, agents.id))
    .where(
      and(
        eq(agents.status, "ACTIVE"),
        eq(agents.publicSearchable, true),
        or(
          isNull(agentEditorialContent.id),
          sql`${agentEditorialContent.status} != 'READY'`
        )
      )
    )
    .orderBy(sql`agents.overall_rank DESC`)
    .limit(30);

  return NextResponse.json({
    success: true,
    data: {
      totalActive: totalActive?.count ?? 0,
      readyCount: readyCountRow?.count ?? 0,
      thinCount: thinCountRow?.count ?? 0,
      items: topNeedingContent.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        source: row.source,
        overallRank: row.overallRank,
        status: row.status ?? "MISSING",
        qualityScore: row.qualityScore ?? null,
        updatedAt: row.updatedAt?.toISOString?.() ?? null,
      })),
    },
  });
}

