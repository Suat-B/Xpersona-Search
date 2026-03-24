import { NextRequest, NextResponse } from "next/server";
import { getGamBotCreativeById } from "@/lib/ads/gam-creative-cache";
import { recordImpression } from "@/lib/ads/ad-tracker";
import { getCrawlerName } from "@/lib/bot-detect";
import { trackBotPageViewGA4 } from "@/lib/server-analytics";

const ONE_PX_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmWQAAAABJRU5ErkJggg==",
  "base64"
);

/**
 * GET /api/v1/ad/gam-bot/impression/[id]
 * 1x1 pixel + internal counter for GAM-mirror bot creatives.
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

  recordImpression(`gam-bot:${id}`);

  const ua = req.headers.get("user-agent") ?? "";
  const botName = getCrawlerName(ua);
  if (botName) {
    const xff = req.headers.get("x-forwarded-for") ?? "";
    void trackBotPageViewGA4({
      pageUrl: req.nextUrl.toString(),
      path: `/ad/gam-bot/impression/${id}`,
      title: `GAM bot impression: ${creative.advertiserName}`,
      userAgent: ua,
      xForwardedFor: xff,
      gamDimensions: {
        gam_ad_unit: creative.slotKey,
        gam_bot_creative_id: id,
        page_type: "agent_profile",
      },
    }).catch(() => {});
  }

  return new NextResponse(ONE_PX_PNG, {
    status: 200,
    headers: {
      "content-type": "image/png",
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
      "x-gam-bot-impression": "1",
    },
  });
}
