import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { isAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { withdrawalRequests, users } from "@/lib/db/schema";
import { desc, eq, sql } from "drizzle-orm";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * GET /api/admin/withdrawals — List withdrawal requests (admin only).
 * Query: limit, offset, status (optional filter: pending, processing, completed, failed).
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
  const statusFilter = url.searchParams.get("status");

  const selectQuery = statusFilter
    ? db
        .select({
          id: withdrawalRequests.id,
          userId: withdrawalRequests.userId,
          amount: withdrawalRequests.amount,
          wiseEmail: withdrawalRequests.wiseEmail,
          fullName: withdrawalRequests.fullName,
          currency: withdrawalRequests.currency,
          status: withdrawalRequests.status,
          createdAt: withdrawalRequests.createdAt,
          userEmail: users.email,
          userName: users.name,
        })
        .from(withdrawalRequests)
        .innerJoin(users, eq(withdrawalRequests.userId, users.id))
        .where(eq(withdrawalRequests.status, statusFilter))
        .orderBy(desc(withdrawalRequests.createdAt))
        .limit(limit)
        .offset(offset)
    : db
        .select({
          id: withdrawalRequests.id,
          userId: withdrawalRequests.userId,
          amount: withdrawalRequests.amount,
          wiseEmail: withdrawalRequests.wiseEmail,
          fullName: withdrawalRequests.fullName,
          currency: withdrawalRequests.currency,
          status: withdrawalRequests.status,
          createdAt: withdrawalRequests.createdAt,
          userEmail: users.email,
          userName: users.name,
        })
        .from(withdrawalRequests)
        .innerJoin(users, eq(withdrawalRequests.userId, users.id))
        .orderBy(desc(withdrawalRequests.createdAt))
        .limit(limit)
        .offset(offset);

  const countQuery = statusFilter
    ? db
        .select({ count: sql<number>`count(*)::int` })
        .from(withdrawalRequests)
        .where(eq(withdrawalRequests.status, statusFilter))
    : db.select({ count: sql<number>`count(*)::int` }).from(withdrawalRequests);

  const [totalRow] = await countQuery;
  const rows = await selectQuery;

  return NextResponse.json({
    success: true,
    data: {
      withdrawals: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        userEmail: r.userEmail,
        userName: r.userName,
        amount: r.amount,
        wiseEmail: r.wiseEmail,
        fullName: r.fullName,
        currency: r.currency,
        status: r.status,
        createdAt: r.createdAt,
      })),
      totalCount: totalRow?.count ?? 0,
      limit,
      offset,
    },
  });
}
