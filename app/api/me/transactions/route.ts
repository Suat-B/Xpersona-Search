import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { gameBets, faucetGrants } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

type TransactionItem =
  | {
      id: string;
      type: "bet";
      gameType: string;
      amount: number;
      outcome: string;
      payout: number;
      pnl: number;
      createdAt: Date | null;
    }
  | {
      id: string;
      type: "faucet";
      amount: number;
      createdAt: Date | null;
    };

/**
 * GET /api/me/transactions — Unified activity feed (bets + faucet grants).
 * Query: limit (default 50, max 200), offset, type (all|bet|faucet).
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
  const typeFilter = url.searchParams.get("type")?.toLowerCase() || "all";

  const userId = authResult.user.id;

  const betLimit = typeFilter === "all" ? limit + offset : limit;
  const betOffset = typeFilter === "all" ? 0 : offset;
  const faucetLimit = typeFilter === "all" ? limit + offset : limit;
  const faucetOffset = typeFilter === "all" ? 0 : offset;

  const betItems: TransactionItem[] = [];
  const faucetItems: TransactionItem[] = [];

  if (typeFilter === "all" || typeFilter === "bet") {
    const betRows = await db
      .select({
        id: gameBets.id,
        gameType: gameBets.gameType,
        amount: gameBets.amount,
        outcome: gameBets.outcome,
        payout: gameBets.payout,
        createdAt: gameBets.createdAt,
      })
      .from(gameBets)
      .where(eq(gameBets.userId, userId))
      .orderBy(desc(gameBets.createdAt))
      .limit(betLimit)
      .offset(betOffset);

    for (const r of betRows) {
      const amount = Number(r.amount);
      const payout = Number(r.payout);
      betItems.push({
        id: r.id,
        type: "bet",
        gameType: r.gameType,
        amount,
        outcome: r.outcome,
        payout,
        pnl: payout - amount,
        createdAt: r.createdAt,
      });
    }
  }

  if (typeFilter === "all" || typeFilter === "faucet") {
    const faucetRows = await db
      .select({
        id: faucetGrants.id,
        amount: faucetGrants.amount,
        createdAt: faucetGrants.createdAt,
      })
      .from(faucetGrants)
      .where(eq(faucetGrants.userId, userId))
      .orderBy(desc(faucetGrants.createdAt))
      .limit(faucetLimit)
      .offset(faucetOffset);

    for (const r of faucetRows) {
      faucetItems.push({
        id: r.id,
        type: "faucet",
        amount: Number(r.amount),
        createdAt: r.createdAt,
      });
    }
  }

  let transactions: TransactionItem[] = [];
  if (typeFilter === "all") {
    const merged = [...betItems, ...faucetItems].sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
    transactions = merged.slice(offset, offset + limit);
  } else {
    transactions = typeFilter === "bet" ? betItems : faucetItems;
  }

  const [sessionPnlRow] = await db
    .select({
      totalPnl: sql<number>`coalesce(sum(${gameBets.payout} - ${gameBets.amount}), 0)::int`,
    })
    .from(gameBets)
    .where(eq(gameBets.userId, userId));

  const totalPnl = typeof sessionPnlRow?.totalPnl === "number"
    ? sessionPnlRow.totalPnl
    : Number(sessionPnlRow?.totalPnl) || 0;

  return NextResponse.json({
    success: true,
    data: {
      transactions,
      sessionPnl: totalPnl,
      limit,
      offset,
    },
  });
}
