import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  verifyRecoveryToken,
  createGuestToken,
  createAgentToken,
  getGuestCookieName,
  getAgentCookieName,
} from "@/lib/auth-utils";

function getBaseUrl(request: NextRequest): string {
  try {
    return new URL(request.url).origin;
  } catch {
    return process.env.NEXTAUTH_URL ?? "https://xpersona.co";
  }
}

/**
 * GET /api/auth/recover?token=xxx
 * Redeem a recovery token. Sets session cookie and redirects to dashboard.
 * Use the link from POST /api/me/recovery-link.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const baseUrl = getBaseUrl(request);

  if (!token) {
    return NextResponse.redirect(
      new URL(`/?error=recovery_missing&message=${encodeURIComponent("Recovery token missing")}`, baseUrl),
      302
    );
  }

  const userId = verifyRecoveryToken(token);
  if (!userId) {
    return NextResponse.redirect(
      new URL(`/?error=recovery_expired&message=${encodeURIComponent("Recovery link expired or invalid. Generate a new one from the dashboard.")}`, baseUrl),
      302
    );
  }

  const [user] = await db
    .select({ id: users.id, accountType: users.accountType })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return NextResponse.redirect(
      new URL(`/?error=recovery_invalid&message=${encodeURIComponent("Account not found")}`, baseUrl),
      302
    );
  }

  const isAgent = user.accountType === "agent";
  const sessionToken = isAgent ? createAgentToken(userId) : createGuestToken(userId);
  const cookieName = isAgent ? getAgentCookieName() : getGuestCookieName();

  const res = NextResponse.redirect(`${baseUrl}/dashboard`, 302);
  res.cookies.set(cookieName, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });

  return res;
}
