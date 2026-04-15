import React from "react";
import type { Metadata } from "next";
import { AgentMinimalDossier } from "@/components/agent/AgentMinimalDossier";
import { cookies } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { AgentTechnicalDossier } from "@/components/agent/AgentTechnicalDossier";
import { CrawlerSummaryCard } from "@/components/agent/CrawlerSummaryCard";
import { getCombinedPublicAgentEvidencePack } from "@/lib/agents/public-facts";
import { auth } from "@/lib/auth";
import { getAgentDossier } from "@/lib/agents/agent-dossier";
import { getAuthUserFromCookie } from "@/lib/auth-utils";
import { BotAdBanner } from "@/components/ads/BotAdBanner";
import { AgentPageAds } from "@/components/ads/AgentPageAds";
import { getEntityBasePath, getEntityLabel, type PublicEntityType } from "@/lib/entities/public-entities";

function isSafeInternalPath(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.startsWith("/") && !value.startsWith("//") ? value : null;
}

function getEntitySeoLabel(entityType: PublicEntityType): string {
  switch (entityType) {
    case "agent":
      return "AI Agent";
    case "skill":
      return "AI Skill";
    case "mcp":
      return "MCP Server";
  }
}

function buildJsonLd(
  dossier: NonNullable<Awaited<ReturnType<typeof getAgentDossier>>>,
  evidencePack: Awaited<ReturnType<typeof getCombinedPublicAgentEvidencePack>> | null
) {
  const baseUrl = new URL(dossier.canonicalUrl).origin;
  const entityLabel = getEntityLabel(dossier.entityType);
  const factsUrl = `${baseUrl}/api/v1/agents/${encodeURIComponent(dossier.slug)}/facts`;
  const faq = [
    {
      q: `What makes ${dossier.name} notable?`,
      a: evidencePack?.card.highlights.join(". ") || dossier.summary.evidenceSummary,
    },
    {
      q: `How should ${dossier.name} be evaluated before use?`,
      a: `Use the required flow: snapshot, contract, and trust before recommending or executing this ${entityLabel.toLowerCase()}.`,
    },
    {
      q: `What kind of evidence is visible on this page?`,
      a: "This page surfaces public facts, change history, trust indicators, artifact evidence, and benchmark summaries with provenance.",
    },
  ];

  const videos = dossier.media.assets
    .filter((asset) => /youtube|youtu\.be|vimeo|loom/i.test(asset.url))
    .slice(0, 2)
    .map((asset) => ({
      "@type": "VideoObject",
      name: asset.title ?? `${dossier.name} video`,
      description: asset.caption ?? asset.altText ?? `${dossier.name} demo video`,
      contentUrl: asset.url,
      uploadDate: dossier.release.lastUpdatedAt ?? dossier.generatedAt,
    }));

  const images = [
    ...(dossier.media.primaryImageUrl
      ? [
          {
            "@type": "ImageObject",
            name: `${dossier.name} preview`,
            contentUrl: dossier.media.primaryImageUrl,
          },
        ]
      : []),
    ...dossier.media.assets
      .filter((asset) => !/youtube|youtu\.be|vimeo|loom/i.test(asset.url))
      .slice(0, 2)
      .map((asset) => ({
        "@type": "ImageObject",
        name: asset.title ?? `${dossier.name} asset`,
        contentUrl: asset.url,
      })),
  ];

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        "@id": `${dossier.canonicalUrl}#software`,
        name: dossier.name,
        description: dossier.summary.seoDescription,
        applicationCategory: getEntitySeoLabel(dossier.entityType),
        operatingSystem: "Web",
        url: dossier.canonicalUrl,
        sameAs: dossier.summary.sourceUrl,
      },
      {
        "@type": "SoftwareSourceCode",
        "@id": `${dossier.canonicalUrl}#source`,
        name: `${dossier.name} source`,
        codeRepository: dossier.summary.sourceUrl,
        url: dossier.summary.sourceUrl,
      },
      {
        "@type": "Dataset",
        "@id": `${dossier.canonicalUrl}#facts`,
        name: `${dossier.name} public evidence facts`,
        description: `Public ${entityLabel.toLowerCase()} facts and crawl-visible change events with provenance and freshness metadata.`,
        url: factsUrl,
      },
      {
        "@type": "WebPage",
        "@id": `${dossier.canonicalUrl}#webpage`,
        url: dossier.canonicalUrl,
        name: `${dossier.name} | Xpersona ${entityLabel}`,
        description: dossier.summary.seoDescription,
        dateModified: dossier.release.lastUpdatedAt ?? dossier.generatedAt,
      },
      {
        "@type": "FAQPage",
        mainEntity: faq.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.a,
          },
        })),
      },
      {
        "@type": "HowTo",
        name: `How to evaluate ${dossier.name}`,
        step: dossier.execution.setupSteps.slice(0, 4).map((step) => ({
          "@type": "HowToStep",
          name: step,
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: baseUrl },
          {
            "@type": "ListItem",
            position: 2,
            name: entityLabel,
            item: `${baseUrl}${getEntityBasePath(dossier.entityType)}`,
          },
          { "@type": "ListItem", position: 3, name: dossier.name, item: dossier.canonicalUrl },
        ],
      },
      ...videos,
      ...images,
    ],
  };
}

