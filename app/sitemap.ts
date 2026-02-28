import type { MetadataRoute } from "next";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { USE_CASES, sourceSlugFromValue } from "@/lib/agents/hub-data";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";
const MAX_AGENT_URLS = 50000;
const MAX_COMPARE_URLS = 120;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      changeFrequency: "daily",
      priority: 0.95,
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

  return [
    ...staticEntries,
    ...agentEntries,
    ...protocolEntries,
    ...sourceEntries,
    ...useCaseEntries,
    ...compareEntries,
  ];
}

