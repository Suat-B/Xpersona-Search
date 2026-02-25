import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents, gpgAgentCollaborationEdges } from "@/lib/db/schema";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { resolveAgentByIdOrSlug } from "@/lib/reliability/lookup";
import { applyRequestIdHeader, jsonError } from "@/lib/api/errors";
import { buildCacheKey } from "@/lib/search/cache";
import { graphRelatedCache } from "@/lib/graph/cache";
import { graphCircuitBreaker } from "@/lib/search/circuit-breaker";
import { recordApiResponse } from "@/lib/metrics/record";
import { recordGraphFallback } from "@/lib/metrics/kpi";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const startedAt = Date.now();
  const { agentId } = await params;
  const agent = await resolveAgentByIdOrSlug(agentId);
  if (!agent) {
    const response = jsonError(req, {
      code: "NOT_FOUND",
      message: "Agent not found",
      status: 404,
    });
    recordApiResponse("/api/graph/related/:agentId", req, response, startedAt);
    return response;
  }

  const url = new URL(req.url);
  const limit = Math.min(20, Math.max(1, Number(url.searchParams.get("limit") ?? "10")));
  const clusterId = url.searchParams.get("clusterId");

  const cacheKey = buildCacheKey({
    endpoint: "graph-related",
    agentId: agent.id,
    limit,
    clusterId: clusterId ?? "",
  });
  const cached = graphRelatedCache.get(cacheKey);
  if (cached) {
    const response = NextResponse.json(cached);
    response.headers.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
    response.headers.set("X-Cache", "HIT");
    applyRequestIdHeader(response, req);
    recordApiResponse("/api/graph/related/:agentId", req, response, startedAt);
    return response;
  }

  if (!graphCircuitBreaker.isAllowed()) {
    const stale = graphRelatedCache.get(cacheKey);
    if (stale) {
      const response = NextResponse.json({ ...(stale as Record<string, unknown>), _stale: true });
      response.headers.set("X-Cache", "STALE");
      recordGraphFallback("related", "stale_cache");
      applyRequestIdHeader(response, req);
      recordApiResponse("/api/graph/related/:agentId", req, response, startedAt);
      return response;
    }
    const response = jsonError(req, {
      code: "CIRCUIT_OPEN",
      message: "Graph related is temporarily unavailable",
      status: 503,
      retryAfterMs: 20_000,
    });
    recordGraphFallback("related", "circuit_open");
    recordApiResponse("/api/graph/related/:agentId", req, response, startedAt);
    return response;
  }

  try {
    const edges = await db
      .select({
        fromAgentId: gpgAgentCollaborationEdges.fromAgentId,
        toAgentId: gpgAgentCollaborationEdges.toAgentId,
        weight30d: gpgAgentCollaborationEdges.weight30d,
        clusterId: gpgAgentCollaborationEdges.clusterId,
      })
      .from(gpgAgentCollaborationEdges)
      .where(
        and(
          clusterId ? eq(gpgAgentCollaborationEdges.clusterId, clusterId) : sql`TRUE`,
          or(
            eq(gpgAgentCollaborationEdges.fromAgentId, agent.id),
            eq(gpgAgentCollaborationEdges.toAgentId, agent.id)
          )
        )
      )
      .orderBy(desc(gpgAgentCollaborationEdges.weight30d))
      .limit(200);

    const relatedMap = new Map<string, { weight: number; clusters: Set<string> }>();
    for (const edge of edges) {
      const otherId = edge.fromAgentId === agent.id ? edge.toAgentId : edge.fromAgentId;
      if (!otherId) continue;
      const entry = relatedMap.get(otherId) ?? { weight: 0, clusters: new Set<string>() };
      entry.weight += Number(edge.weight30d ?? 0);
      if (edge.clusterId) entry.clusters.add(String(edge.clusterId));
      relatedMap.set(otherId, entry);
    }

    const relatedIds = [...relatedMap.keys()];
    const relatedRows = relatedIds.length
      ? await db
          .select({ id: agents.id, slug: agents.slug, name: agents.name })
          .from(agents)
          .where(
            sql`${agents.id} = ANY(${sql.raw(`ARRAY[${relatedIds.map((id) => `'${id}'::uuid`).join(",")}]`)})`
          )
      : [];

    const metaById = new Map(relatedRows.map((row) => [String(row.id), row]));
    const related = relatedIds
      .map((id) => {
        const meta = metaById.get(id);
        const stats = relatedMap.get(id);
        if (!meta || !stats) return null;
        return {
          agentId: id,
          slug: meta.slug,
          name: meta.name,
          weight30d: stats.weight,
          clusters: [...stats.clusters],
        };
      })
      .filter(Boolean)
      .slice(0, limit);

    const payload = {
      agentId: agent.id,
      related,
    };
    graphRelatedCache.set(cacheKey, payload);
    graphCircuitBreaker.recordSuccess();
    const response = NextResponse.json(payload);
    response.headers.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
    response.headers.set("X-Cache", "MISS");
    applyRequestIdHeader(response, req);
    recordApiResponse("/api/graph/related/:agentId", req, response, startedAt);
    return response;
  } catch (err) {
    graphCircuitBreaker.recordFailure();
    const stale = graphRelatedCache.get(cacheKey);
    if (stale) {
      const response = NextResponse.json({ ...(stale as Record<string, unknown>), _stale: true });
      response.headers.set("X-Cache", "STALE");
      recordGraphFallback("related", "stale_cache");
      applyRequestIdHeader(response, req);
      recordApiResponse("/api/graph/related/:agentId", req, response, startedAt);
      return response;
    }
    const response = jsonError(req, {
      code: "INTERNAL_ERROR",
      message: "Graph related failed",
      status: 500,
      details: process.env.NODE_ENV === "production" ? undefined : String(err),
    });
    recordGraphFallback("related", "internal_error");
    recordApiResponse("/api/graph/related/:agentId", req, response, startedAt);
    return response;
  }
}
