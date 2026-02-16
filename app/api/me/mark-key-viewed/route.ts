/**
 * POST /api/me/mark-key-viewed
 * Sets apiKeyViewedAt when the user views their API key (Connect AI or API page).
 * Idempotent: only sets if apiKeyViewedAt is null and user has an API key.
 * Used to avoid showing "AI connected" before the user has seen/copied their key.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";

export async function POST(request: NextRequest) {
  const authResult = await getAuthUser(request);
  if ("error" in authResult) {
    return NextResponse.json({ success: false, error: authResult.error }, { status: 401 });
  }
  const { user } = authResult;
  if (!user.apiKeyPrefix || user.apiKeyPrefix.length < 11) {
    return NextResponse.json({ success: true, data: { alreadyViewed: false } });
  }

  const [updated] = await db
    .update(users)
    .set({ apiKeyViewedAt: new Date() })
    .where(and(eq(users.id, user.id), isNull(users.apiKeyViewedAt)))
    .returning({ apiKeyViewedAt: users.apiKeyViewedAt });

  return NextResponse.json({
    success: true,
    data: { alreadyViewed: !updated },
  });
}
