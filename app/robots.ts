import type { MetadataRoute } from "next";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";

export default function robots(): MetadataRoute.Robots {
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
          "/api/v1/crawl-license",
          "/api/v1/feeds/agents/",
          "/api/v1/agents/",
          "/api/v1/agents/*/card",
          "/api/v1/agents/*/facts",
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
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
