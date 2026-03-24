import { NextRequest, NextResponse } from "next/server";
import { API_DISCOVERY_AD_ID } from "@/lib/ads/ad-inventory";
import { recordImpression } from "@/lib/ads/ad-tracker";
import { getCrawlerName } from "@/lib/bot-detect";
import { trackBotPageViewGA4 } from "@/lib/server-analytics";

/**
 * GET /api/v1/ad
 *
 * Public discovery document for the site-wide tracked ad endpoints.
 * Each successful request records one internal impression for `API_DISCOVERY_AD_ID`
 * (see /api/v1/ad/stats with admin token). This is not Google AdSense.
 */
export async function GET(req: NextRequest) {
  recordImpression(API_DISCOVERY_AD_ID);

  const ua = req.headers.get("user-agent") ?? "";
  const botName = getCrawlerName(ua);
  if (botName) {
    const xff = req.headers.get("x-forwarded-for") ?? "";
    void trackBotPageViewGA4({
      pageUrl: req.nextUrl.toString(),
      path: "/api/v1/ad",
      title: `Ad API discovery · ${API_DISCOVERY_AD_ID}`,
      userAgent: ua,
      xForwardedFor: xff,
    }).catch(() => {
      /* ignore */
    });
  }

  return NextResponse.json({
    success: true,
    name: "Xpersona Ad API",
    description:
      "Server-side tracked display inventory: impression on image fetch, click via redirect. Used for crawler-visible sponsorship alongside AdSense.",
    tracking: {
      internalImpressionId: API_DISCOVERY_AD_ID,
      internalImpressionNote:
        "This request incremented the internal impression counter for that id (see GET /api/v1/ad/stats with admin token).",
    },
    notes: {
      googleAdSense:
        "AdSense earnings and impressions only happen when Google's JavaScript (adsbygoogle.js) serves an ad in a real browser. Calling this JSON API or /api/v1/ad/click/{id} does not create AdSense impressions, clicks, or revenue — that would require Google's ad serving. Use AdSense on HTML pages for monetization; use this API for your own sponsorship / analytics.",
    },
    endpoints: {
      discovery: { method: "GET", path: "/api/v1/ad" },
      impression: {
        method: "GET",
        path: "/api/v1/ad/impression/{id}",
        note: "Returns the creative image and records an impression. {id} matches inventory in lib/ads/ad-inventory.ts.",
      },
      click: {
        method: "GET",
        path: "/api/v1/ad/click/{id}",
        note: "302 redirect to the sponsor URL; records an internal click only — not an AdSense click.",
      },
      stats: {
        method: "GET",
        path: "/api/v1/ad/stats",
        note: "Requires Authorization: Bearer <TRUST_INTERNAL_TOKEN>.",
      },
      gamSync: {
        method: "GET|POST",
        path: "/api/v1/ad/gam-sync",
        note: "Refresh GAM-mirror bot creative cache (Bearer TRUST_INTERNAL_TOKEN). POST body { creatives: [...] }.",
      },
      gamBotImpression: {
        method: "GET",
        path: "/api/v1/ad/gam-bot/impression/{id}",
        note: "1x1 PNG + counter for bot-visible GAM mirror creatives.",
      },
      gamBotClick: {
        method: "GET",
        path: "/api/v1/ad/gam-bot/click/{id}",
        note: "302 to sponsor; internal click counter only (not a GAM/AdSense counted click).",
      },
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
}
