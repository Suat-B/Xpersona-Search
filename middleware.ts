import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  getServiceFromHost,
  isAllowedRoute,
  getServiceBaseUrl,
  getAnsSubdomainFromHost,
  type Service,
} from "@/lib/subdomain";

const X_SERVICE_HEADER = "x-service";

/** Login is not required: dashboard and games are open to all. Guest sessions are auto-created when needed. */
export async function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const url = req.nextUrl.clone();
  const searchParams = url.searchParams;

  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  const pathname = url.pathname || "/";
  const normalizedPath = pathname.replace(/\/$/, "") || "/";

  // *.xpersona.agent: rewrite / and /card.json to Agent Card API
  const ansSubdomain = getAnsSubdomainFromHost(host);
  if (ansSubdomain && (normalizedPath === "/" || normalizedPath === "/card.json")) {
    const rewriteUrl = req.nextUrl.clone();
    rewriteUrl.pathname = `/api/ans/card/${ansSubdomain}`;
    return NextResponse.rewrite(rewriteUrl);
  }

  // Redirect www.xpersona.co -> xpersona.co
  if (hostname === "www.xpersona.co") {
    url.host = "xpersona.co";
    return NextResponse.redirect(url);
  }

  const service = getServiceFromHost(host, searchParams);

  // Rewrite: trading subdomain / -> /trading (marketplace as root)

  if (service === "trading" && (normalizedPath === "/" || normalizedPath === "")) {
    const rewriteUrl = req.nextUrl.clone();
    rewriteUrl.pathname = "/trading";
    return NextResponse.rewrite(rewriteUrl);
  }

  // Route guarding: redirect to correct subdomain if path not allowed
  if (!isAllowedRoute(service, normalizedPath)) {
    const targetService = getRedirectTarget(service, normalizedPath);
    if (targetService) {
      const targetBase = getServiceBaseUrl(targetService);
      const targetPath = getRedirectPath(normalizedPath, targetService);
      const targetUrl = `${targetBase}${targetPath}${url.search}`;
      return NextResponse.redirect(targetUrl);
    }
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(X_SERVICE_HEADER, service);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

function getRedirectTarget(
  currentService: Service,
  pathname: string
): Service | null {
  if (pathname.startsWith("/trading")) {
    return currentService === "game" || currentService === "hub" ? "trading" : null;
  }
  if (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/games") ||
    pathname.startsWith("/docs") ||
    pathname.startsWith("/embed") ||
    pathname.startsWith("/admin")
  ) {
    return currentService === "trading" || currentService === "hub" ? "game" : null;
  }
  return null;
}

function getRedirectPath(pathname: string, targetService: Service): string {
  if (targetService === "trading") {
    return pathname.startsWith("/trading") ? pathname : "/trading";
  }
  if (targetService === "game") {
    return pathname;
  }
  return pathname || "/";
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
