import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getGuestCookieName, getClearCookieOptions } from "@/lib/auth-utils";

/**
 * GET /api/auth/guest/signout — clear guest session cookie and redirect to home.
 * Use this when the user is a guest (email ends with @xpersona.guest).
 */
export function GET(request: NextRequest) {
  const res = NextResponse.redirect(new URL("/", request.nextUrl), 302);
  res.cookies.set(getGuestCookieName(), "", getClearCookieOptions());
  return res;
}
