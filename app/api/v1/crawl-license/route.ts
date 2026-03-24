import { NextRequest, NextResponse } from "next/server";
import { applyRequestIdHeader } from "@/lib/api/errors";
import {
  CRAWL_LICENSE_COOKIE,
  createCrawlLicenseRequiredResponse,
  getConfiguredCrawlPackages,
  getCrawlApiKeyFromHeaders,
  getCrawlLicenseTokenTtlSeconds,
  getCrawlLicenseUrls,
  hasCrawlLicenseSecretConfigured,
  isPayPerCrawlEnabled,
} from "@/lib/crawl-license";
import { issueCrawlTokenForApiKey } from "@/lib/crawl-license-store";

export async function GET(req: NextRequest) {
  const base = req.nextUrl.origin;
  const urls = getCrawlLicenseUrls(base);
  const body = {
    message:
      "Xpersona crawl licensing sells prepaid credits via Stripe and exchanges crawl API keys for short-lived signed tokens.",
    pay_per_crawl_enabled: isPayPerCrawlEnabled(),
    secret_configured: hasCrawlLicenseSecretConfigured(),
    license_document_url: urls.licenseUrl,
    checkout_endpoint: urls.checkoutUrl,
    token_endpoint: urls.licenseUrl,
    success_reveal_endpoint: urls.revealUrl,
    status_endpoint: urls.statusUrl,
    rotate_key_endpoint: urls.rotateKeyUrl,
    success_page: urls.successUrl,
    token_ttl_seconds: getCrawlLicenseTokenTtlSeconds(),
    packages: getConfiguredCrawlPackages(),
    free_surfaces: [
      "/",
      "/llms.txt",
      "/llms-full.txt",
      "/chatgpt.txt",
      "/for-agents",
      "/api/v1/search",
      "/api/search/ai",
      "/api/v1/feeds/agents/{view}",
      "/api/v1/agents/{slug}/card",
      "/api/v1/agents/{slug}/facts",
      "/agent/benchmarked",
      "/agent/openapi-ready",
      "/agent/security-reviewed",
      "/agent/recent-updates",
      "/agent/vendor/{vendor}",
      "/agent/artifacts/{artifactType}",
    ],
    gated_surfaces: [
      "/agent/{slug} (HTML)",
      "/api/v1/agents/{slug}/snapshot",
      "/api/v1/agents/{slug}/contract",
      "/api/v1/agents/{slug}/trust",
    ],
    auth: {
      api_key: "Authorization: Bearer <xpcrawl_...>",
      token_exchange:
        "POST with Authorization: Bearer <xpcrawl_...> or JSON body { \"apiKey\": \"xpcrawl_...\" }",
      token_transport: {
        header: "X-Crawl-License: <access_token>",
        cookie: `${CRAWL_LICENSE_COOKIE}=<access_token>`,
        authorization: "Authorization: Crawl <access_token>",
      },
    },
    recovery: {
      no_credits: "Buy another prepaid package via checkout_endpoint.",
      first_key_delivery:
        "First-time keys are revealed once on the checkout success page using the Stripe session_id.",
      lost_key: "Manual/admin reset only in v1.",
    },
  };
  const res = NextResponse.json(body);
  applyRequestIdHeader(res, req);
  return res;
}

export async function POST(req: NextRequest) {
  let apiKey = getCrawlApiKeyFromHeaders(req.headers);
  let ttlSeconds = getCrawlLicenseTokenTtlSeconds();

  try {
    const json = (await req.json()) as { apiKey?: unknown; ttlSeconds?: unknown };
    if (!apiKey && typeof json?.apiKey === "string") apiKey = json.apiKey.trim();
    if (typeof json?.ttlSeconds === "number" && Number.isFinite(json.ttlSeconds)) {
      ttlSeconds = Math.max(300, Math.min(Math.floor(json.ttlSeconds), 365 * 24 * 3600));
    }
  } catch {
    // Header-only requests are valid.
  }

  const issued = await issueCrawlTokenForApiKey(apiKey, ttlSeconds);
  if (!issued.ok) {
    if (issued.reason === "UNAUTHORIZED") {
      const res = NextResponse.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Valid crawl API key required.",
          },
        },
        { status: 401 }
      );
      applyRequestIdHeader(res, req);
      return res;
    }

    if (issued.reason === "MISCONFIGURED") {
      const res = NextResponse.json(
        {
          success: false,
          error: {
            code: "MISCONFIGURED",
            message: "CRAWL_LICENSE_SECRET must be configured to mint crawl tokens.",
          },
        },
        { status: 500 }
      );
      applyRequestIdHeader(res, req);
      return res;
    }

    return createCrawlLicenseRequiredResponse(req, req.nextUrl.origin, {
      code:
        issued.reason === "SUSPENDED"
          ? "CRAWL_LICENSE_SUSPENDED"
          : "CRAWL_CREDITS_EXHAUSTED",
      message:
        issued.reason === "SUSPENDED"
          ? "This crawl license is suspended."
          : "This crawl license has no remaining credits.",
    });
  }

  const res = NextResponse.json({
    success: true,
    access_token: issued.token,
    token_type: "Crawl",
    expires_in: issued.expiresIn,
    cookie_name: CRAWL_LICENSE_COOKIE,
    customer: {
      id: issued.customer.id,
      keyPrefix: issued.customer.apiKeyPrefix,
      creditBalance: issued.customer.creditBalance,
      status: issued.customer.status,
    },
    usage:
      "Send the returned token on premium crawl requests as X-Crawl-License, Authorization: Crawl <token>, or xp_crawl_license cookie.",
  });
  applyRequestIdHeader(res, req);
  return res;
}
