import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { isAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { deposits, users } from "@/lib/db/schema";
import { eq, desc, and, sql, gte, lte } from "drizzle-orm";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

/**
 * GET /api/admin/audit/deposits — All deposits (admin only).
 * Query: limit, offset, userId, from, to (ISO date strings).
 */
export async function GET(request: Request) {
  const authResult = await getAuthUser(request as any);
  if ("error" in authResult) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: 401 }
    );
  }
  if (!isAdmin(authResult.user)) {
    return NextResponse.json(
      { success: false, error: "FORBIDDEN", message: "Admin access required" },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)
  );
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
  const userId = url.searchParams.get("userId") ?? undefined;
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;

  const conditions = [];
  if (userId) conditions.push(eq(deposits.userId, userId));
  if (from) {
    const fromDate = new Date(from);
    if (!Number.isNaN(fromDate.getTime())) conditions.push(gte(deposits.createdAt, fromDate));
  }
  if (to) {
    const toDate = new Date(to);
    if (!Number.isNaN(toDate.getTime())) conditions.push(lte(deposits.createdAt, toDate));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(deposits)
    .where(where ?? sql`true`);

  const rows = await db
    .select({
      id: deposits.id,
      userId: deposits.userId,
      credits: deposits.credits,
      stripeEventId: deposits.stripeEventId,
      stripeSessionId: deposits.stripeSessionId,
      createdAt: deposits.createdAt,
      email: users.email,
    })
    .from(deposits)
    .leftJoin(users, eq(deposits.userId, users.id))
    .where(where ?? sql`true`)
    .orderBy(desc(deposits.createdAt))
    .limit(limit)
    .offset(offset);

  const list = rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    email: r.email ?? null,
    credits: Number(r.credits),
    stripeEventId: r.stripeEventId ?? null,
    stripeSessionId: r.stripeSessionId ?? null,
    createdAt: r.createdAt,
  }));

  return NextResponse.json({
    success: true,
    data: {
      deposits: list,
      totalCount: totalRow?.count ?? 0,
      limit,
      offset,
    },
  });
}
