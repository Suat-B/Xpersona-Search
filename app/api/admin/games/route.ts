import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { isAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { gameBets, users, serverSeeds } from "@/lib/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

/**
 * GET /api/admin/games — All bets across all users (admin only).
 * Query: limit, offset, gameType, userId.
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
  const gameType = url.searchParams.get("gameType")?.trim() || null;
  const userId = url.searchParams.get("userId")?.trim() || null;

  const conditions: ReturnType<typeof eq>[] = [];
  if (gameType) conditions.push(eq(gameBets.gameType, gameType));
  if (userId) conditions.push(eq(gameBets.userId, userId));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [aggRow] = await db
    .select({
      totalCount: sql<number>`count(*)::int`,
      totalVolume: sql<number>`coalesce(sum(${gameBets.amount}), 0)::bigint`,
      totalPnl: sql<number>`coalesce(sum(${gameBets.payout} - ${gameBets.amount}), 0)::bigint`,
    })
    .from(gameBets)
    .where(whereClause);

  const rows = await db
    .select({
      id: gameBets.id,
      userId: gameBets.userId,
      userEmail: users.email,
      userName: users.name,
      gameType: gameBets.gameType,
      amount: gameBets.amount,
      outcome: gameBets.outcome,
      payout: gameBets.payout,
      createdAt: gameBets.createdAt,
      resultPayload: gameBets.resultPayload,
      clientSeed: gameBets.clientSeed,
      nonce: gameBets.nonce,
      serverSeedHash: serverSeeds.seedHash,
    })
    .from(gameBets)
    .leftJoin(users, eq(gameBets.userId, users.id))
    .leftJoin(serverSeeds, eq(gameBets.serverSeedId, serverSeeds.id))
    .where(whereClause)
    .orderBy(desc(gameBets.createdAt))
    .limit(limit)
    .offset(offset);

  const bets = rows.map((r) => {
    const amount = Number(r.amount);
    const payout = Number(r.payout);
    const pnl = payout - amount;
    return {
      id: r.id,
      userId: r.userId,
      userEmail: r.userEmail ?? null,
      userName: r.userName ?? null,
      gameType: r.gameType,
      amount,
      outcome: r.outcome,
      payout,
      pnl,
      createdAt: r.createdAt,
      resultPayload: r.resultPayload ?? null,
      verification: {
        serverSeedHash: r.serverSeedHash ?? null,
        clientSeed: r.clientSeed ?? "",
        nonce: r.nonce ?? 0,
      },
    };
  });

  return NextResponse.json({
    success: true,
    data: {
      bets,
      totalCount: aggRow?.totalCount ?? 0,
      totalVolume: Number(aggRow?.totalVolume ?? 0),
      totalPnl: Number(aggRow?.totalPnl ?? 0),
      offset,
      limit,
    },
  });
}
