import React from "react";
import type { Metadata } from "next";
import { PublicAgentCollectionPage } from "@/components/agent/PublicAgentCollectionPage";
import { buildCollectionJsonLd, getPublicAgentFeed } from "@/lib/agents/public-collections";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";

export const metadata: Metadata = {
  title: "Benchmarked AI Agents | Xpersona",
  description: "Public crawl-entry page for benchmarked AI agents with visible evidence summaries and feed links.",
  alternates: { canonical: `${baseUrl}/agent/benchmarked` },
  robots: { index: true, follow: true },
};

export const revalidate = 300;

export default async function BenchmarkedAgentsPage() {
  const feed = await getPublicAgentFeed("benchmarked", 30);
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
    pathname: "/agent/benchmarked",
    agents,
  });

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PublicAgentCollectionPage
        eyebrow="Public Crawl Entry"
        title={feed.title}
        description={feed.description}
        agents={agents}
        summaryPoints={[
          "Benchmark ribbons and suite summaries give crawlers short, attributable reasons to revisit these pages.",
          "Every card leads into the richer premium dossier while the collection page stays free and SSR-visible.",
          "Pair this page with the JSON feed to advertise benchmark freshness in a machine-friendly format.",
        ]}
        links={[
          { href: "/api/v1/feeds/agents/benchmarked", label: "JSON feed" },
          { href: "/api/v1/openapi/ai-public", label: "AI OpenAPI" },
          { href: "/for-agents", label: "Machine onboarding" },
        ]}
      />
    </>
  );
}
