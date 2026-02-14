import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { isAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { users, gameBets } from "@/lib/db/schema";
import { eq, desc, sql, inArray } from "drizzle-orm";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * GET /api/admin/users — All users with activity stats (admin only).
 * Query: limit, offset.
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

  const [totalCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users);

  const userRows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      credits: users.credits,
      faucetCredits: users.faucetCredits,
      apiKeyPrefix: users.apiKeyPrefix,
      createdAt: users.createdAt,
      lastFaucetAt: users.lastFaucetAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset);

  const userIds = userRows.map((u) => u.id);
  const betAggByUser =
    userIds.length > 0
      ? await db
          .select({
            userId: gameBets.userId,
            betCount: sql<number>`count(*)::int`,
            totalVolume: sql<number>`coalesce(sum(${gameBets.amount}), 0)::bigint`,
            totalPnl: sql<number>`coalesce(sum(${gameBets.payout} - ${gameBets.amount}), 0)::bigint`,
          })
          .from(gameBets)
          .where(inArray(gameBets.userId, userIds))
          .groupBy(gameBets.userId)
      : [];

  const betMap = new Map(
    betAggByUser.map((r) => [
      r.userId,
      {
        betCount: r.betCount,
        totalVolume: Number(r.totalVolume),
        totalPnl: Number(r.totalPnl),
      },
    ])
  );

  const list = userRows.map((u) => {
    const stats = betMap.get(u.id);
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      credits: u.credits,
      faucetCredits: u.faucetCredits,
      apiKeyPrefix: u.apiKeyPrefix,
      createdAt: u.createdAt,
      lastFaucetAt: u.lastFaucetAt,
      betCount: stats?.betCount ?? 0,
      totalVolume: stats?.totalVolume ?? 0,
      totalPnl: stats?.totalPnl ?? 0,
    };
  });

  return NextResponse.json({
    success: true,
    data: {
      users: list,
      totalCount: totalCountRow?.count ?? 0,
      offset,
      limit,
    },
  });
}
