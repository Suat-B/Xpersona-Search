import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";

export type HubAgent = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  source: string;
  protocols: string[];
  capabilities: string[];
  safetyScore: number;
  overallRank: number;
  updatedAt: string | null;
  createdAt: string | null;
  downloads: number | null;
};

export type UseCaseDefinition = {
  slug: string;
  title: string;
  intro: string;
  keywords: string[];
};

export const USE_CASES: UseCaseDefinition[] = [
  {
    slug: "research-assistant",
    title: "Research Assistant Agents",
    intro: "Agents that synthesize sources, analyze documents, and support multi-step research workflows.",
    keywords: ["research", "analysis", "summary", "retrieval", "insight"],
  },
  {
    slug: "developer-automation",
    title: "Developer Automation Agents",
    intro: "Agents focused on repositories, CI/CD, coding workflows, and operational developer tooling.",
    keywords: ["code", "repo", "github", "deploy", "ci", "automation", "dev"],
  },
  {
    slug: "support-automation",
    title: "Support Automation Agents",
    intro: "Agents for ticket triage, support response drafting, and knowledge-base grounded assistance.",
    keywords: ["support", "ticket", "helpdesk", "customer", "service", "faq"],
  },
  {
    slug: "sales-ops",
    title: "Sales Operations Agents",
    intro: "Agents for lead enrichment, CRM updates, outreach support, and pipeline acceleration.",
    keywords: ["sales", "lead", "crm", "outreach", "pipeline"],
  },
  {
    slug: "content-creation",
    title: "Content Creation Agents",
    intro: "Agents that draft, edit, localize, or transform content across formats and channels.",
    keywords: ["content", "writing", "seo", "social", "marketing", "copy"],
  },
  {
    slug: "general-automation",
    title: "General Automation Agents",
    intro: "Broad-purpose agents that orchestrate repetitive workflows with reliable task execution.",
    keywords: ["automation", "workflow", "orchestration", "task", "agent"],
  },
];

function toExternalProtocol(protocol: string): string {
  return protocol.toUpperCase() === "OPENCLEW" ? "OPENCLAW" : protocol.toUpperCase();
}

function fromExternalProtocol(protocol: string): string {
  const normalized = protocol.trim().toUpperCase();
  return normalized === "OPENCLAW" ? "OPENCLEW" : normalized;
}

function normalizeSourceSlug(source: string): string {
  return source.trim().toLowerCase();
}

function parseDownloads(raw: Record<string, unknown>): number | null {
  const npm = raw.npmData as Record<string, unknown> | null | undefined;
  if (npm && typeof npm.downloads === "number" && Number.isFinite(npm.downloads)) {
    return npm.downloads;
  }
  const clawhub = raw.openclawData as Record<string, unknown> | null | undefined;
  const clawhubStats = clawhub?.clawhub as Record<string, unknown> | undefined;
  const stats = clawhubStats?.stats as Record<string, unknown> | undefined;
  if (stats && typeof stats.downloads === "number" && Number.isFinite(stats.downloads)) {
    return stats.downloads;
  }
  return null;
}

function rowToHubAgent(row: Record<string, unknown>): HubAgent {
  const protocols = (Array.isArray(row.protocols) ? row.protocols : [])
    .filter((p): p is string => typeof p === "string")
    .map((p) => toExternalProtocol(p));
  const capabilities = (Array.isArray(row.capabilities) ? row.capabilities : [])
    .filter((c): c is string => typeof c === "string");
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    description: typeof row.description === "string" ? row.description : null,
    source: String(row.source),
    protocols,
    capabilities,
    safetyScore: Number(row.safetyScore ?? 0),
    overallRank: Number(row.overallRank ?? 0),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : null,
    downloads: parseDownloads(row),
  };
}

async function getBaseAgents(limit = 180): Promise<HubAgent[]> {
  const rows = await db
    .select({
      id: agents.id,
      slug: agents.slug,
      name: agents.name,
      description: agents.description,
      source: agents.source,
      protocols: agents.protocols,
      capabilities: agents.capabilities,
      safetyScore: agents.safetyScore,
      overallRank: agents.overallRank,
      updatedAt: agents.updatedAt,
      createdAt: agents.createdAt,
      npmData: agents.npmData,
      openclawData: agents.openclawData,
    })
    .from(agents)
    .where(and(eq(agents.status, "ACTIVE"), eq(agents.publicSearchable, true)))
    .orderBy(desc(agents.overallRank), desc(agents.updatedAt))
    .limit(limit);
  return rows.map((row) => rowToHubAgent(row as unknown as Record<string, unknown>));
}

