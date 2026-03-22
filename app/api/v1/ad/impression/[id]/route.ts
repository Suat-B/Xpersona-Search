import { NextRequest, NextResponse } from "next/server";
import { getAdById } from "@/lib/ads/ad-inventory";
import { recordImpression } from "@/lib/ads/ad-tracker";
import { getCrawlerName } from "@/lib/bot-detect";
import { trackBotPageViewGA4 } from "@/lib/server-analytics";

/**
 * GET /api/v1/ad/impression/[id]
 *
 * When a bot (or browser) loads this URL as an <img src>, we:
 *   1. Log an ad impression
 *   2. Fire a GA4 event so it shows in analytics
 *   3. Proxy / redirect to the actual creative image
 *
 * This is the same model used by email newsletter ad networks.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ad = getAdById(id);

  if (!ad) {
    return NextResponse.json({ error: "ad_not_found" }, { status: 404 });
  }

  recordImpression(id);

  const ua = req.headers.get("user-agent") ?? "";
  const botName = getCrawlerName(ua);
  if (botName) {
    const xff = req.headers.get("x-forwarded-for") ?? "";
    void trackBotPageViewGA4({
      pageUrl: req.nextUrl.toString(),
      path: `/ad/impression/${id}`,
      title: `Ad Impression: ${ad.sponsor}`,
      userAgent: ua,
      xForwardedFor: xff,
    }).catch(() => {});
  }

  const imageUrl = ad.imageUrl;

  if (imageUrl.startsWith("/")) {
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost";
    const absoluteUrl = `${proto}://${host}${imageUrl}`;

    try {
      const imgRes = await fetch(absoluteUrl, {
        headers: { "accept": "image/*" },
      });

      if (!imgRes.ok) {
        return NextResponse.redirect(new URL(imageUrl, req.nextUrl.origin), 302);
      }

      const contentType = imgRes.headers.get("content-type") ?? "image/png";
      const body = await imgRes.arrayBuffer();

      return new NextResponse(body, {
        status: 200,
        headers: {
          "content-type": contentType,
          "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
          "x-ad-id": id,
          "x-ad-impression": "1",
        },
      });
    } catch {
      return NextResponse.redirect(new URL(imageUrl, req.nextUrl.origin), 302);
    }
  }

  return NextResponse.redirect(imageUrl, {
    status: 302,
    headers: {
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
      "x-ad-id": id,
      "x-ad-impression": "1",
    },
  });
}
