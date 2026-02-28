import { NextResponse } from "next/server";
import { getPublicAgentPageData } from "@/lib/agents/public-agent-page";
import { resolveEditorialContent } from "@/lib/agents/editorial-content";
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
    recordApiResponse("/api/agents/:slug/content", req, response, startedAt);
    return response;
  }

  const data = await getPublicAgentPageData(slug);
  if (!data) {
    const response = jsonError(req, {
      code: "NOT_FOUND",
      message: "Agent not found",
      status: 404,
    });
    recordApiResponse("/api/agents/:slug/content", req, response, startedAt);
    return response;
  }

  const clientData = (data.agentForClient ?? {}) as Record<string, unknown>;
  const openclawData =
    (clientData.openclawData as Record<string, unknown> | null | undefined) ?? null;

  const editorial = await resolveEditorialContent({
    agentId: data.id,
    name: data.name,
    description: data.description,
    capabilities: data.capabilities,
    protocols: data.protocols,
    source: data.source,
    readmeExcerpt: data.readmeExcerpt,
    updatedAtIso: data.updatedAtIso,
    openclawData,
    sourceUrl: data.sourceUrl,
    homepage: data.homepage,
  });

  const response = NextResponse.json({
    slug: data.slug,
    updatedAt: data.updatedAtIso,
    quality: editorial.quality,
    sections: editorial.sections,
    meta: {
      lastReviewedAt: editorial.lastReviewedAt,
      dataSources: editorial.dataSources,
      useCases: editorial.useCases,
      setupComplexity: editorial.setupComplexity,
    },
  });
  response.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
  applyRequestIdHeader(response, req);
  recordApiResponse("/api/agents/:slug/content", req, response, startedAt);
  return response;
}

