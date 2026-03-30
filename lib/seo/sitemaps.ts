import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { USE_CASES, sourceSlugFromValue } from "@/lib/agents/hub-data";
import { listPublicArtifactTypes, listPublicVendorSlugs } from "@/lib/agents/public-collections";
import { normalizeCapabilityToken } from "@/lib/search/capability-tokens";
import { getCanonicalEntityPath, type PublicEntityType } from "@/lib/entities/public-entities";

export type SitemapEntry = {
  url: string;
  changeFrequency?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
  lastModified?: Date | string;
};

type AgentSitemapRow = {
  slug: string;
  entityType: PublicEntityType;
  name: string | null;
  description: string | null;
  url: string | null;
  homepage: string | null;
  updatedAt: Date | null;
  protocols: unknown;
  capabilities: unknown;
  source: string | null;
};

const DEFAULT_BASE_URL = "https://xpersona.co";
const MAX_AGENT_URLS = 50_000;
export const SITEMAP_AGENT_CHUNK_SIZE = 45_000;
const CAPABILITY_QUERIES = ["PDF", "Research", "Web browsing", "Codegen", "Voice"] as const;
const SEARCH_PROTOCOLS = ["MCP", "A2A", "ANP", "OPENCLEW"] as const;
const NOISY_NAME_PATTERNS = [
  /^web$/i,
  /^linkedin$/i,
  /^discord$/i,
  /^roadmap$/i,
  /^article$/i,
  /^twitter$/i,
  /^x \(twitter\)$/i,
  /^documentation$/i,
  /^launch post$/i,
  /^founder'?s x$/i,
  /^author'?s twitter$/i,
] as const;
const NOISY_DESCRIPTION_PATTERNS = [/^<\/details>/i, /^###\s+links/i, /^links$/i] as const;
const NOISY_HOST_PATTERNS = [
  /(^|\.)linkedin\.com$/i,
  /(^|\.)discord\.(gg|com)$/i,
  /(^|\.)twitter\.com$/i,
  /(^|\.)x\.com$/i,
  /(^|\.)canny\.io$/i,
  /(^|\.)venturebeat\.com$/i,
  /(^|\.)medium\.com$/i,
  /(^|\.)youtube\.com$/i,
  /(^|\.)youtu\.be$/i,
] as const;

function isMissingEntityTypeColumnError(error: unknown): boolean {
  return error instanceof Error && /column "entity_type" does not exist/i.test(error.message);
}

function getBaseUrl(): string {
  return process.env.NEXTAUTH_URL ?? DEFAULT_BASE_URL;
}

function parseHostname(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function hasUsefulMachineSignals(row: AgentSitemapRow): boolean {
  const protocols = toStringArray(row.protocols);
  const capabilities = toStringArray(row.capabilities);
  const description = (row.description ?? "").trim();
  return protocols.length > 0 || capabilities.length > 0 || description.length >= 40;
}

export function isLowQualityPublicAgent(row: AgentSitemapRow): boolean {
  const name = (row.name ?? "").trim();
  const description = (row.description ?? "").trim();
  const host = parseHostname(row.homepage ?? row.url ?? null);

  if (!name || !hasUsefulMachineSignals(row)) return true;
  if (NOISY_NAME_PATTERNS.some((pattern) => pattern.test(name))) return true;
  if (description && NOISY_DESCRIPTION_PATTERNS.some((pattern) => pattern.test(description))) return true;
  if (host && NOISY_HOST_PATTERNS.some((pattern) => pattern.test(host))) return true;
  if (!row.homepage && !row.url) return true;

  return false;
}

async function getPublicSitemapRows(entityType: PublicEntityType): Promise<AgentSitemapRow[]> {
  try {
    const rows = await db
      .select({
        slug: agents.slug,
        entityType: agents.entityType,
        name: agents.name,
        description: agents.description,
        url: agents.url,
        homepage: agents.homepage,
        updatedAt: agents.updatedAt,
        protocols: agents.protocols,
        capabilities: agents.capabilities,
        source: agents.source,
      })
      .from(agents)
      .where(and(eq(agents.status, "ACTIVE"), eq(agents.publicSearchable, true), eq(agents.entityType, entityType)))
      .limit(MAX_AGENT_URLS);

    return rows.filter((row) => !isLowQualityPublicAgent(row));
  } catch (error) {
    if (!isMissingEntityTypeColumnError(error)) throw error;
    if (entityType !== "agent") return [];

    console.warn("[Sitemaps] agents.entity_type missing; falling back to agent-only sitemap rows");
    const rows = await db
      .select({
        slug: agents.slug,
        name: agents.name,
        description: agents.description,
        url: agents.url,
        homepage: agents.homepage,
        updatedAt: agents.updatedAt,
        protocols: agents.protocols,
        capabilities: agents.capabilities,
        source: agents.source,
      })
      .from(agents)
      .where(and(eq(agents.status, "ACTIVE"), eq(agents.publicSearchable, true)))
      .limit(MAX_AGENT_URLS);

    return rows
      .map((row) => ({
        ...row,
        entityType: "agent" as const,
      }))
      .filter((row) => !isLowQualityPublicAgent(row));
  }
}

export async function getAgentSitemapRows(): Promise<AgentSitemapRow[]> {
  return getPublicSitemapRows("agent");
}

export async function getSkillSitemapRows(): Promise<AgentSitemapRow[]> {
  return getPublicSitemapRows("skill");
}

export async function getMcpSitemapRows(): Promise<AgentSitemapRow[]> {
  return getPublicSitemapRows("mcp");
}

export async function getCoreSitemapEntries(): Promise<SitemapEntry[]> {
  const baseUrl = getBaseUrl();

  return [
    {
      url: baseUrl,
      changeFrequency: "daily",
      priority: 0.95,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/search`,
      changeFrequency: "daily",
      priority: 0.9,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/search/hf`,
      changeFrequency: "daily",
      priority: 0.78,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/search/ai`,
      changeFrequency: "daily",
      priority: 0.88,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/agent`,
      changeFrequency: "daily",
      priority: 0.95,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/skill`,
      changeFrequency: "daily",
      priority: 0.84,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/mcp`,
      changeFrequency: "daily",
      priority: 0.84,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/agent/trending`,
      changeFrequency: "daily",
      priority: 0.9,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/agent/new`,
      changeFrequency: "daily",
      priority: 0.88,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/agent/most-downloaded`,
      changeFrequency: "daily",
      priority: 0.88,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/for-agents`,
      changeFrequency: "daily",
      priority: 1,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/api/v1/openapi/ai-public`,
      changeFrequency: "daily",
      priority: 0.92,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/api/v1/openapi/public`,
      changeFrequency: "weekly",
      priority: 0.82,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/api/v1/feeds/agents/latest`,
      changeFrequency: "daily",
      priority: 0.86,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/api/v1/feeds/agents/benchmarked`,
      changeFrequency: "daily",
      priority: 0.86,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/api/v1/feeds/agents/security-reviewed`,
      changeFrequency: "daily",
      priority: 0.86,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/api/v1/feeds/agents/openapi-ready`,
      changeFrequency: "daily",
      priority: 0.86,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/api/v1/feeds/agents/recent-updates`,
      changeFrequency: "daily",
      priority: 0.86,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/docs`,
      changeFrequency: "weekly",
      priority: 0.9,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/api`,
      changeFrequency: "weekly",
      priority: 0.9,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/docs/capability-contracts`,
      changeFrequency: "weekly",
      priority: 0.85,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/llms.txt`,
      changeFrequency: "daily",
      priority: 0.9,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/llms-full.txt`,
      changeFrequency: "daily",
      priority: 0.85,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/chatgpt.txt`,
      changeFrequency: "daily",
      priority: 0.84,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/about`,
      changeFrequency: "weekly",
      priority: 0.7,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/contact`,
      changeFrequency: "weekly",
      priority: 0.7,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/editorial-policy`,
      changeFrequency: "weekly",
      priority: 0.7,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/methodology/agent-ranking`,
      changeFrequency: "weekly",
      priority: 0.75,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/agent/benchmarked`,
      changeFrequency: "daily",
      priority: 0.9,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/agent/openapi-ready`,
      changeFrequency: "daily",
      priority: 0.9,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/agent/security-reviewed`,
      changeFrequency: "daily",
      priority: 0.9,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/agent/recent-updates`,
      changeFrequency: "daily",
      priority: 0.9,
      lastModified: new Date(),
    },
  ];
}

export async function getAgentSitemapEntries(): Promise<SitemapEntry[]> {
  const baseUrl = getBaseUrl();
  const rows = await getAgentSitemapRows();
  return rows.map((row) => ({
    url: `${baseUrl}${getCanonicalEntityPath("agent", row.slug)}`,
    changeFrequency: "hourly",
    priority: 0.8,
    lastModified: row.updatedAt ?? new Date(),
  }));
}

export async function getSkillSitemapEntries(): Promise<SitemapEntry[]> {
  const baseUrl = getBaseUrl();
  const rows = await getSkillSitemapRows();
  return rows.map((row) => ({
    url: `${baseUrl}${getCanonicalEntityPath("skill", row.slug)}`,
    changeFrequency: "hourly",
    priority: 0.74,
    lastModified: row.updatedAt ?? new Date(),
  }));
}

export async function getMcpSitemapEntries(): Promise<SitemapEntry[]> {
  const baseUrl = getBaseUrl();
  const rows = await getMcpSitemapRows();
  return rows.map((row) => ({
    url: `${baseUrl}${getCanonicalEntityPath("mcp", row.slug)}`,
    changeFrequency: "hourly",
    priority: 0.74,
    lastModified: row.updatedAt ?? new Date(),
  }));
}

export async function getTaxonomySitemapEntries(): Promise<SitemapEntry[]> {
  const baseUrl = getBaseUrl();
  const rows = await getAgentSitemapRows();
  const protocolSet = new Set<string>();
  const sourceSet = new Set<string>();

  for (const row of rows) {
    for (const protocol of toStringArray(row.protocols)) {
      if (!protocol) continue;
      const external = protocol.toUpperCase() === "OPENCLEW" ? "openclaw" : protocol.toLowerCase();
      protocolSet.add(external);
    }
    if (typeof row.source === "string" && row.source.length > 0) {
      sourceSet.add(sourceSlugFromValue(row.source));
    }
  }

  const protocolEntries: SitemapEntry[] = [...protocolSet].slice(0, 24).map((protocol) => ({
    url: `${baseUrl}/agent/protocol/${encodeURIComponent(protocol)}`,
    changeFrequency: "daily",
    priority: 0.78,
    lastModified: new Date(),
  }));

  const sourceEntries: SitemapEntry[] = [...sourceSet].slice(0, 24).map((source) => ({
    url: `${baseUrl}/agent/source/${encodeURIComponent(source)}`,
    changeFrequency: "daily",
    priority: 0.76,
    lastModified: new Date(),
  }));

  const useCaseEntries: SitemapEntry[] = USE_CASES.map((useCase) => ({
    url: `${baseUrl}/agent/use-case/${encodeURIComponent(useCase.slug)}`,
    changeFrequency: "daily",
    priority: 0.8,
    lastModified: new Date(),
  }));

  const capabilityEntries: SitemapEntry[] = CAPABILITY_QUERIES.map((capability) => ({
    url: `${baseUrl}/search?capabilities=${encodeURIComponent(normalizeCapabilityToken(capability))}`,
    changeFrequency: "daily",
    priority: 0.86,
    lastModified: new Date(),
  }));

  const protocolSearchEntries: SitemapEntry[] = SEARCH_PROTOCOLS.map((protocol) => ({
    url: `${baseUrl}/search?protocols=${encodeURIComponent(protocol)}`,
    changeFrequency: "daily",
    priority: 0.84,
    lastModified: new Date(),
  }));

  const protocolCapabilityEntries: SitemapEntry[] = SEARCH_PROTOCOLS.flatMap((protocol) =>
    CAPABILITY_QUERIES.map((capability) => ({
      url: `${baseUrl}/search?protocols=${encodeURIComponent(protocol)}&capabilities=${encodeURIComponent(normalizeCapabilityToken(capability))}`,
      changeFrequency: "daily",
      priority: 0.88,
      lastModified: new Date(),
    }))
  );

  const topSlugs = rows
    .slice(0, 24)
    .map((row) => row.slug)
    .filter((slug): slug is string => typeof slug === "string" && slug.length > 0);
  const compareEntries: SitemapEntry[] = [];
  for (let i = 0; i < topSlugs.length; i += 1) {
    for (let j = i + 1; j < topSlugs.length; j += 1) {
      if (compareEntries.length >= 120) break;
      compareEntries.push({
        url: `${baseUrl}/agent/compare/${encodeURIComponent(`${topSlugs[i]}-vs-${topSlugs[j]}`)}`,
        changeFrequency: "weekly",
        priority: 0.65,
        lastModified: new Date(),
      });
    }
    if (compareEntries.length >= 120) break;
  }

  const [vendorPages, artifactPages] = await Promise.all([
    listPublicVendorSlugs(16),
    listPublicArtifactTypes(16),
  ]);

  const vendorEntries: SitemapEntry[] = vendorPages.map((vendor) => ({
    url: `${baseUrl}/agent/vendor/${encodeURIComponent(vendor.slug)}`,
    changeFrequency: "daily",
    priority: 0.76,
    lastModified: new Date(),
  }));

  const artifactEntries: SitemapEntry[] = artifactPages.map((artifact) => ({
    url: `${baseUrl}/agent/artifacts/${encodeURIComponent(artifact.slug)}`,
    changeFrequency: "daily",
    priority: 0.76,
    lastModified: new Date(),
  }));

  const cardEntries: SitemapEntry[] = rows.slice(0, 200).flatMap((row) => [
    {
      url: `${baseUrl}/api/v1/agents/${encodeURIComponent(row.slug)}/card`,
      changeFrequency: "daily" as const,
      priority: 0.62,
      lastModified: row.updatedAt ?? new Date(),
    },
    {
      url: `${baseUrl}/api/v1/agents/${encodeURIComponent(row.slug)}/facts`,
      changeFrequency: "daily" as const,
      priority: 0.62,
      lastModified: row.updatedAt ?? new Date(),
    },
  ]);

  return [
    ...protocolEntries,
    ...sourceEntries,
    ...useCaseEntries,
    ...vendorEntries,
    ...artifactEntries,
    ...capabilityEntries,
    ...protocolSearchEntries,
    ...protocolCapabilityEntries,
    ...compareEntries,
    ...cardEntries,
  ];
}

export async function getSitemapDescriptors(): Promise<Array<{ path: string; lastModified: Date }>> {
  let agentEntries: SitemapEntry[] = [];
  let skillEntries: SitemapEntry[] = [];
  let mcpEntries: SitemapEntry[] = [];
  try {
    [agentEntries, skillEntries, mcpEntries] = await Promise.all([
      getAgentSitemapEntries(),
      getSkillSitemapEntries(),
      getMcpSitemapEntries(),
    ]);
  } catch (error) {
    console.warn("[Sitemaps] Falling back to base sitemap descriptors", error);
  }
  const agentChunks = Math.max(1, Math.ceil(agentEntries.length / SITEMAP_AGENT_CHUNK_SIZE));
  const skillChunks = Math.max(1, Math.ceil(skillEntries.length / SITEMAP_AGENT_CHUNK_SIZE));
  const mcpChunks = Math.max(1, Math.ceil(mcpEntries.length / SITEMAP_AGENT_CHUNK_SIZE));
  const descriptors = [
    { path: "/sitemaps/core.xml", lastModified: new Date() },
    { path: "/sitemaps/taxonomy.xml", lastModified: new Date() },
  ];

  for (let index = 0; index < agentChunks; index += 1) {
    descriptors.push({
      path: `/sitemaps/agents-${index + 1}.xml`,
      lastModified: new Date(),
    });
  }
  for (let index = 0; index < skillChunks; index += 1) {
    descriptors.push({
      path: `/sitemaps/skills-${index + 1}.xml`,
      lastModified: new Date(),
    });
  }
  for (let index = 0; index < mcpChunks; index += 1) {
    descriptors.push({
      path: `/sitemaps/mcps-${index + 1}.xml`,
      lastModified: new Date(),
    });
  }

  return descriptors;
}

export function sliceAgentEntries(entries: SitemapEntry[], chunkNumber: number): SitemapEntry[] {
  const start = (chunkNumber - 1) * SITEMAP_AGENT_CHUNK_SIZE;
  return entries.slice(start, start + SITEMAP_AGENT_CHUNK_SIZE);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatLastModified(value: Date | string | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function renderUrlSet(entries: SitemapEntry[]): string {
  const body = entries
    .map((entry) => {
      const lastModified = formatLastModified(entry.lastModified);
      const parts = [
        "<url>",
        `<loc>${escapeXml(entry.url)}</loc>`,
        lastModified ? `<lastmod>${escapeXml(lastModified)}</lastmod>` : null,
        entry.changeFrequency ? `<changefreq>${entry.changeFrequency}</changefreq>` : null,
        typeof entry.priority === "number" ? `<priority>${entry.priority.toFixed(2)}</priority>` : null,
        "</url>",
      ].filter(Boolean);
      return parts.join("");
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`;
}

export function renderSitemapIndex(entries: Array<{ path: string; lastModified?: Date | string }>): string {
  const baseUrl = getBaseUrl();
  const body = entries
    .map((entry) => {
      const lastModified = formatLastModified(entry.lastModified);
      const loc = `${baseUrl}${entry.path}`;
      const parts = [
        "<sitemap>",
        `<loc>${escapeXml(loc)}</loc>`,
        lastModified ? `<lastmod>${escapeXml(lastModified)}</lastmod>` : null,
        "</sitemap>",
      ].filter(Boolean);
      return parts.join("");
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</sitemapindex>`;
}
