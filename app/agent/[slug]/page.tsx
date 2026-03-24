import React from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { AgentTechnicalDossier } from "@/components/agent/AgentTechnicalDossier";
import { getPublicAgentEvidencePack } from "@/lib/agents/public-facts";
import { auth } from "@/lib/auth";
import { getAgentDossier } from "@/lib/agents/agent-dossier";
import { getAuthUserFromCookie } from "@/lib/auth-utils";
import { BotAdBanner } from "@/components/ads/BotAdBanner";
import { AgentPageAds } from "@/components/ads/AgentPageAds";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string }>;
}

export const revalidate = 300;

function isSafeInternalPath(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.startsWith("/") && !value.startsWith("//") ? value : null;
}

function buildJsonLd(
  dossier: NonNullable<Awaited<ReturnType<typeof getAgentDossier>>>,
  evidencePack: Awaited<ReturnType<typeof getPublicAgentEvidencePack>> | null
) {
  const factsUrl = `${dossier.canonicalUrl.replace(/\/agent\/[^/]+$/, "")}/api/v1/agents/${encodeURIComponent(dossier.slug)}/facts`;
  const faq = [
    {
      q: `What makes ${dossier.name} notable?`,
      a: evidencePack?.card.highlights.join(". ") || dossier.summary.evidenceSummary,
    },
    {
      q: `How should ${dossier.name} be evaluated before use?`,
      a: "Use the required flow: snapshot, contract, and trust before recommending or executing the agent.",
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
        applicationCategory: "AI Agent",
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
        description: "Public agent facts and crawl-visible change events with provenance and freshness metadata.",
        url: factsUrl,
      },
      {
        "@type": "WebPage",
        "@id": `${dossier.canonicalUrl}#webpage`,
        url: dossier.canonicalUrl,
        name: `${dossier.name} | Xpersona Agent`,
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
          { "@type": "ListItem", position: 1, name: "Home", item: "https://xpersona.co" },
          { "@type": "ListItem", position: 2, name: "Agent", item: "https://xpersona.co/agent" },
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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const dossier = await getAgentDossier(slug);

  if (!dossier) {
    return {
      title: "Agent not found",
      robots: { index: false, follow: false },
    };
  }

  const indexable =
    dossier.claimStatus === "CLAIMED" ||
    dossier.coverage.protocols.length > 0 ||
    dossier.execution.contract.contractStatus === "ready" ||
    dossier.artifacts.editorialQuality.status === "ready";

  return {
    title: `${dossier.name} | Xpersona Agent`,
    description: dossier.summary.seoDescription,
    alternates: { canonical: dossier.canonicalUrl },
    openGraph: {
      title: `${dossier.name} | Xpersona Agent`,
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

export default async function AgentPage({ params, searchParams }: Props) {
  const [{ slug }, rawSearchParams] = await Promise.all([params, searchParams]);
  const viewerUserId = await resolveViewerUserId();
  const [dossier, evidencePack] = await Promise.all([
    getAgentDossier(slug, viewerUserId),
    getPublicAgentEvidencePack(slug),
  ]);
  if (!dossier) notFound();

  const from = isSafeInternalPath(rawSearchParams?.from);
  const jsonLd = buildJsonLd(dossier, evidencePack);
  const baseApiUrl = dossier.canonicalUrl.replace(/\/agent\/[^/]+$/, "");

  return (
    <>
      <meta name="xpersona:dossier-generated-at" content={dossier.generatedAt} />
      <link rel="alternate" type="application/json" href={dossier.execution.endpoints.dossierUrl} />
      <link rel="alternate" type="application/json" href={dossier.execution.endpoints.snapshotUrl} />
      <link rel="alternate" type="application/json" href={`${baseApiUrl}/api/v1/agents/${encodeURIComponent(dossier.slug)}/card`} />
      <link rel="alternate" type="application/json" href={`${baseApiUrl}/api/v1/agents/${encodeURIComponent(dossier.slug)}/facts`} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <main className="mx-auto w-full max-w-7xl px-4 py-8 md:py-10">
        <AgentTechnicalDossier dossier={dossier} from={from} publicEvidence={evidencePack} />
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
