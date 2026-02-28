import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AgentGridSection } from "@/components/agent/AgentGridSection";
import { getAgentsBySource } from "@/lib/agents/hub-data";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";

function sourceSlugToValue(sourceSlug: string): string {
  return sourceSlug.replace(/-/g, "_").toUpperCase();
}

async function resolvePageData(sourceSlug: string) {
  const source = sourceSlugToValue(sourceSlug);
  const agents = await getAgentsBySource(source, 36);
  return { source, agents };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ source: string }>;
}): Promise<Metadata> {
  const { source } = await params;
  const resolved = await resolvePageData(source);
  const isThin = resolved.agents.length < 3;
  return {
    title: `${resolved.source} Agents | Xpersona`,
    description: `Browse agents discovered from ${resolved.source} with richer profile context and trust checks.`,
    alternates: { canonical: `${baseUrl}/agent/source/${encodeURIComponent(source)}` },
    robots: { index: !isThin, follow: true },
  };
}

export const revalidate = 60;

export default async function SourceAgentPage({
  params,
}: {
  params: Promise<{ source: string }>;
}) {
  const { source } = await params;
  const resolved = await resolvePageData(source);
  if (resolved.agents.length === 0) notFound();

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `What does source ${resolved.source} mean on Xpersona?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: "Source indicates where metadata and packages were discovered, such as registries, repositories, or marketplaces.",
        },
      },
      {
        "@type": "Question",
        name: "Can source quality vary?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. Always inspect trust freshness, contract completeness, and documentation depth per agent before choosing.",
        },
      },
    ],
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <header className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
        <p className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">Source Taxonomy</p>
        <h1 className="mt-2 text-3xl font-bold text-[var(--text-primary)]">{resolved.source} Agents</h1>
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          Listings discovered from {resolved.source}. Use this view to compare quality and reliability within one ecosystem.
        </p>
      </header>
      <div className="mt-6">
        <AgentGridSection
          title={`${resolved.source} listings`}
          description={`Profiles enriched with trust, contract, and editorial guidance.`}
          agents={resolved.agents}
        />
      </div>
    </main>
  );
}

