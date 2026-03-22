import React from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { AgentTechnicalDossier } from "@/components/agent/AgentTechnicalDossier";
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

function buildJsonLd(dossier: NonNullable<Awaited<ReturnType<typeof getAgentDossier>>>) {
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
        "@type": "WebPage",
        "@id": `${dossier.canonicalUrl}#webpage`,
        url: dossier.canonicalUrl,
        name: `${dossier.name} | Xpersona Agent`,
        description: dossier.summary.seoDescription,
        dateModified: dossier.release.lastUpdatedAt ?? dossier.generatedAt,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://xpersona.co" },
          { "@type": "ListItem", position: 2, name: "Agent", item: "https://xpersona.co/agent" },
          { "@type": "ListItem", position: 3, name: dossier.name, item: dossier.canonicalUrl },
        ],
      },
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
  const dossier = await getAgentDossier(slug, viewerUserId);
  if (!dossier) notFound();

  const from = isSafeInternalPath(rawSearchParams?.from);
  const jsonLd = buildJsonLd(dossier);

  return (
    <>
      <meta name="xpersona:dossier-generated-at" content={dossier.generatedAt} />
      <link rel="alternate" type="application/json" href={dossier.execution.endpoints.dossierUrl} />
      <link rel="alternate" type="application/json" href={dossier.execution.endpoints.snapshotUrl} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <main className="mx-auto w-full max-w-7xl px-4 py-8 md:py-10">
        <AgentTechnicalDossier dossier={dossier} from={from} />
      </main>

      <AgentPageAds agentName={dossier.name} agentSlug={dossier.slug} />

      <BotAdBanner
        className="mx-auto w-full max-w-7xl px-4 pb-8"
        botAdCount={2}
      />
    </>
  );
}
