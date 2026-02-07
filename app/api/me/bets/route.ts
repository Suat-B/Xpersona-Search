import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { gameBets } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * GET /api/me/bets — Recent bets and session PnL for the authenticated user.
 * AI-first: use this to report session PnL without client-side state.
 * Query: limit (default 50, max 200).
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

  const rows = await db
    .select({
      id: gameBets.id,
      gameType: gameBets.gameType,
      amount: gameBets.amount,
      outcome: gameBets.outcome,
      payout: gameBets.payout,
      createdAt: gameBets.createdAt,
    })
    .from(gameBets)
    .where(eq(gameBets.userId, authResult.user.id))
    .orderBy(desc(gameBets.createdAt))
    .limit(limit);

  let sessionPnl = 0;
  const bets = rows.map((r) => {
    const pnl = r.payout - r.amount;
    sessionPnl += pnl;
    return {
      id: r.id,
      gameType: r.gameType,
      amount: r.amount,
      outcome: r.outcome,
      payout: r.payout,
      pnl,
      createdAt: r.createdAt,
    };
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
