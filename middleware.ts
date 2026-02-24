import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServiceBaseUrl } from "@/lib/subdomain";

const X_SERVICE_HEADER = "x-service";
const X_REQUEST_ID_HEADER = "x-request-id";
const INTERNAL_V1_PROXY_HEADER = "x-internal-api-proxy";
const REMOVED_PREFIXES = ["/games", "/trading", "/casino", "/faucet", "/register", "/ans"] as const;
const API_LEGACY_EXCEPTIONS = ["/api/v1", "/api/auth"] as const;

function isRemovedPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/$/, "") || "/";
  return REMOVED_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
}

function isLegacyApiPath(pathname: string): boolean {
  if (!(pathname === "/api" || pathname.startsWith("/api/"))) return false;
  return !API_LEGACY_EXCEPTIONS.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function buildMigrationPath(pathname: string, search: string): string {
  if (pathname === "/api") return `/api/v1${search}`;
  return `${pathname.replace(/^\/api/, "/api/v1")}${search}`;
}

export async function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const url = req.nextUrl.clone();
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  const requestId = req.headers.get(X_REQUEST_ID_HEADER)?.trim() || crypto.randomUUID();

  if (
    isLegacyApiPath(url.pathname) &&
    req.headers.get(INTERNAL_V1_PROXY_HEADER) !== "1"
  ) {
    const migration = buildMigrationPath(url.pathname, url.search);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "API_VERSION_DEPRECATED",
          message: "This endpoint has moved to /api/v1.",
          details: {
            migration,
            legacy: `${url.pathname}${url.search}`,
          },
        },
        meta: {
          requestId,
          version: "v1",
          timestamp: new Date().toISOString(),
        },
      },
      {
        status: 410,
        headers: {
          "X-Request-Id": requestId,
          "X-API-Version": "v1",
        },
      }
    );
  }

  if (hostname === "www.xpersona.co") {
    url.host = "xpersona.co";
    return NextResponse.redirect(url);
  }

  if (
    hostname === "game.xpersona.co" ||
    hostname === "trading.xpersona.co" ||
    hostname === "game.localhost" ||
    hostname === "trading.localhost"
  ) {
    const target = new URL(`${getServiceBaseUrl("hub")}${url.pathname}${url.search}`);
    return NextResponse.redirect(target);
  }

  if (isRemovedPath(url.pathname)) {
    const target = new URL("/", req.url);
    return NextResponse.redirect(target);
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(X_SERVICE_HEADER, "hub");

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    "/api/:path*",
  ],
};
