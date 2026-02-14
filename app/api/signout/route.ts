import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getGuestCookieName, getAgentCookieName } from "@/lib/auth-utils";

/**
 * GET /api/signout — clear ALL auth state (guest, agent, NextAuth) and redirect home.
 * Use this for a reliable sign out regardless of how the user signed in.
 */
export function GET(request: NextRequest) {
  const baseUrl = request.nextUrl.origin;
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 0,
    path: "/",
  };

  // Redirect to NextAuth signout (clears session), with our cookies cleared in this response
  const signoutUrl = `${baseUrl}/api/auth/signout?callbackUrl=${encodeURIComponent(baseUrl + "/")}`;
  const res = NextResponse.redirect(signoutUrl, 302);

  res.cookies.set(getGuestCookieName(), "", cookieOpts);
  res.cookies.set(getAgentCookieName(), "", cookieOpts);

  return res;
}
