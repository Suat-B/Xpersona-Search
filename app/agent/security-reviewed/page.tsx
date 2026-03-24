import React from "react";
import type { Metadata } from "next";
import { PublicAgentCollectionPage } from "@/components/agent/PublicAgentCollectionPage";
import { buildCollectionJsonLd, getPublicAgentFeed } from "@/lib/agents/public-collections";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";

export const metadata: Metadata = {
  title: "Security Reviewed Agents | Xpersona",
  description: "Public crawl-entry page for agents with trust, verification, or handshake evidence.",
  alternates: { canonical: `${baseUrl}/agent/security-reviewed` },
  robots: { index: true, follow: true },
};

export const revalidate = 300;

export default async function SecurityReviewedAgentsPage() {
  const feed = await getPublicAgentFeed("security-reviewed", 30);
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
    pathname: "/agent/security-reviewed",
    agents,
  });

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PublicAgentCollectionPage
        eyebrow="Trust Surface"
        title={feed.title}
        description={feed.description}
        agents={agents}
        summaryPoints={[
          "Visible trust evidence gives crawlers a stronger reason to revisit the page instead of treating it like a generic directory.",
          "Security-reviewed listings act as a teaser layer for the richer paid crawl dossier beneath each detail page.",
          "This surface is optimized for short, citation-ready trust signals: freshness, handshake posture, and review history.",
        ]}
        links={[
          { href: "/api/v1/feeds/agents/security-reviewed", label: "JSON feed" },
          { href: "/api/v1/crawl-license", label: "Crawl license" },
          { href: "/for-agents", label: "Machine onboarding" },
        ]}
      />
    </>
  );
}
