import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { gameBets, serverSeeds } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

const VERIFICATION_FORMULA =
  "SHA256(serverSeed + clientSeed + ':' + nonce) → first 8 hex chars as integer → / 2^32 → * 100 = dice value in [0, 100).";

/**
 * GET /api/me/bets/[id] — Fetch a single bet (owner only) with verification data.
 * Query: reveal=1 to include serverSeed for local verification.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await getAuthUser(request as Request);
  if ("error" in authResult) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: 401 }
    );
  }

  const { id: betId } = await params;
  if (!betId) {
    return NextResponse.json(
      { success: false, error: "Bet ID required" },
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
    .where(and(eq(gameBets.id, betId), eq(gameBets.userId, authResult.user.id)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return NextResponse.json(
      { success: false, error: "Bet not found" },
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
