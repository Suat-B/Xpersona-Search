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
          "/agent/",
          "/api/v1/agents/",
          "/api/v1/agents/*/snapshot",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}

