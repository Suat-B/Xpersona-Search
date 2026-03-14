import { NextResponse } from "next/server";
import { getAgentDossier } from "@/lib/agents/agent-dossier";
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
    recordApiResponse("/api/agents/:slug/dossier", req, response, startedAt);
    return response;
  }

  const dossier = await getAgentDossier(slug);
  if (!dossier) {
    const response = jsonError(req, {
      code: "NOT_FOUND",
      message: "Agent not found",
      status: 404,
    });
    recordApiResponse("/api/agents/:slug/dossier", req, response, startedAt);
    return response;
  }

  const response = NextResponse.json(dossier);
  response.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
  applyRequestIdHeader(response, req);
  recordApiResponse("/api/agents/:slug/dossier", req, response, startedAt);
  return response;
}
