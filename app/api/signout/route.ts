import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  getGuestCookieName,
  getAgentCookieName,
  getClearCookieOptions,
} from "@/lib/auth-utils";

/**
 * GET /api/signout — clear ALL auth state (guest, agent, NextAuth) and redirect home.
 * Use this for a reliable sign out regardless of how the user signed in.
 */
export function GET(request: NextRequest) {
  const baseUrl = request.nextUrl.origin;
  const cookieOpts = getClearCookieOptions();

  // Redirect to NextAuth signout (clears session), with our cookies cleared in this response
  const signoutUrl = `${baseUrl}/api/auth/signout?callbackUrl=${encodeURIComponent(baseUrl + "/")}`;
  const res = NextResponse.redirect(signoutUrl, 302);

  res.cookies.set(getGuestCookieName(), "", cookieOpts);
  res.cookies.set(getAgentCookieName(), "", cookieOpts);

  return res;
}
