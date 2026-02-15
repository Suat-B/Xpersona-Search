import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { isAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { users, faucetGrants, deposits } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { getWithdrawableBalance, hasEverClaimedFaucet, hasEverDeposited } from "@/lib/withdrawable";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * GET /api/admin/audit/withdrawal-eligibility — Users with faucet/deposit/withdrawable status (admin only).
 * Query: limit, offset, userId (filter single user).
 */
export async function GET(request: Request) {
  const authResult = await getAuthUser(request as any);
  if ("error" in authResult) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: 401 }
    );
  }
  if (!isAdmin(authResult.user)) {
    return NextResponse.json(
      { success: false, error: "FORBIDDEN", message: "Admin access required" },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)
  );
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
  const filterUserId = url.searchParams.get("userId") ?? undefined;

  const conditions = filterUserId ? [eq(users.id, filterUserId)] : [];
  const where = conditions.length > 0 ? conditions[0] : undefined;

  const userRows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      credits: users.credits,
      faucetCredits: users.faucetCredits,
    })
    .from(users)
    .where(where ?? sql`true`)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset);

  const results = await Promise.all(
    userRows.map(async (u) => {
      const claimedFaucet = await hasEverClaimedFaucet(u.id);
      const deposited = await hasEverDeposited(u.id);
      const faucetCredits = u.faucetCredits ?? 0;
      const withdrawable =
        claimedFaucet && !deposited
          ? 0
          : getWithdrawableBalance(u.credits, faucetCredits);

      return {
        id: u.id,
        email: u.email,
        name: u.name ?? null,
        credits: u.credits,
        faucetCredits,
        hasEverClaimedFaucet: claimedFaucet,
        hasEverDeposited: deposited,
        withdrawable,
        blockedByFaucetGate: claimedFaucet && !deposited,
      };
    })
  );

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(where ?? sql`true`);

  return NextResponse.json({
    success: true,
    data: {
      users: results,
      totalCount: totalRow?.count ?? 0,
      limit,
      offset,
    },
  });
}
