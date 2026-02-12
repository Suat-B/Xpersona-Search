import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { faucetGrants } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

/**
 * GET /api/me/faucet-grants — Faucet claims for the authenticated user.
 * Query: limit (default 200, max 500), offset (for pagination).
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

  const rows = await db
    .select({
      id: faucetGrants.id,
      amount: faucetGrants.amount,
      createdAt: faucetGrants.createdAt,
    })
    .from(faucetGrants)
    .where(eq(faucetGrants.userId, authResult.user.id))
    .orderBy(desc(faucetGrants.createdAt))
    .limit(limit)
    .offset(offset);

  const grants = rows.map((r) => ({
    id: r.id,
    amount: Number(r.amount),
    createdAt: r.createdAt,
  }));

  return NextResponse.json({
    success: true,
    data: {
      grants,
      limit,
      offset,
    },
  });
}
