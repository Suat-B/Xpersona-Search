import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { isAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { dashboardAccessEvents } from "@/lib/db/schema";
import { and, desc, eq, gte, like, sql } from "drizzle-orm";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const DEFAULT_HOURS = 24;
const MAX_HOURS = 168;

function normalizePathPrefix(raw: string | null): string {
  const d = (raw ?? "/dashboard").trim() || "/dashboard";
  const n = d.endsWith("/") && d.length > 1 ? d.slice(0, -1) : d;
  if (n === "/dashboard" || n.startsWith("/dashboard/")) return n;
  return "/dashboard";
}

export async function GET(request: Request) {
  const authResult = await getAuthUser(request as any);
  if ("error" in authResult) {
    return NextResponse.json({ success: false, error: authResult.error }, { status: 401 });
  }
  if (!isAdmin(authResult.user)) {
    return NextResponse.json({ success: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const url = new URL(request.url);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT)));
  const sinceHours = Math.min(
    MAX_HOURS,
    Math.max(1, Number(url.searchParams.get("sinceHours") ?? DEFAULT_HOURS))
  );
  const pathPrefix = normalizePathPrefix(url.searchParams.get("pathPrefix"));
  const outcomeRaw = url.searchParams.get("outcome")?.trim();
  const outcome =
    outcomeRaw === "redirect_signin" || outcomeRaw === "rendered" ? outcomeRaw : undefined;

  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
  const pathPattern = `${pathPrefix}%`;

  const baseConditions = [
    gte(dashboardAccessEvents.createdAt, since),
    like(dashboardAccessEvents.path, pathPattern),
  ];
  if (outcome) {
    baseConditions.push(eq(dashboardAccessEvents.outcome, outcome));
  }
  const whereClause = and(...baseConditions);

  const items = await db
    .select({
      id: dashboardAccessEvents.id,
      path: dashboardAccessEvents.path,
      outcome: dashboardAccessEvents.outcome,
      userAgent: dashboardAccessEvents.userAgent,
      clientIp: dashboardAccessEvents.clientIp,
      referer: dashboardAccessEvents.referer,
      botLabel: dashboardAccessEvents.botLabel,
      createdAt: dashboardAccessEvents.createdAt,
    })
    .from(dashboardAccessEvents)
    .where(whereClause)
    .orderBy(desc(dashboardAccessEvents.createdAt))
    .limit(limit);

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(dashboardAccessEvents)
    .where(whereClause);

  const byPath = await db
    .select({
      path: dashboardAccessEvents.path,
      count: sql<number>`count(*)::int`,
    })
    .from(dashboardAccessEvents)
    .where(whereClause)
    .groupBy(dashboardAccessEvents.path)
    .orderBy(desc(sql`count(*)`))
    .limit(20);

  const botKey = sql<string>`coalesce(${dashboardAccessEvents.botLabel}, 'unknown')`;
  const byBotLabel = await db
    .select({
      botLabel: botKey,
      count: sql<number>`count(*)::int`,
    })
    .from(dashboardAccessEvents)
    .where(whereClause)
    .groupBy(botKey)
    .orderBy(desc(sql`count(*)`))
    .limit(20);

  const byOutcome = await db
    .select({
      outcome: dashboardAccessEvents.outcome,
      count: sql<number>`count(*)::int`,
    })
    .from(dashboardAccessEvents)
    .where(whereClause)
    .groupBy(dashboardAccessEvents.outcome)
    .orderBy(desc(sql`count(*)`));

  return NextResponse.json({
    success: true,
    data: {
      items: items.map((row) => ({
        ...row,
        createdAt: row.createdAt?.toISOString() ?? null,
      })),
      summary: {
        totalInWindow: totalRow?.count ?? 0,
        sinceHours,
        pathPrefix,
        byPath,
        byBotLabel,
        byOutcome,
      },
    },
  });
}
