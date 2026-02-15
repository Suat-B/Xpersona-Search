/**
 * Shared handlers for GET /api/me/rounds (and legacy /api/me/bets).
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { gameBets, serverSeeds } from "@/lib/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 10000;
const VERIFICATION_FORMULA =
  "SHA256(serverSeed + clientSeed + ':' + nonce) → first 8 hex chars as integer → / 2^32 → * 100 = dice value in [0, 100).";

export async function getRoundsHandler(request: Request): Promise<NextResponse> {
  const authResult = await getAuthUser(request as NextRequest);
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

  const plays = rows.map((r) => {
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
      plays,
      sessionPnl: totalSessionPnl,
      roundCount: plays.length,
      totalCount,
      offset,
      limit,
    },
  });
}

export async function getRoundByIdHandler(
  request: Request,
  id: string
): Promise<NextResponse> {
  const authResult = await getAuthUser(request as NextRequest);
  if ("error" in authResult) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: 401 }
    );
  }

  if (!id) {
    return NextResponse.json(
      { success: false, error: "Round ID required" },
      { status: 400 }
    );
  }

  const url = new URL(request.url);
  const reveal = url.searchParams.get("reveal") === "1";

  const rows = await db
    .select({
      id: gameBets.id,
      gameType: gameBets.gameType,
      amount: gameBets.amount,
      outcome: gameBets.outcome,
      payout: gameBets.payout,
      resultPayload: gameBets.resultPayload,
      clientSeed: gameBets.clientSeed,
      nonce: gameBets.nonce,
      createdAt: gameBets.createdAt,
      serverSeedHash: serverSeeds.seedHash,
      serverSeed: serverSeeds.seed,
    })
    .from(gameBets)
    .leftJoin(serverSeeds, eq(gameBets.serverSeedId, serverSeeds.id))
    .where(and(eq(gameBets.id, id), eq(gameBets.userId, authResult.user.id)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return NextResponse.json(
      { success: false, error: "Round not found" },
      { status: 404 }
    );
  }

  const payload = (row.resultPayload ?? {}) as Record<string, unknown>;
  const verification: Record<string, unknown> = {
    serverSeedHash: row.serverSeedHash ?? null,
    clientSeed: row.clientSeed ?? "",
    nonce: row.nonce ?? 0,
    verificationFormula: VERIFICATION_FORMULA,
  };
  if (reveal && row.serverSeed != null) {
    verification.serverSeed = row.serverSeed;
  }

  return NextResponse.json({
    success: true,
    data: {
      id: row.id,
      gameType: row.gameType,
      amount: row.amount,
      outcome: row.outcome,
      payout: row.payout,
      resultPayload: payload,
      createdAt: row.createdAt,
      verification,
    },
  });
}
