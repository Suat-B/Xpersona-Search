import { NextResponse } from "next/server";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getAuthUser } from "@/lib/auth-utils";
import { isAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { llmTrafficEvents } from "@/lib/db/schema";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;
const DEFAULT_HOURS = 168;
const MAX_HOURS = 24 * 30;

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
  const sinceHours = Math.min(MAX_HOURS, Math.max(1, Number(url.searchParams.get("sinceHours") ?? DEFAULT_HOURS)));
  const eventType = url.searchParams.get("eventType")?.trim() || "";
  const normalizedEventType =
    eventType === "crawler_hit" || eventType === "llm_referral" || eventType === "llm_conversion"
      ? eventType
      : undefined;

  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
  const conditions = [gte(llmTrafficEvents.createdAt, since)];
  if (normalizedEventType) {
    conditions.push(eq(llmTrafficEvents.eventType, normalizedEventType));
  }
  const whereClause = and(...conditions);

  const items = await db
    .select({
      id: llmTrafficEvents.id,
      eventType: llmTrafficEvents.eventType,
      path: llmTrafficEvents.path,
      pageType: llmTrafficEvents.pageType,
      botName: llmTrafficEvents.botName,
      referrerHost: llmTrafficEvents.referrerHost,
      referrerSource: llmTrafficEvents.referrerSource,
      utmSource: llmTrafficEvents.utmSource,
      sessionId: llmTrafficEvents.sessionId,
      conversionType: llmTrafficEvents.conversionType,
      userAgent: llmTrafficEvents.userAgent,
      clientIp: llmTrafficEvents.clientIp,
      referer: llmTrafficEvents.referer,
      createdAt: llmTrafficEvents.createdAt,
    })
    .from(llmTrafficEvents)
    .where(whereClause)
    .orderBy(desc(llmTrafficEvents.createdAt))
    .limit(limit);

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(llmTrafficEvents)
    .where(whereClause);

  const [crawlerHitsRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(llmTrafficEvents)
    .where(and(whereClause, eq(llmTrafficEvents.eventType, "crawler_hit")));

  const [referralSessionsRow] = await db
    .select({ count: sql<number>`count(distinct ${llmTrafficEvents.sessionId})::int` })
    .from(llmTrafficEvents)
    .where(and(whereClause, eq(llmTrafficEvents.eventType, "llm_referral")));

  const [convertedSessionsRow] = await db
    .select({ count: sql<number>`count(distinct ${llmTrafficEvents.sessionId})::int` })
    .from(llmTrafficEvents)
    .where(and(whereClause, eq(llmTrafficEvents.eventType, "llm_conversion")));

  const [chatgptUtmRow] = await db
    .select({ count: sql<number>`count(distinct ${llmTrafficEvents.sessionId})::int` })
    .from(llmTrafficEvents)
    .where(
      and(
        whereClause,
        eq(llmTrafficEvents.eventType, "llm_referral"),
        eq(llmTrafficEvents.utmSource, "chatgpt.com")
      )
    );

  const botKey = sql<string>`coalesce(${llmTrafficEvents.botName}, 'unknown')`;
  const byBotName = await db
    .select({
      botName: botKey,
      count: sql<number>`count(*)::int`,
    })
    .from(llmTrafficEvents)
    .where(and(whereClause, eq(llmTrafficEvents.eventType, "crawler_hit")))
    .groupBy(botKey)
    .orderBy(desc(sql`count(*)`))
    .limit(20);

  const referrerHostKey = sql<string>`coalesce(${llmTrafficEvents.referrerHost}, 'unknown')`;
  const byReferrerHost = await db
    .select({
      referrerHost: referrerHostKey,
      sessions: sql<number>`count(distinct ${llmTrafficEvents.sessionId})::int`,
    })
    .from(llmTrafficEvents)
    .where(and(whereClause, eq(llmTrafficEvents.eventType, "llm_referral")))
    .groupBy(referrerHostKey)
    .orderBy(desc(sql`count(distinct ${llmTrafficEvents.sessionId})`))
    .limit(20);

  const referrerSourceKey = sql<string>`coalesce(${llmTrafficEvents.referrerSource}, 'unknown')`;
  const byReferrerSource = await db
    .select({
      referrerSource: referrerSourceKey,
      sessions: sql<number>`count(distinct ${llmTrafficEvents.sessionId})::int`,
    })
    .from(llmTrafficEvents)
    .where(and(whereClause, eq(llmTrafficEvents.eventType, "llm_referral")))
    .groupBy(referrerSourceKey)
    .orderBy(desc(sql`count(distinct ${llmTrafficEvents.sessionId})`))
    .limit(20);

  const pageTypeKey = sql<string>`coalesce(${llmTrafficEvents.pageType}, 'unknown')`;
  const byLandingPageType = await db
    .select({
      pageType: pageTypeKey,
      sessions: sql<number>`count(distinct ${llmTrafficEvents.sessionId})::int`,
    })
    .from(llmTrafficEvents)
    .where(and(whereClause, eq(llmTrafficEvents.eventType, "llm_referral")))
    .groupBy(pageTypeKey)
    .orderBy(desc(sql`count(distinct ${llmTrafficEvents.sessionId})`))
    .limit(20);

  const conversionTypeKey = sql<string>`coalesce(${llmTrafficEvents.conversionType}, 'unknown')`;
  const byConversionType = await db
    .select({
      conversionType: conversionTypeKey,
      count: sql<number>`count(*)::int`,
    })
    .from(llmTrafficEvents)
    .where(and(whereClause, eq(llmTrafficEvents.eventType, "llm_conversion")))
    .groupBy(conversionTypeKey)
    .orderBy(desc(sql`count(*)`))
    .limit(20);

  const keySurfaceHits = await db
    .select({
      pageType: pageTypeKey,
      count: sql<number>`count(*)::int`,
    })
    .from(llmTrafficEvents)
    .where(and(whereClause, eq(llmTrafficEvents.eventType, "crawler_hit")))
    .groupBy(pageTypeKey)
    .orderBy(desc(sql`count(*)`))
    .limit(20);

  const referralSessions = referralSessionsRow?.count ?? 0;
  const convertedSessions = convertedSessionsRow?.count ?? 0;

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
        crawlerHits: crawlerHitsRow?.count ?? 0,
        referralSessions,
        convertedSessions,
        conversionRate:
          referralSessions > 0 ? Number(((convertedSessions / referralSessions) * 100).toFixed(1)) : 0,
        chatgptReferralSessions: chatgptUtmRow?.count ?? 0,
        byBotName,
        byReferrerHost,
        byReferrerSource,
        byLandingPageType,
        byConversionType,
        keySurfaceHits,
      },
    },
  });
}
