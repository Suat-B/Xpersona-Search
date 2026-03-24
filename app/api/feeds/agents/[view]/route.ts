import { NextResponse } from "next/server";
import { getPublicAgentFeed, type PublicAgentFeedView } from "@/lib/agents/public-collections";
import { applyRequestIdHeader, jsonError } from "@/lib/api/errors";
import { recordApiResponse } from "@/lib/metrics/record";

const FEED_VIEWS = new Set<PublicAgentFeedView>([
  "latest",
  "benchmarked",
  "security-reviewed",
  "openapi-ready",
  "recent-updates",
]);

export async function GET(
  req: Request,
  { params }: { params: Promise<{ view: string }> }
) {
  const startedAt = Date.now();
  const { view } = await params;
  if (!view || !FEED_VIEWS.has(view as PublicAgentFeedView)) {
    const response = jsonError(req, {
      code: "BAD_REQUEST",
      message: "Unknown feed view",
      status: 400,
    });
    recordApiResponse("/api/feeds/agents/:view", req, response, startedAt);
    return response;
  }

  const limitRaw = Number(new URL(req.url).searchParams.get("limit") ?? "24");
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(Math.floor(limitRaw), 60)) : 24;
  const feed = await getPublicAgentFeed(view as PublicAgentFeedView, limit);

  const response = NextResponse.json(feed);
  response.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
  applyRequestIdHeader(response, req);
  recordApiResponse("/api/feeds/agents/:view", req, response, startedAt);
  return response;
}
