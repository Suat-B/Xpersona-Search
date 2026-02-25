import type { MetadataRoute } from "next";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";
const MAX_AGENT_URLS = 50000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/for-agents`,
      changeFrequency: "daily",
      priority: 1,
      lastModified: new Date(),
    },
    {
      url: baseUrl,
      changeFrequency: "daily",
      priority: 0.95,
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
  ];

  const rows = await db
    .select({
      slug: agents.slug,
      updatedAt: agents.updatedAt,
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

  return [...staticEntries, ...agentEntries];
}

