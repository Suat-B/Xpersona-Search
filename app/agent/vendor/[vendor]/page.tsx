import React from "react";
import type { Metadata } from "next";
import { PublicAgentCollectionPage } from "@/components/agent/PublicAgentCollectionPage";
import {
  buildCollectionJsonLd,
  getAgentsByVendorSlug,
} from "@/lib/agents/public-collections";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";

function humanizeToken(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

interface Props {
  params: Promise<{ vendor: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { vendor } = await params;
  const label = humanizeToken(vendor);
  return {
    title: `${label} Agents | Xpersona`,
    description: `Public crawl-entry page for agent listings associated with ${label}.`,
    alternates: { canonical: `${baseUrl}/agent/vendor/${encodeURIComponent(vendor)}` },
    robots: { index: true, follow: true },
  };
}

export const revalidate = 300;

export default async function VendorAgentsPage({ params }: Props) {
  const { vendor } = await params;
  const label = humanizeToken(vendor);
  const agents = await getAgentsByVendorSlug(vendor, 30);
  const jsonLd = buildCollectionJsonLd({
    baseUrl,
    title: `${label} Agents`,
    description: `Public crawl-entry page for agent listings associated with ${label}.`,
    pathname: `/agent/vendor/${encodeURIComponent(vendor)}`,
    agents,
  });

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PublicAgentCollectionPage
        eyebrow="Vendor Collection"
        title={`${label} Agents`}
        description={`This page groups crawl-visible agent profiles associated with ${label}, giving licensed crawlers and human buyers an easy vendor-level entry point into the Xpersona graph.`}
        agents={agents}
        summaryPoints={[
          "Vendor pages turn scattered agent details into a crawlable company-level surface that is easier to compare and revisit.",
          "Each card is still backed by a premium dossier, but the vendor page itself stays public and indexable.",
          "Use vendor pages to advertise breadth: multiple agents, multiple protocols, one clearly attributable organization surface.",
        ]}
        links={[
          { href: "/for-agents", label: "Machine onboarding" },
          { href: "/api/v1/openapi/ai-public", label: "AI OpenAPI" },
          { href: "/agent/recent-updates", label: "Recent updates" },
        ]}
        crawlerSummary={{
          summary: `${label} Agents gives crawlers a vendor-level answer surface with attributable listings, protocol coverage, and direct paths into public validation endpoints for each profile.`,
          bestFor: `Vendor comparisons, market scans, and questions about which public agents are associated with ${label}.`,
          notIdealFor: "Private vendor diligence that depends on premium dossiers or direct commercial conversations.",
          freshness: "Vendor collections refresh as the underlying public agent profiles update.",
          evidenceSources: ["vendor taxonomy", "agent cards", "linked snapshot/contract/trust surfaces"],
        }}
      />
    </>
  );
}
