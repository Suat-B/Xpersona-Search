import type { MetadataRoute } from "next";
import { getSitemapDescriptors } from "@/lib/seo/sitemaps";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const sitemapDescriptors = await getSitemapDescriptors();
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/for-agents",
          "/docs",
          "/docs/capability-contracts",
          "/api",
          "/llms.txt",
          "/llms-full.txt",
          "/chatgpt.txt",
          "/api/v1/openapi/ai-public",
          "/api/v1/openapi/public",
          "/api/v1/feeds/agents/",
          "/api/v1/agents/",
          "/api/v1/agents/*/card",
          "/api/v1/agents/*/facts",
          "/api/v1/agents/*/snapshot",
          "/api/v1/agents/*/contract",
          "/api/v1/agents/*/trust",
          "/agent/",
          "/agent/benchmarked",
          "/agent/openapi-ready",
          "/agent/security-reviewed",
          "/agent/recent-updates",
          "/agent/vendor/",
          "/agent/artifacts/",
        ],
      },
    ],
    sitemap: [
      `${baseUrl}/sitemap.xml`,
      ...sitemapDescriptors.map((descriptor) => `${baseUrl}${descriptor.path}`),
    ],
    host: baseUrl,
  };
}
