import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { mergeGuestIntoUser } from "@/lib/merge-guest-account";
import { verifyGuestToken, getGuestCookieName } from "@/lib/auth-utils";

/**
 * POST /api/auth/link-guest
 * Merge guest account data into the current authenticated user (e.g. after Google sign-in).
 * Requires: NextAuth session (Google user) + guest cookie.
 * Clears guest cookie on success.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: "UNAUTHORIZED", message: "Sign in first" },
      { status: 401 }
    );
  }

  const cookieStore = await cookies();
  const guestCookie = cookieStore.get(getGuestCookieName())?.value;
  if (!guestCookie) {
    return NextResponse.json(
      {
        success: false,
        error: "NO_GUEST",
        message: "No guest session to merge",
      },
      { status: 400 }
    );
  }

  const guestUserId = verifyGuestToken(guestCookie);
  if (!guestUserId) {
    return NextResponse.json(
      {
        success: false,
        error: "INVALID_GUEST",
        message: "Invalid or expired guest session",
      },
      { status: 400 }
    );
  }

  const result = await mergeGuestIntoUser(guestUserId, session.user.id);
  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: "MERGE_FAILED", message: result.error },
      { status: 500 }
    );
  }

  const res = NextResponse.json({
    success: true,
    data: { message: "Guest account merged successfully" },
  });

  res.cookies.set(getGuestCookieName(), "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });

  return res;
}
