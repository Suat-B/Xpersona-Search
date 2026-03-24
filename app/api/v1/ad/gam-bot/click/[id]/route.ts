import { NextRequest, NextResponse } from "next/server";
import { getGamBotCreativeById } from "@/lib/ads/gam-creative-cache";
import { recordClick } from "@/lib/ads/ad-tracker";
import { getCrawlerName } from "@/lib/bot-detect";
import { trackBotPageViewGA4 } from "@/lib/server-analytics";

/**
 * GET /api/v1/ad/gam-bot/click/[id]
 * Count click and redirect to the sponsor landing URL.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  const creative = getGamBotCreativeById(id);

  if (!creative) {
    return NextResponse.json({ error: "creative_not_found" }, { status: 404 });
  }

  recordClick(`gam-bot:${id}`);

  const ua = req.headers.get("user-agent") ?? "";
  const botName = getCrawlerName(ua);
  if (botName) {
    const xff = req.headers.get("x-forwarded-for") ?? "";
    void trackBotPageViewGA4({
      pageUrl: req.nextUrl.toString(),
      path: `/ad/gam-bot/click/${id}`,
      title: `GAM bot click: ${creative.advertiserName}`,
      userAgent: ua,
      xForwardedFor: xff,
      gamDimensions: {
        gam_ad_unit: creative.slotKey,
        gam_bot_creative_id: id,
        page_type: "agent_profile",
      },
    }).catch(() => {});
  }

  return NextResponse.redirect(creative.clickUrl, {
    status: 302,
    headers: {
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
      "x-gam-bot-click": "1",
    },
  });
}
