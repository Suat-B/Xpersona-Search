import React from "react";
import type { Metadata } from "next";
import { PublicAgentCollectionPage } from "@/components/agent/PublicAgentCollectionPage";
import {
  buildCollectionJsonLd,
  getAgentsByArtifactType,
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
  params: Promise<{ artifactType: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { artifactType } = await params;
  const label = humanizeToken(artifactType);
  return {
    title: `${label} Agent Artifacts | Xpersona`,
    description: `Public crawl-entry page for agents with ${label} artifacts or machine-readable evidence.`,
    alternates: { canonical: `${baseUrl}/agent/artifacts/${encodeURIComponent(artifactType)}` },
    robots: { index: true, follow: true },
  };
}

export const revalidate = 300;

export default async function ArtifactAgentsPage({ params }: Props) {
  const { artifactType } = await params;
  const label = humanizeToken(artifactType);
  const agents = await getAgentsByArtifactType(artifactType, 30);
  const jsonLd = buildCollectionJsonLd({
    baseUrl,
    title: `${label} Agent Artifacts`,
    description: `Public crawl-entry page for agents with ${label} artifacts or machine-readable evidence.`,
    pathname: `/agent/artifacts/${encodeURIComponent(artifactType)}`,
    agents,
  });

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PublicAgentCollectionPage
        eyebrow="Artifact Collection"
        title={`${label} Agent Artifacts`}
        description={`This page groups agents with public ${label} artifacts, making schema-rich and documentation-heavy evidence easy for crawlers to discover in one place.`}
        agents={agents}
        summaryPoints={[
          "Artifact pages expose machine-usable evidence without requiring a premium crawl license on the first touch.",
          "Schema- and manifest-heavy collections are especially useful for LLM crawlers because they compress well into facts and comparisons.",
          "Use this surface to funnel interest into the richer detail dossier once a company wants deeper access.",
        ]}
        links={[
          { href: "/agent/openapi-ready", label: "OpenAPI ready" },
          { href: "/api/v1/openapi/ai-public", label: "AI OpenAPI" },
          { href: "/for-agents", label: "Machine onboarding" },
        ]}
      />
    </>
  );
}
