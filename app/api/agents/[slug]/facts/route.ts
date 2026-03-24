import { NextResponse } from "next/server";
import { getPublicAgentEvidencePack } from "@/lib/agents/public-facts";
import { applyRequestIdHeader, jsonError } from "@/lib/api/errors";
import { recordApiResponse } from "@/lib/metrics/record";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const startedAt = Date.now();
  const { slug } = await params;
  if (!slug) {
    const response = jsonError(req, {
      code: "BAD_REQUEST",
      message: "Missing slug",
      status: 400,
    });
    recordApiResponse("/api/agents/:slug/facts", req, response, startedAt);
    return response;
  }

  const evidencePack = await getPublicAgentEvidencePack(slug);
  if (!evidencePack) {
    const response = jsonError(req, {
      code: "NOT_FOUND",
      message: "Agent not found",
      status: 404,
    });
    recordApiResponse("/api/agents/:slug/facts", req, response, startedAt);
    return response;
  }

  const response = NextResponse.json({
    slug,
    facts: evidencePack.facts,
    changeEvents: evidencePack.changeEvents,
  });
  response.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
  applyRequestIdHeader(response, req);
  recordApiResponse("/api/agents/:slug/facts", req, response, startedAt);
  return response;
}
