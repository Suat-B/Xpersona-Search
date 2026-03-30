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
  classifyLlmPageType,
  createLlmReferralSession,
  getConversionType,
  getLlmReferrerSource,
  INTERNAL_LLM_TRAFFIC_HEADER,
  LLM_REF_COOKIE_NAME,
  normalizeReferrerHost,
  parseLlmReferralSession,
} from "@/lib/llm-traffic-shared";
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
const INTERNAL_LLM_TRAFFIC_PATH = "/api/v1/internal/llm-traffic";

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
  const referer = req.headers.get("referer") ?? "";
  const isInternalCrawlRender = req.headers.get(INTERNAL_CRAWL_RENDER_HEADER) === "1";
  const hasBearer = (() => {
    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) return false;
    const token = authHeader.slice(7).trim();
    return token.length >= 32;
  })();
  const hasAgentCookie = Boolean(req.cookies.get(AGENT_COOKIE_NAME)?.value);
  const existingLlmReferral = parseLlmReferralSession(req.cookies.get(LLM_REF_COOKIE_NAME)?.value);
  const utmSource = url.searchParams.get("utm_source");
  const llmReferrerSource = getLlmReferrerSource({ referer, utmSource });
  const llmReferrerHost = normalizeReferrerHost(referer);
  const pageType = classifyLlmPageType(url.pathname);
  const shouldSkipInternalLlmTraffic =
    url.pathname === INTERNAL_LLM_TRAFFIC_PATH && req.headers.get(INTERNAL_LLM_TRAFFIC_HEADER) === "1";

  if (
    isLegacyApiPath(url.pathname) &&
    req.headers.get(INTERNAL_V1_PROXY_HEADER) !== "1" &&
    !shouldSkipInternalLlmTraffic &&
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
  const pathWithSearch = `${url.pathname}${url.search}`;
  requestHeadersForCrawl.set(
    "x-xp-pathname",
    pathWithSearch.length > 2048 ? pathWithSearch.slice(0, 2048) : pathWithSearch
  );
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
      const agentSlug = parseAgentDetailSlugFromPath(url.pathname);
      const botPageType = classifyBotPageType(url.pathname);
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
                  page_type: botPageType,
                  gam_ad_unit: "agent_page",
                }
              : {
                  page_type: botPageType,
                },
          })
        );
      } catch {
        // Test environments and non-request contexts do not expose Next's request-scoped after().
      }

      try {
        after(() =>
          fetch(`${proto}://${forwardedHost}${INTERNAL_LLM_TRAFFIC_PATH}`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              [INTERNAL_LLM_TRAFFIC_HEADER]: "1",
            },
            body: JSON.stringify({
              eventType: "crawler_hit",
              path: `${url.pathname}${url.search}`,
              pageType,
              botName,
              userAgent: ua,
              xForwardedFor: xff,
              referer,
            }),
          }).catch(() => {
            /* ignore */
          })
        );
      } catch {
        // Ignore logging failures outside request-scoped environments.
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

  const forwardedHost = req.headers.get("x-forwarded-host") ?? host;
  const proto =
    req.headers.get("x-forwarded-proto") ??
    (hostname === "localhost" || hostname.startsWith("127.") ? "http" : "https");
  const xff = req.headers.get("x-forwarded-for") ?? "";
  const pathWithQuery = `${url.pathname}${url.search}`;

  let trackedLlmSession = existingLlmReferral;

  if (!shouldSkipInternalLlmTraffic && llmReferrerSource && wantsHtml(req)) {
    const needsNewSession =
      !existingLlmReferral || existingLlmReferral.source !== llmReferrerSource;
    const sessionId = needsNewSession
      ? createLlmReferralSession(llmReferrerSource)
      : existingLlmReferral.sessionId;
    trackedLlmSession = { source: llmReferrerSource, sessionId };

    if (needsNewSession) {
      res.cookies.set(LLM_REF_COOKIE_NAME, sessionId, {
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
        sameSite: "lax",
      });
      try {
        after(() =>
          fetch(`${proto}://${forwardedHost}${INTERNAL_LLM_TRAFFIC_PATH}`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              [INTERNAL_LLM_TRAFFIC_HEADER]: "1",
            },
            body: JSON.stringify({
              eventType: "llm_referral",
              path: pathWithQuery,
              pageType,
              referrerHost: llmReferrerHost,
              referrerSource: llmReferrerSource,
              utmSource,
              sessionId,
              userAgent: ua,
              xForwardedFor: xff,
              referer,
            }),
          }).catch(() => {
            /* ignore */
          })
        );
      } catch {
        // Ignore logging failures outside request-scoped environments.
      }
    }
  }

  const activeLlmSession = trackedLlmSession;
  const conversionType = getConversionType(url.pathname);
  if (!shouldSkipInternalLlmTraffic && activeLlmSession && conversionType) {
    try {
      after(() =>
        fetch(`${proto}://${forwardedHost}${INTERNAL_LLM_TRAFFIC_PATH}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            [INTERNAL_LLM_TRAFFIC_HEADER]: "1",
          },
          body: JSON.stringify({
            eventType: "llm_conversion",
            path: pathWithQuery,
            pageType,
            referrerHost: llmReferrerHost,
            referrerSource: activeLlmSession.source,
            utmSource,
            sessionId: activeLlmSession.sessionId,
            conversionType,
            userAgent: ua,
            xForwardedFor: xff,
            referer,
          }),
        }).catch(() => {
          /* ignore */
        })
      );
    } catch {
      // Ignore logging failures outside request-scoped environments.
    }
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