export async function getTrendingAgents(limit = 20): Promise<HubAgent[]> {
  const rows = await db
    .select({
      id: agents.id,
      slug: agents.slug,
      name: agents.name,
      description: agents.description,
      source: agents.source,
      protocols: agents.protocols,
      capabilities: agents.capabilities,
      safetyScore: agents.safetyScore,
      overallRank: agents.overallRank,
      updatedAt: agents.updatedAt,
      createdAt: agents.createdAt,
      npmData: agents.npmData,
      openclawData: agents.openclawData,
    })
    .from(agents)
    .where(and(eq(agents.status, "ACTIVE"), eq(agents.publicSearchable, true)))
    .orderBy(desc(agents.overallRank), desc(agents.updatedAt))
    .limit(limit);
  return rows.map((row) => rowToHubAgent(row as unknown as Record<string, unknown>));
}

export async function getNewestAgents(limit = 20): Promise<HubAgent[]> {
  const rows = await db
    .select({
      id: agents.id,
      slug: agents.slug,
      name: agents.name,
      description: agents.description,
      source: agents.source,
      protocols: agents.protocols,
      capabilities: agents.capabilities,
      safetyScore: agents.safetyScore,
      overallRank: agents.overallRank,
      updatedAt: agents.updatedAt,
      createdAt: agents.createdAt,
      npmData: agents.npmData,
      openclawData: agents.openclawData,
    })
    .from(agents)
    .where(and(eq(agents.status, "ACTIVE"), eq(agents.publicSearchable, true)))
    .orderBy(desc(agents.createdAt), desc(agents.updatedAt))
    .limit(limit);
  return rows.map((row) => rowToHubAgent(row as unknown as Record<string, unknown>));
}

export async function getMostDownloadedAgents(limit = 20): Promise<HubAgent[]> {
  const base = await getBaseAgents(500);
  return base
    .filter((agent) => agent.downloads != null && agent.downloads > 0)
    .sort((a, b) => (b.downloads ?? 0) - (a.downloads ?? 0))
    .slice(0, limit);
}

