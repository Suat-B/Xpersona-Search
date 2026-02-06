import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getGuestCookieName } from "@/lib/auth-utils";

/**
 * GET /api/auth/guest/signout — clear guest session cookie and redirect to home.
 * Use this when the user is a guest (email ends with @xpersona.guest).
 */
export function GET(request: NextRequest) {
  const res = NextResponse.redirect(new URL("/", request.nextUrl), 302);
  res.cookies.set(getGuestCookieName(), "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return res;
}
