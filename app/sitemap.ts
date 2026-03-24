import type { MetadataRoute } from "next";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { USE_CASES, sourceSlugFromValue } from "@/lib/agents/hub-data";
import { listPublicArtifactTypes, listPublicVendorSlugs } from "@/lib/agents/public-collections";
import { normalizeCapabilityToken } from "@/lib/search/capability-tokens";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";
const MAX_AGENT_URLS = 50000;
const MAX_COMPARE_URLS = 120;
const CAPABILITY_QUERIES = ["PDF", "Research", "Web browsing", "Codegen", "Voice"] as const;
const SEARCH_PROTOCOLS = ["MCP", "A2A", "ANP", "OPENCLEW"] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
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
      url: `${baseUrl}/agent`,
      changeFrequency: "daily",
      priority: 0.95,
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
      url: `${baseUrl}/api/v1/crawl-license`,
      changeFrequency: "daily",
      priority: 0.92,
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

  const rows = await db
    .select({
      slug: agents.slug,
      updatedAt: agents.updatedAt,
      protocols: agents.protocols,
      source: agents.source,
    })
    .from(agents)
    .where(and(eq(agents.status, "ACTIVE"), eq(agents.publicSearchable, true)))
    .limit(MAX_AGENT_URLS);

  const agentEntries: MetadataRoute.Sitemap = rows.map((row) => ({
    url: `${baseUrl}/agent/${encodeURIComponent(row.slug)}`,
    changeFrequency: "hourly",
    priority: 0.8,
    lastModified: row.updatedAt ?? new Date(),
  }));

  const protocolSet = new Set<string>();
  const sourceSet = new Set<string>();
  for (const row of rows) {
    const protocolList = Array.isArray(row.protocols) ? row.protocols : [];
    for (const protocol of protocolList) {
      if (typeof protocol !== "string" || protocol.length === 0) continue;
      const external = protocol.toUpperCase() === "OPENCLEW" ? "openclaw" : protocol.toLowerCase();
      protocolSet.add(external);
    }
    if (typeof row.source === "string" && row.source.length > 0) {
      sourceSet.add(sourceSlugFromValue(row.source));
    }
  }

  const protocolEntries: MetadataRoute.Sitemap = [...protocolSet].slice(0, 24).map((protocol) => ({
    url: `${baseUrl}/agent/protocol/${encodeURIComponent(protocol)}`,
    changeFrequency: "daily",
    priority: 0.78,
    lastModified: new Date(),
  }));

  const sourceEntries: MetadataRoute.Sitemap = [...sourceSet].slice(0, 24).map((source) => ({
    url: `${baseUrl}/agent/source/${encodeURIComponent(source)}`,
    changeFrequency: "daily",
    priority: 0.76,
    lastModified: new Date(),
  }));

  const useCaseEntries: MetadataRoute.Sitemap = USE_CASES.map((useCase) => ({
    url: `${baseUrl}/agent/use-case/${encodeURIComponent(useCase.slug)}`,
    changeFrequency: "daily",
    priority: 0.8,
    lastModified: new Date(),
  }));

  const capabilityEntries: MetadataRoute.Sitemap = CAPABILITY_QUERIES.map((capability) => ({
    url: `${baseUrl}/search?capabilities=${encodeURIComponent(normalizeCapabilityToken(capability))}`,
    changeFrequency: "daily",
    priority: 0.86,
    lastModified: new Date(),
  }));

  const protocolSearchEntries: MetadataRoute.Sitemap = SEARCH_PROTOCOLS.map((protocol) => ({
    url: `${baseUrl}/search?protocols=${encodeURIComponent(protocol)}`,
    changeFrequency: "daily",
    priority: 0.84,
    lastModified: new Date(),
  }));

  const protocolCapabilityEntries: MetadataRoute.Sitemap = SEARCH_PROTOCOLS.flatMap((protocol) =>
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
  const compareEntries: MetadataRoute.Sitemap = [];
  for (let i = 0; i < topSlugs.length; i += 1) {
    for (let j = i + 1; j < topSlugs.length; j += 1) {
      if (compareEntries.length >= MAX_COMPARE_URLS) break;
      compareEntries.push({
        url: `${baseUrl}/agent/compare/${encodeURIComponent(`${topSlugs[i]}-vs-${topSlugs[j]}`)}`,
        changeFrequency: "weekly",
        priority: 0.65,
        lastModified: new Date(),
      });
    }
    if (compareEntries.length >= MAX_COMPARE_URLS) break;
  }

  const [vendorPages, artifactPages] = await Promise.all([
    listPublicVendorSlugs(16),
    listPublicArtifactTypes(16),
  ]);

  const vendorEntries: MetadataRoute.Sitemap = vendorPages.map((vendor) => ({
    url: `${baseUrl}/agent/vendor/${encodeURIComponent(vendor.slug)}`,
    changeFrequency: "daily",
    priority: 0.76,
    lastModified: new Date(),
  }));

  const artifactEntries: MetadataRoute.Sitemap = artifactPages.map((artifact) => ({
    url: `${baseUrl}/agent/artifacts/${encodeURIComponent(artifact.slug)}`,
    changeFrequency: "daily",
    priority: 0.76,
    lastModified: new Date(),
  }));

  const cardEntries: MetadataRoute.Sitemap = rows.slice(0, 200).flatMap((row) => [
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
    ...staticEntries,
    ...agentEntries,
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

