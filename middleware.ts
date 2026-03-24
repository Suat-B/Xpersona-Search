import { NextResponse, after } from "next/server";
import type { NextRequest } from "next/server";
import { getPathForService, getServiceBaseUrl, getServiceFromHost, isAllowedRoute, type Service } from "@/lib/subdomain";
import { getCrawlerName } from "@/lib/bot-detect";
import { trackBotPageViewAll } from "@/lib/server-analytics";
import {
  classifyBotPageType,
  parseAgentDetailSlugFromPath,
} from "@/lib/agents/route-patterns";
import {
  createCrawlLicenseRequiredResponse,
  CRAWL_CUSTOMER_ID_HEADER,
  CRAWL_KEY_PREFIX_HEADER,
  CRAWL_TOKEN_VERIFIED_HEADER,
  INTERNAL_CRAWL_RENDER_HEADER,
  getCrawlTokenFromRequest,
  hasCrawlLicenseSecretConfigured,
  isPayPerCrawlEnabled,
  requiresCrawlLicense,
  verifyCrawlLicenseToken,
} from "@/lib/crawl-license";

const X_SERVICE_HEADER = "x-service";
const X_IS_BOT = "x-is-bot";
const X_BOT_NAME = "x-bot-name";
const X_BOT_PATH = "x-bot-path";
const X_BOT_PAGEVIEW_SENT = "x-bot-pageview-sent";
const X_REQUEST_ID_HEADER = "x-request-id";
const INTERNAL_V1_PROXY_HEADER = "x-internal-api-proxy";
const REMOVED_PREFIXES = ["/casino", "/faucet", "/register", "/ans"] as const;
const API_LEGACY_EXCEPTIONS = ["/api/v1", "/api/auth", "/api/stripe/webhook"] as const;
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
    normalized === "/dice" ||
    normalized.startsWith("/dice/") ||
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
  const ua = req.headers.get("user-agent") ?? "";
  const isInternalCrawlRender = req.headers.get(INTERNAL_CRAWL_RENDER_HEADER) === "1";
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
  const requestHeadersForCrawl = new Headers(req.headers);
  let crawlRewriteUrl: URL | null = null;

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

  if (
    isPayPerCrawlEnabled() &&
    hasCrawlLicenseSecretConfigured() &&
    getCrawlerName(ua) &&
    requiresCrawlLicense(url.pathname)
  ) {
    const token = getCrawlTokenFromRequest(req);
    const payload = await verifyCrawlLicenseToken(token);
    if (!payload) {
      return createCrawlLicenseRequiredResponse(req, req.nextUrl.origin);
    }
    requestHeadersForCrawl.set(CRAWL_CUSTOMER_ID_HEADER, payload.sub);
    requestHeadersForCrawl.set(CRAWL_KEY_PREFIX_HEADER, payload.kid);
    requestHeadersForCrawl.set(CRAWL_TOKEN_VERIFIED_HEADER, "1");
    if (!isInternalCrawlRender && wantsHtml(req) && url.pathname.startsWith("/agent/")) {
      const slug = parseAgentDetailSlugFromPath(url.pathname);
      if (slug) {
        crawlRewriteUrl = req.nextUrl.clone();
        crawlRewriteUrl.pathname = `/api/v1/crawl-license/render-agent/${slug}`;
      }
    }
  }

  const requestHeaders = requestHeadersForCrawl;
  requestHeaders.set(X_SERVICE_HEADER, serviceForHeader);

  const botName = getCrawlerName(ua);
  if (botName && wantsHtml(req)) {
    requestHeaders.set(X_IS_BOT, "1");
    requestHeaders.set(X_BOT_NAME, botName);
    requestHeaders.set(X_BOT_PATH, `${url.pathname}${url.search}`);
    requestHeaders.set(X_BOT_PAGEVIEW_SENT, "1");

    if (!isInternalCrawlRender) {
      const forwardedHost = req.headers.get("x-forwarded-host") ?? host;
      const proto =
        req.headers.get("x-forwarded-proto") ??
        (hostname === "localhost" || hostname.startsWith("127.") ? "http" : "https");
      const pageUrl = `${proto}://${forwardedHost}${url.pathname}${url.search}`;
      const xff = req.headers.get("x-forwarded-for") ?? "";
      const cookie = req.headers.get("cookie") ?? "";
      const referer = req.headers.get("referer") ?? "";
      const agentSlug = parseAgentDetailSlugFromPath(url.pathname);
      const pageType = classifyBotPageType(url.pathname);
      try {
        after(() =>
          trackBotPageViewAll({
            pageUrl,
            path: `${url.pathname}${url.search}`,
            botName,
            userAgent: ua,
            xForwardedFor: xff,
            cookie,
            referrer: referer || undefined,
            gamDimensions: agentSlug
              ? {
                  agent_slug: agentSlug,
                  page_type: pageType,
                  gam_ad_unit: "agent_page",
                }
              : {
                  page_type: pageType,
                },
          })
        );
      } catch {
        // Test environments and non-request contexts do not expose Next's request-scoped after().
      }
    }
  }

  const res = crawlRewriteUrl
    ? NextResponse.rewrite(crawlRewriteUrl, {
        request: { headers: requestHeaders },
      })
    : NextResponse.next({
        request: { headers: requestHeaders },
      });

  if (botName && wantsHtml(req) && !isInternalCrawlRender) {
    res.headers.set("x-bot-tracked", "1");
  }

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
