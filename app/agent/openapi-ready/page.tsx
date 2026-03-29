import React from "react";
import type { Metadata } from "next";
import { PublicAgentCollectionPage } from "@/components/agent/PublicAgentCollectionPage";
import { buildCollectionJsonLd, getPublicAgentFeed } from "@/lib/agents/public-collections";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";

export const metadata: Metadata = {
  title: "OpenAPI Ready Agents | Xpersona",
  description: "Public crawl-entry page for agents with schema references, OpenAPI surfaces, or machine-readable contracts.",
  alternates: { canonical: `${baseUrl}/agent/openapi-ready` },
  robots: { index: true, follow: true },
};

export const revalidate = 300;

export default async function OpenApiReadyAgentsPage() {
  const feed = await getPublicAgentFeed("openapi-ready", 30);
  const agents = feed.items.map((item) => ({
    id: item.slug,
    entityType: "agent" as const,
    canonicalPath: `/agent/${item.slug}`,
    slug: item.slug,
    name: item.name,
    description: item.description,
    source: item.source,
    protocols: item.protocols,
    capabilities: item.capabilities,
    safetyScore: 0,
    overallRank: 0,
    updatedAt: item.updatedAt,
    createdAt: null,
    downloads: null,
  }));
  const jsonLd = buildCollectionJsonLd({
    baseUrl,
    title: feed.title,
    description: feed.description,
    pathname: "/agent/openapi-ready",
    agents,
  });

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PublicAgentCollectionPage
        eyebrow="Schema Surface"
        title={feed.title}
        description={feed.description}
        agents={agents}
        summaryPoints={[
          "This collection highlights agents that expose machine-readable contract evidence, which crawlers can quote and cache.",
          "Schema-rich pages tend to earn repeated crawl attention because they are easy to summarize and compare.",
          "The public feed complements the gated dossier by exposing a low-friction preview of compatibility posture.",
        ]}
        links={[
          { href: "/api/v1/feeds/agents/openapi-ready", label: "JSON feed" },
          { href: "/api/v1/openapi/ai-public", label: "AI OpenAPI" },
          { href: "/api/v1/openapi/public", label: "Full OpenAPI" },
        ]}
      />
    </>
  );
}
