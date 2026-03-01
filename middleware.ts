import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getPathForService, getServiceBaseUrl, getServiceFromHost, isAllowedRoute, type Service } from "@/lib/subdomain";

const X_SERVICE_HEADER = "x-service";
const X_REQUEST_ID_HEADER = "x-request-id";
const INTERNAL_V1_PROXY_HEADER = "x-internal-api-proxy";
const REMOVED_PREFIXES = ["/casino", "/faucet", "/register", "/ans"] as const;
const API_LEGACY_EXCEPTIONS = ["/api/v1", "/api/auth"] as const;
const AGENT_COOKIE_NAME = "xp_agent_session";
const AI_CONTACT_COOKIE = "xpersona_ai_contact";

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

function wantsHtml(req: NextRequest): boolean {
  const accept = req.headers.get("accept") ?? "";
  return accept.includes("text/html");
}

function buildMigrationPath(pathname: string, search: string): string {
  if (pathname === "/api") return `/api/v1${search}`;
  return `${pathname.replace(/^\/api/, "/api/v1")}${search}`;
}

function getServiceForPathname(pathname: string): Service | null {
  const normalized = pathname.replace(/\/$/, "") || "/";
  if (normalized === "/trading" || normalized.startsWith("/trading/")) return "trading";
  if (
    normalized === "/dashboard" ||
    normalized.startsWith("/dashboard/") ||
    normalized === "/games" ||
    normalized.startsWith("/games/") ||
    normalized === "/docs" ||
    normalized.startsWith("/docs/") ||
    normalized === "/embed" ||
    normalized.startsWith("/embed/") ||
    normalized === "/admin" ||
    normalized.startsWith("/admin/")
  ) {
    return "game";
  }
  return null;
}

export async function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const url = req.nextUrl.clone();
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  const requestId = req.headers.get(X_REQUEST_ID_HEADER)?.trim() || crypto.randomUUID();
  const hasBearer = (() => {
    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) return false;
    const token = authHeader.slice(7).trim();
    return token.length >= 32;
  })();
  const hasAgentCookie = Boolean(req.cookies.get(AGENT_COOKIE_NAME)?.value);

  if (
    isLegacyApiPath(url.pathname) &&
    req.headers.get(INTERNAL_V1_PROXY_HEADER) !== "1" &&
    !(url.pathname === "/api" && req.method === "GET" && wantsHtml(req))
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

  const hostService = getServiceFromHost(host, url.searchParams);
  const pathService = getServiceForPathname(url.pathname);
  const serviceForHeader = hostService === "hub" && pathService ? pathService : hostService;

  if (hostService !== "hub") {
    if (pathService && pathService !== hostService) {
      const targetPath = getPathForService(url.pathname, pathService);
      const target = new URL(`${getServiceBaseUrl(pathService)}${targetPath}${url.search}`);
      return NextResponse.redirect(target);
    }
    if (!isAllowedRoute(hostService, url.pathname)) {
      const targetPath = getPathForService(url.pathname, "hub");
      const target = new URL(`${getServiceBaseUrl("hub")}${targetPath}${url.search}`);
      return NextResponse.redirect(target);
    }
  }

  if (isRemovedPath(url.pathname)) {
    const target = new URL("/", req.url);
    return NextResponse.redirect(target);
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(X_SERVICE_HEADER, serviceForHeader);

  const res = NextResponse.next({
    request: { headers: requestHeaders },
  });

  if (url.pathname.startsWith("/api/") && (hasBearer || hasAgentCookie)) {
    res.cookies.set(AI_CONTACT_COOKIE, "1", {
      path: "/",
      maxAge: 30,
      sameSite: "lax",
    });
  }

  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    "/api/:path*",
  ],
};
