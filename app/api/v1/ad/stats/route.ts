import { NextRequest, NextResponse } from "next/server";
import { getAllAds } from "@/lib/ads/ad-inventory";
import { getAllStats } from "@/lib/ads/ad-tracker";

/**
 * GET /api/v1/ad/stats
 *
 * Returns impression/click counts for all ads.
 * Protected by ADMIN_EMAILS or a simple bearer token.
 */
export async function GET(req: NextRequest) {
  const adminToken = process.env.TRUST_INTERNAL_TOKEN?.trim();
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

  if (!adminToken || bearer !== adminToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const ads = getAllAds();
  const stats = getAllStats();

  const result = ads.map((ad) => ({
    id: ad.id,
    sponsor: ad.sponsor,
    enabled: ad.enabled !== false,
    clickUrl: ad.clickUrl,
    ...(stats[ad.id] ?? {
      impressions: 0,
      clicks: 0,
      lastImpression: null,
      lastClick: null,
    }),
  }));

  return NextResponse.json({
    success: true,
    data: result,
    meta: { timestamp: new Date().toISOString() },
  });
}
