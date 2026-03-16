import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { gameBets } from "@/lib/db/schema";

export async function GET() {
  try {
    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(gameBets)
      .where(eq(gameBets.gameType, "dice"));

    const [roundsLast24hRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(gameBets)
      .where(
        and(
          eq(gameBets.gameType, "dice"),
          sql`${gameBets.createdAt} >= now() - interval '24 hours'`
        )
      );

    const [activePlayersLast24hRow] = await db
      .select({ count: sql<number>`count(distinct ${gameBets.userId})::int` })
      .from(gameBets)
      .where(
        and(
          eq(gameBets.gameType, "dice"),
          sql`${gameBets.createdAt} >= now() - interval '24 hours'`
        )
      );

    return NextResponse.json({
      totalRounds: Number(totalRow?.count ?? 0) || 0,
      roundsLast24h: Number(roundsLast24hRow?.count ?? 0) || 0,
      activePlayersLast24h: Number(activePlayersLast24hRow?.count ?? 0) || 0,
    });
  } catch (err) {
    console.error("[stats/casino-activity] GET failed:", err);
    return NextResponse.json(
      {
        totalRounds: 0,
        roundsLast24h: 0,
        activePlayersLast24h: 0,
      },
      { status: 200 }
    );
  }
}
