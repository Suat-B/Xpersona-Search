import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import {
  getAgentCookieName,
  getGuestCookieName,
  verifyAgentTokenEdge,
  verifyGuestTokenEdge,
} from "@/lib/agent-token-edge";

export async function middleware(req: NextRequest) {
  const isDashboard = req.nextUrl.pathname.startsWith("/dashboard");
  const isGames = req.nextUrl.pathname.startsWith("/games");
  const isProtected = isDashboard || isGames;
  const secret =
  process.env.NEXTAUTH_SECRET ||
  process.env.AUTH_SECRET ||
  (process.env.NODE_ENV === "development"
    ? "xpersona-dev-secret-min-32-chars-do-not-use-in-production"
    : undefined);
const token = await getToken({ req, secret });
  const isLoggedIn = !!token;

  if (isProtected && !isLoggedIn) {
    const agentToken = req.cookies.get(getAgentCookieName())?.value;
    if (agentToken) {
      const userId = await verifyAgentTokenEdge(agentToken);
      if (userId) return NextResponse.next();
    }
    const guestToken = req.cookies.get(getGuestCookieName())?.value;
    if (guestToken) {
      const userId = await verifyGuestTokenEdge(guestToken);
      if (userId) return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*", "/games", "/games/:path*"],
};