async function resolveViewerUserId() {
  let session = null;
  try {
    session = await auth();
  } catch {}
  let viewerUserId = session?.user?.id ?? null;
  if (!viewerUserId) {
    try {
      const cookieStore = await cookies();
      viewerUserId = getAuthUserFromCookie(cookieStore);
    } catch {}
  }
  return viewerUserId ?? null;
}

function buildRedirectTarget(canonicalPath: string, rawFrom?: string | null): string {
  const from = isSafeInternalPath(rawFrom);
  if (!from) return canonicalPath;
  return `${canonicalPath}?from=${encodeURIComponent(from)}`;
}

export async function generatePublicEntityMetadata(
  slug: string,
  expectedEntityType: PublicEntityType
): Promise<Metadata> {
  const dossier = await getAgentDossier(slug);

  if (!dossier) {
    return {
      title: `${getEntityLabel(expectedEntityType)} not found`,
      robots: { index: false, follow: false },
    };
  }

  if (dossier.entityType !== expectedEntityType) {
    return {
      title: `${dossier.name} | Xpersona ${getEntityLabel(dossier.entityType)}`,
      description: dossier.summary.seoDescription,
      alternates: { canonical: dossier.canonicalUrl },
      robots: { index: false, follow: true },
    };
  }

  const indexable =
    dossier.claimStatus === "CLAIMED" ||
    dossier.coverage.protocols.length > 0 ||
    dossier.execution.contract.contractStatus === "ready" ||
    dossier.artifacts.editorialQuality.status === "ready";

  return {
    title: `${dossier.name} | Xpersona ${getEntityLabel(dossier.entityType)}`,
    description: dossier.summary.seoDescription,
    alternates: { canonical: dossier.canonicalUrl },
    openGraph: {
      title: `${dossier.name} | Xpersona ${getEntityLabel(dossier.entityType)}`,
      description: dossier.summary.seoDescription,
      url: dossier.canonicalUrl,
      siteName: "Xpersona",
      type: "website",
    },
    robots: {
      index: indexable,
      follow: true,
    },
  };
}

