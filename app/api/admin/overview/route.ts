import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { isAdminEmail } from "@/lib/admin";
import { db } from "@/lib/db";
import {
  users,
  gameBets,
  faucetGrants,
  stripeEvents,
  strategies,
  advancedStrategies,
} from "@/lib/db/schema";
import { sql, desc } from "drizzle-orm";

/**
 * GET /api/admin/overview — Platform-wide metrics (admin only).
 * Single-call dashboard: users, bets, volume, faucet, stripe, strategies.
 */
export async function GET(request: Request) {
  const authResult = await getAuthUser(request as any);
  if ("error" in authResult) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: 401 }
    );
  }

  const user = authResult.user;
  const email = "email" in user ? user.email : null;
  if (!isAdminEmail(email)) {
    return NextResponse.json(
      { success: false, error: "FORBIDDEN", message: "Admin access required" },
      { status: 403 }
    );
  }

  try {
    const [userCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users);

    const [betStats] = await db
      .select({
        totalBets: sql<number>`count(*)::int`,
        totalVolume: sql<number>`coalesce(sum(${gameBets.amount}), 0)::bigint`,
        totalPayout: sql<number>`coalesce(sum(${gameBets.payout}), 0)::bigint`,
        totalPnl: sql<number>`coalesce(sum(${gameBets.payout} - ${gameBets.amount}), 0)::bigint`,
      })
      .from(gameBets);

    const [faucetStats] = await db
      .select({
        totalGrants: sql<number>`count(*)::int`,
        totalCredits: sql<number>`coalesce(sum(${faucetGrants.amount}), 0)::int`,
      })
      .from(faucetGrants);

    const [stripeStats] = await db
      .select({
        totalEvents: sql<number>`count(*)::int`,
      })
      .from(stripeEvents);

    const [strategyCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(strategies);

    const [advancedCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(advancedStrategies);

    const [creditsInCirculation] = await db
      .select({
        total: sql<number>`coalesce(sum(${users.credits}), 0)::bigint`,
      })
      .from(users);

    const recentBets = await db
      .select({
        id: gameBets.id,
        userId: gameBets.userId,
        gameType: gameBets.gameType,
        amount: gameBets.amount,
        outcome: gameBets.outcome,
        payout: gameBets.payout,
        createdAt: gameBets.createdAt,
      })
      .from(gameBets)
      .orderBy(desc(gameBets.createdAt))
      .limit(20);

    const recentUsers = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        credits: users.credits,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(10);

    return NextResponse.json({
      success: true,
      data: {
        users: {
          total: userCount?.count ?? 0,
          recent: recentUsers,
        },
        bets: {
          totalCount: betStats?.totalBets ?? 0,
          totalVolume: Number(betStats?.totalVolume ?? 0),
          totalPayout: Number(betStats?.totalPayout ?? 0),
          totalPnl: Number(betStats?.totalPnl ?? 0),
          recent: recentBets,
        },
        faucet: {
          totalGrants: faucetStats?.totalGrants ?? 0,
          totalCredits: faucetStats?.totalCredits ?? 0,
        },
        stripe: {
          totalEvents: stripeStats?.totalEvents ?? 0,
        },
        strategies: {
          basic: strategyCount?.count ?? 0,
          advanced: advancedCount?.count ?? 0,
        },
        creditsInCirculation: Number(creditsInCirculation?.total ?? 0),
      },
    });
  } catch (err) {
    console.error("[admin/overview]", err);
    return NextResponse.json(
      { success: false, error: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
