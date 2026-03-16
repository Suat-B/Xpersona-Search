import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { getAuthUser, unauthorizedJsonBody } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { gameBets } from "@/lib/db/schema";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

function parseLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, parsed));
}

export async function GET(request: NextRequest) {
  const authResult = await getAuthUser(request);
  if ("error" in authResult) {
    return NextResponse.json(
      { ...unauthorizedJsonBody(), error: authResult.error },
      { status: 401 }
    );
  }

  const { user } = authResult;
  const gameType = request.nextUrl.searchParams.get("gameType")?.trim() || "dice";
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));

  const whereClause = and(
    eq(gameBets.userId, user.id),
    eq(gameBets.gameType, gameType)
  );

  const [aggRow] = await db
    .select({
      rounds: sql<number>`count(*)::int`,
      sessionPnl: sql<number>`coalesce(sum(${gameBets.payout} - ${gameBets.amount}), 0)::int`,
      wins: sql<number>`coalesce(sum(case when ${gameBets.outcome} = 'win' then 1 else 0 end), 0)::int`,
    })
    .from(gameBets)
    .where(whereClause);

  const rounds = Number(aggRow?.rounds ?? 0) || 0;
  const sessionPnl = Number(aggRow?.sessionPnl ?? 0) || 0;
  const wins = Number(aggRow?.wins ?? 0) || 0;
  const winRate = rounds > 0 ? Number(((wins / rounds) * 100).toFixed(2)) : 0;

  const recentPlaysRows = await db
    .select({
      id: gameBets.id,
      amount: gameBets.amount,
      outcome: gameBets.outcome,
      payout: gameBets.payout,
      createdAt: gameBets.createdAt,
    })
    .from(gameBets)
    .where(whereClause)
    .orderBy(desc(gameBets.createdAt))
    .limit(limit);

  const recentPlays = recentPlaysRows.map((row) => {
    const amount = Number(row.amount ?? 0);
    const payout = Number(row.payout ?? 0);
    return {
      id: row.id,
      amount,
      outcome: String(row.outcome ?? ""),
      payout,
      pnl: payout - amount,
      createdAt: row.createdAt,
    };
  });

  return NextResponse.json({
    success: true,
    data: {
      balance: user.credits,
      rounds,
      sessionPnl,
      winRate,
      recentPlays,
    },
  });
}