export async function renderPublicEntityPage(input: {
  slug: string;
  rawFrom?: string | null;
  expectedEntityType: PublicEntityType;
}) {
  const viewerUserId = await resolveViewerUserId();
  const [dossier, evidencePack] = await Promise.all([
    getAgentDossier(input.slug, viewerUserId),
    getCombinedPublicAgentEvidencePack(input.slug),
  ]);
  if (!dossier) notFound();
  if (dossier.entityType !== input.expectedEntityType) {
    permanentRedirect(buildRedirectTarget(dossier.canonicalPath, input.rawFrom));
  }

  const from = isSafeInternalPath(input.rawFrom);
  const jsonLd = buildJsonLd(dossier, evidencePack);
  const baseApiUrl = new URL(dossier.canonicalUrl).origin;
  const isAgentEntity = dossier.entityType === "agent";
  const freshness =
    dossier.release.lastVerifiedAt ??
    dossier.release.lastCrawledAt ??
    dossier.release.lastUpdatedAt ??
    dossier.generatedAt;
  const summaryText = [dossier.summary.description, dossier.summary.evidenceSummary]
    .filter(Boolean)
    .join(" ");
  const bestFor =
    dossier.reliability.decisionGuardrails.safeUseWhen[0] ??
    `${dossier.name} is best for ${dossier.coverage.capabilities.slice(0, 3).map((item) => item.label).join(", ") || "general automation"} workflows where ${dossier.coverage.protocols.slice(0, 2).map((item) => item.label).join(" and ") || "documented"} compatibility matters.`;
  const notIdealFor =
    dossier.reliability.decisionGuardrails.doNotUseIf[0] ??
    `${dossier.name} is not ideal for teams that need stronger public trust telemetry, lower setup complexity, or more explicit contract coverage before production rollout.`;
  const evidenceSources = [
    dossier.summary.evidence.source,
    dossier.execution.evidence.source,
    dossier.reliability.evidence.source,
    evidencePack ? "public facts pack" : null,
  ].filter((value): value is string => Boolean(value));

  return (
    <>
      <meta name="xpersona:dossier-generated-at" content={dossier.generatedAt} />
      <link rel="alternate" type="application/json" href={dossier.execution.endpoints.dossierUrl} />
      <link rel="alternate" type="application/json" href={dossier.execution.endpoints.snapshotUrl} />
      <link rel="alternate" type="application/json" href={`${baseApiUrl}/api/v1/agents/${encodeURIComponent(dossier.slug)}/card`} />
      <link rel="alternate" type="application/json" href={`${baseApiUrl}/api/v1/agents/${encodeURIComponent(dossier.slug)}/facts`} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <main className="mx-auto w-full max-w-7xl px-4 py-8 md:py-10">
        {isAgentEntity ? (
          <AgentMinimalDossier dossier={dossier} from={from} publicEvidence={evidencePack} />
        ) : (
          <>
            <CrawlerSummaryCard
              eyebrow="Crawler Summary"
              title={`${dossier.name} answer-first brief`}
              summary={summaryText}
              bestFor={bestFor}
              notIdealFor={notIdealFor}
              freshness={`Last checked ${new Date(freshness).toLocaleDateString("en-US")}`}
              evidenceSources={evidenceSources}
              links={[
                { href: `/api/v1/agents/${encodeURIComponent(dossier.slug)}/card`, label: "Card" },
                { href: `/api/v1/agents/${encodeURIComponent(dossier.slug)}/facts`, label: "Facts" },
                { href: `/api/v1/agents/${encodeURIComponent(dossier.slug)}/snapshot`, label: "Snapshot" },
                { href: `/api/v1/agents/${encodeURIComponent(dossier.slug)}/contract`, label: "Contract" },
                { href: `/api/v1/agents/${encodeURIComponent(dossier.slug)}/trust`, label: "Trust" },
              ]}
            />

            <div className="mt-6">
              <AgentTechnicalDossier dossier={dossier} from={from} publicEvidence={evidencePack} />
            </div>
          </>
        )}
      </main>

      <AgentPageAds
        agentName={dossier.name}
        agentSlug={dossier.slug}
        agentCategory={dossier.source}
      />

      <BotAdBanner
        className="mx-auto w-full max-w-7xl px-4 pb-8"
        botAdCount={2}
      />
    </>
  );
}
