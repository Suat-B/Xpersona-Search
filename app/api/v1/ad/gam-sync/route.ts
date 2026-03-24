import { NextRequest, NextResponse } from "next/server";
import { applyRequestIdHeader } from "@/lib/api/errors";
import {
  getGamBotCreatives,
  getGamCreativeCacheMeta,
  refreshGamCreativeCacheFromEnv,
  setGamBotCreativesPayload,
  type GamBotCreative,
} from "@/lib/ads/gam-creative-cache";

function isAuthorized(req: NextRequest): boolean {
  const token = process.env.TRUST_INTERNAL_TOKEN?.trim();
  if (!token) return false;
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return bearer === token;
}

/**
 * GET /api/v1/ad/gam-sync — refresh cache from env, return meta + preview count.
 * POST — replace cache from JSON body `{ "creatives": [...] }`.
 *
 * Requires `Authorization: Bearer <TRUST_INTERNAL_TOKEN>`.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    const res = NextResponse.json({ error: "unauthorized" }, { status: 401 });
    applyRequestIdHeader(res, req);
    return res;
  }

  refreshGamCreativeCacheFromEnv();
  const meta = getGamCreativeCacheMeta();
  const res = NextResponse.json({
    success: true,
    meta,
    previewCount: getGamBotCreatives().length,
  });
  applyRequestIdHeader(res, req);
  return res;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    const res = NextResponse.json({ error: "unauthorized" }, { status: 401 });
    applyRequestIdHeader(res, req);
    return res;
  }

  try {
    const body = (await req.json()) as { creatives?: unknown };
    if (!Array.isArray(body.creatives)) {
      const res = NextResponse.json(
        { error: "invalid_body", message: "Expected { creatives: GamBotCreative[] }" },
        { status: 400 }
      );
      applyRequestIdHeader(res, req);
      return res;
    }

    const creatives: GamBotCreative[] = [];
    for (let i = 0; i < body.creatives.length; i++) {
      const row = body.creatives[i] as Record<string, unknown>;
      const id = typeof row.id === "string" ? row.id : `post-${i}`;
      const headline = typeof row.headline === "string" ? row.headline : "";
      const description = typeof row.description === "string" ? row.description : "";
      const clickUrl = typeof row.clickUrl === "string" ? row.clickUrl : "";
      const advertiserName =
        typeof row.advertiserName === "string" ? row.advertiserName : headline || "Sponsor";
      const slotKey = typeof row.slotKey === "string" ? row.slotKey : "synced";
      if (!clickUrl) continue;
      creatives.push({ id, slotKey, headline, description, clickUrl, advertiserName });
    }

    setGamBotCreativesPayload(creatives);
    const meta = getGamCreativeCacheMeta();
    const res = NextResponse.json({
      success: true,
      meta,
      count: getGamBotCreatives().length,
    });
    applyRequestIdHeader(res, req);
    return res;
  } catch {
    const res = NextResponse.json({ error: "invalid_json" }, { status: 400 });
    applyRequestIdHeader(res, req);
    return res;
  }
}
