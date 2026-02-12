import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { gameBets, serverSeeds } from "@/lib/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 10000;

/**
 * GET /api/me/bets — All bets for the authenticated user (provably fair audit).
 * Every game is tracked in game_bets. Each bet includes verification when available (serverSeedHash, clientSeed, nonce).
 * Query: limit (default 50, max 10000), gameType (optional), offset (for pagination).
 */
export async function GET(request: Request) {
  const authResult = await getAuthUser(request as any);
  if ("error" in authResult) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: 401 }
    );
  }

  const url = new URL(request.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)
  );
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
  const gameType = url.searchParams.get("gameType")?.trim() || null;

  const whereClause =
    gameType != null
      ? and(eq(gameBets.userId, authResult.user.id), eq(gameBets.gameType, gameType))
      : eq(gameBets.userId, authResult.user.id);

  const [aggRow] = await db
    .select({
      totalPnl: sql<number>`coalesce(sum(${gameBets.payout} - ${gameBets.amount}), 0)::int`,
      totalCount: sql<number>`count(*)::int`,
    })
    .from(gameBets)
    .where(whereClause);
  const totalSessionPnl = typeof aggRow?.totalPnl === "number" ? aggRow.totalPnl : Number(aggRow?.totalPnl) || 0;
  const totalCount = typeof aggRow?.totalCount === "number" ? aggRow.totalCount : Number(aggRow?.totalCount) || 0;

  const rows = await db
    .select({
      id: gameBets.id,
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
    .leftJoin(serverSeeds, eq(gameBets.serverSeedId, serverSeeds.id))
    .where(whereClause)
    .orderBy(desc(gameBets.createdAt))
    .limit(limit)
    .offset(offset);

  const bets = rows.map((r) => {
    const amount = Number(r.amount);
    const payout = Number(r.payout);
    const pnl = payout - amount;
    const bet: Record<string, unknown> = {
      id: r.id,
      gameType: r.gameType,
      amount: r.amount,
      outcome: r.outcome,
      payout: r.payout,
      pnl,
      createdAt: r.createdAt,
      resultPayload: r.resultPayload ?? null,
      verification: {
        serverSeedHash: r.serverSeedHash ?? null,
        clientSeed: r.clientSeed ?? "",
        nonce: r.nonce ?? 0,
      },
    };
    return bet;
  });

  return NextResponse.json({
    success: true,
    data: {
      bets,
      sessionPnl: totalSessionPnl,
      roundCount: bets.length,
      totalCount,
      offset,
      limit,
    },
  });
}