export async function getProtocolCounts(limit = 8): Promise<Array<{ protocol: string; count: number }>> {
  const base = await getBaseAgents(300);
  const map = new Map<string, number>();
  for (const item of base) {
    const uniq = new Set(item.protocols);
    for (const protocol of uniq) {
      map.set(protocol, (map.get(protocol) ?? 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([protocol, count]) => ({ protocol, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export async function getSourceCounts(limit = 8): Promise<Array<{ source: string; count: number }>> {
  const rows = await db.execute(sql`
    SELECT source, count(*)::int AS count
    FROM agents
    WHERE status = 'ACTIVE' AND public_searchable = true
    GROUP BY source
    ORDER BY count(*) DESC
    LIMIT ${limit}
  `);
  const out = (rows as unknown as { rows?: Array<{ source: string; count: number }> }).rows ?? [];
  return out.map((item) => ({ source: item.source, count: Number(item.count) }));
}

export async function getAgentsByProtocol(protocol: string, limit = 24): Promise<HubAgent[]> {
  const target = fromExternalProtocol(protocol);
  const rows = await db
    .select({
      id: agents.id,
      slug: agents.slug,
      name: agents.name,
      description: agents.description,
      source: agents.source,
      protocols: agents.protocols,
      capabilities: agents.capabilities,
      safetyScore: agents.safetyScore,
      overallRank: agents.overallRank,
      updatedAt: agents.updatedAt,
      createdAt: agents.createdAt,
      npmData: agents.npmData,
      openclawData: agents.openclawData,
    })
    .from(agents)
    .where(
      and(
        eq(agents.status, "ACTIVE"),
        eq(agents.publicSearchable, true),
        sql`${agents.protocols} ? ${target}`
      )
    )
    .orderBy(desc(agents.overallRank), desc(agents.updatedAt))
    .limit(limit);
  return rows.map((row) => rowToHubAgent(row as unknown as Record<string, unknown>));
}

export async function getAgentsBySource(sourceSlug: string, limit = 24): Promise<HubAgent[]> {
  const sourceNormalized = sourceSlug.trim().toUpperCase();
  const rows = await db
    .select({
      id: agents.id,
      slug: agents.slug,
      name: agents.name,
      description: agents.description,
      source: agents.source,
      protocols: agents.protocols,
      capabilities: agents.capabilities,
      safetyScore: agents.safetyScore,
      overallRank: agents.overallRank,
      updatedAt: agents.updatedAt,
      createdAt: agents.createdAt,
      npmData: agents.npmData,
      openclawData: agents.openclawData,
    })
    .from(agents)
    .where(
      and(
        eq(agents.status, "ACTIVE"),
        eq(agents.publicSearchable, true),
        eq(agents.source, sourceNormalized)
      )
    )
    .orderBy(desc(agents.overallRank), desc(agents.updatedAt))
    .limit(limit);
  return rows.map((row) => rowToHubAgent(row as unknown as Record<string, unknown>));
}

function scoreUseCase(agent: HubAgent, useCase: UseCaseDefinition): number {
  const text = `${agent.name} ${agent.description ?? ""} ${agent.capabilities.join(" ")}`
    .toLowerCase();
  let score = 0;
  for (const keyword of useCase.keywords) {
    if (text.includes(keyword)) score += 5;
  }
  if (agent.overallRank >= 80) score += 3;
  if (agent.safetyScore >= 60) score += 2;
  return score;
}

export async function getAgentsByUseCase(useCaseSlug: string, limit = 24): Promise<{
  useCase: UseCaseDefinition | null;
  agents: HubAgent[];
}> {
  const useCase = USE_CASES.find((item) => item.slug === useCaseSlug) ?? null;
  if (!useCase) return { useCase: null, agents: [] };
  const base = await getBaseAgents(600);
  const ranked = base
    .map((agent) => ({ agent, score: scoreUseCase(agent, useCase) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.agent.overallRank - a.agent.overallRank)
    .slice(0, limit)
    .map((item) => item.agent);
  return { useCase, agents: ranked };
}

export async function getHubOverview(): Promise<{
  trending: HubAgent[];
  newest: HubAgent[];
  mostDownloaded: HubAgent[];
  protocolCounts: Array<{ protocol: string; count: number }>;
  sourceCounts: Array<{ source: string; count: number }>;
  useCases: UseCaseDefinition[];
}> {
  const [trending, newest, mostDownloaded, protocolCounts, sourceCounts] = await Promise.all([
    getTrendingAgents(10),
    getNewestAgents(10),
    getMostDownloadedAgents(10),
    getProtocolCounts(8),
    getSourceCounts(8),
  ]);

  return {
    trending,
    newest,
    mostDownloaded,
    protocolCounts,
    sourceCounts,
    useCases: USE_CASES,
  };
}

export async function getAgentsBySlugs(slugs: string[]): Promise<HubAgent[]> {
  if (slugs.length === 0) return [];
  const rows = await db
    .select({
      id: agents.id,
      slug: agents.slug,
      name: agents.name,
      description: agents.description,
      source: agents.source,
      protocols: agents.protocols,
      capabilities: agents.capabilities,
      safetyScore: agents.safetyScore,
      overallRank: agents.overallRank,
      updatedAt: agents.updatedAt,
      createdAt: agents.createdAt,
      npmData: agents.npmData,
      openclawData: agents.openclawData,
    })
    .from(agents)
    .where(
      and(
        eq(agents.status, "ACTIVE"),
        eq(agents.publicSearchable, true),
        sql`${agents.slug} = ANY(ARRAY[${sql.join(slugs.map((slug) => sql`${slug}`), sql`, `)}]::text[])`
      )
    )
    .limit(slugs.length);

  const mapped = rows.map((row) => rowToHubAgent(row as unknown as Record<string, unknown>));
  const bySlug = new Map(mapped.map((item) => [item.slug, item]));
  return slugs.map((slug) => bySlug.get(slug)).filter((item): item is HubAgent => Boolean(item));
}

export async function getAlternativeAgents(seed: HubAgent, limit = 6): Promise<HubAgent[]> {
  const protocol = seed.protocols[0];
  if (!protocol) return [];
  const base = await getAgentsByProtocol(protocol, 40);
  return base.filter((item) => item.slug !== seed.slug).slice(0, limit);
}

export function sourceSlugFromValue(value: string): string {
  return normalizeSourceSlug(value);
}
