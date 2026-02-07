import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { gameBets, serverSeeds } from "@/lib/db/schema";
import { eq, desc, and } from "drizzle-orm";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * GET /api/me/bets — Recent bets and session PnL for the authenticated user.
 * When gameType=dice, each bet includes verification fields (serverSeedHash, clientSeed, nonce) and resultPayload for provably fair audit.
 * Query: limit (default 50, max 200), gameType (optional, e.g. "dice").
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
  const gameType = url.searchParams.get("gameType")?.trim() || null;
  const includeVerification = gameType === "dice";

  const whereClause =
    gameType != null
      ? and(eq(gameBets.userId, authResult.user.id), eq(gameBets.gameType, gameType))
      : eq(gameBets.userId, authResult.user.id);

  let rows: Array<{
    id: string;
    gameType: string;
    amount: number;
    outcome: string;
    payout: number;
    createdAt: Date | null;
    resultPayload?: unknown;
    clientSeed?: string | null;
    nonce?: number | null;
    serverSeedHash?: string | null;
  }>;

  if (includeVerification) {
    rows = await db
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
      .limit(limit);
  } else {
    rows = await db
      .select({
        id: gameBets.id,
        gameType: gameBets.gameType,
        amount: gameBets.amount,
        outcome: gameBets.outcome,
        payout: gameBets.payout,
        createdAt: gameBets.createdAt,
      })
      .from(gameBets)
      .where(whereClause)
      .orderBy(desc(gameBets.createdAt))
      .limit(limit);
  }

  let sessionPnl = 0;
  const bets = rows.map((r) => {
    const pnl = r.payout - r.amount;
    sessionPnl += pnl;
    const bet: Record<string, unknown> = {
      id: r.id,
      gameType: r.gameType,
      amount: r.amount,
      outcome: r.outcome,
      payout: r.payout,
      pnl,
      createdAt: r.createdAt,
    };
    if (includeVerification && "resultPayload" in r) {
      bet.resultPayload = r.resultPayload ?? null;
      bet.verification = {
        serverSeedHash: r.serverSeedHash ?? null,
        clientSeed: r.clientSeed ?? "",
        nonce: r.nonce ?? 0,
      };
    }
    return bet;
  });

  return NextResponse.json({
    success: true,
    data: {
      bets,
      sessionPnl,
      roundCount: bets.length,
    },
  });
}
