import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Login is not required: dashboard and games are open to all. Guest sessions are auto-created when needed. */
export async function middleware(req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*", "/games", "/games/:path*"],
};
