import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents, gpgAgentCollaborationEdges } from "@/lib/db/schema";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { resolveAgentByIdOrSlug } from "@/lib/reliability/lookup";
import { applyRequestIdHeader, jsonError } from "@/lib/api/errors";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const agent = await resolveAgentByIdOrSlug(agentId);
  if (!agent) {
    return jsonError(req, {
      code: "NOT_FOUND",
      message: "Agent not found",
      status: 404,
    });
  }

  const url = new URL(req.url);
  const limit = Math.min(20, Math.max(1, Number(url.searchParams.get("limit") ?? "10")));
  const clusterId = url.searchParams.get("clusterId");

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

  const response = NextResponse.json({
    agentId: agent.id,
    related,
  });
  applyRequestIdHeader(response, req);
  return response;
}
