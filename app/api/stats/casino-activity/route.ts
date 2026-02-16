import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gameBets } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

/**
 * GET /api/stats/casino-activity
 * Public endpoint returning platform-wide casino activity stats.
 * Total rounds, rounds in last 24h, active players in last 24h.
 */
export async function GET() {
  try {
    const [totalResult] = await db
      .select({
        totalRounds: sql<number>`cast(count(*) as integer)`,
      })
      .from(gameBets);

    const [recentResult] = await db
      .select({
        roundsLast24h: sql<number>`cast(count(*) as integer)`,
        activePlayersLast24h: sql<number>`cast(count(distinct ${gameBets.userId}) as integer)`,
      })
      .from(gameBets)
      .where(sql`${gameBets.createdAt} >= now() - interval '24 hours'`);

    const totalRounds =
      typeof totalResult?.totalRounds === "number"
        ? totalResult.totalRounds
        : Number(totalResult?.totalRounds) || 0;
    const roundsLast24h =
      typeof recentResult?.roundsLast24h === "number"
        ? recentResult.roundsLast24h
        : Number(recentResult?.roundsLast24h) || 0;
    const activePlayersLast24h =
      typeof recentResult?.activePlayersLast24h === "number"
        ? recentResult.activePlayersLast24h
        : Number(recentResult?.activePlayersLast24h) || 0;

    return NextResponse.json(
      {
        totalRounds,
        roundsLast24h,
        activePlayersLast24h,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      }
    );
  } catch (error) {
    console.error("[casino-activity] Error:", error);
    return NextResponse.json(
      {
        totalRounds: 0,
        roundsLast24h: 0,
        activePlayersLast24h: 0,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      }
    );
  }
}
