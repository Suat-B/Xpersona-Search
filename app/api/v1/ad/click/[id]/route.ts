import { NextRequest, NextResponse } from "next/server";
import { getAdById } from "@/lib/ads/ad-inventory";
import { recordClick } from "@/lib/ads/ad-tracker";
import { getCrawlerName } from "@/lib/bot-detect";
import { trackBotPageViewGA4 } from "@/lib/server-analytics";

/**
 * GET /api/v1/ad/click/[id]
 *
 * Redirect to advertiser URL and log the click.
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

  recordClick(id);

  const ua = req.headers.get("user-agent") ?? "";
  const botName = getCrawlerName(ua);
  if (botName) {
    const xff = req.headers.get("x-forwarded-for") ?? "";
    void trackBotPageViewGA4({
      pageUrl: req.nextUrl.toString(),
      path: `/ad/click/${id}`,
      title: `Ad Click: ${ad.sponsor}`,
      userAgent: ua,
      xForwardedFor: xff,
    }).catch(() => {});
  }

  return NextResponse.redirect(ad.clickUrl, {
    status: 302,
    headers: {
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
      "x-ad-id": id,
      "x-ad-click": "1",
    },
  });
}
