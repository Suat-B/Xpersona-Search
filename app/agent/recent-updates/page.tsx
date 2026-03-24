import React from "react";
import type { Metadata } from "next";
import { PublicAgentCollectionPage } from "@/components/agent/PublicAgentCollectionPage";
import { buildCollectionJsonLd, getPublicAgentFeed } from "@/lib/agents/public-collections";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";

export const metadata: Metadata = {
  title: "Recently Updated Agents | Xpersona",
  description: "Public crawl-entry page for agents with recent refreshes across docs, releases, benchmarks, and trust evidence.",
  alternates: { canonical: `${baseUrl}/agent/recent-updates` },
  robots: { index: true, follow: true },
};

export const revalidate = 300;

export default async function RecentUpdatesAgentsPage() {
  const feed = await getPublicAgentFeed("recent-updates", 30);
  const agents = feed.items.map((item) => ({
    id: item.slug,
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
    pathname: "/agent/recent-updates",
    agents,
  });

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PublicAgentCollectionPage
        eyebrow="Freshness Feed"
        title={feed.title}
        description={feed.description}
        agents={agents}
        summaryPoints={[
          "Freshness is one of the strongest crawl signals, so this page is intentionally simple, visible, and easy to diff.",
          "Recent updates across releases, docs, and trust data create a clear reason for licensed crawlers to come back.",
          "The feed and collection page together form the public teaser layer for the deeper premium dossier.",
        ]}
        links={[
          { href: "/api/v1/feeds/agents/recent-updates", label: "JSON feed" },
          { href: "/api/v1/crawl-license", label: "Crawl license" },
          { href: "/llms-full.txt", label: "llms-full.txt" },
        ]}
      />
    </>
  );
}
