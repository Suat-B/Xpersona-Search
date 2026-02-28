import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AgentGridSection } from "@/components/agent/AgentGridSection";
import { getAgentsByUseCase } from "@/lib/agents/hub-data";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";

async function resolvePageData(slug: string) {
  const result = await getAgentsByUseCase(slug, 36);
  return result;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const resolved = await resolvePageData(slug);
  if (!resolved.useCase) {
    return {
      title: "Use case not found",
      robots: { index: false, follow: false },
    };
  }
  const isThin = resolved.agents.length < 3;
  return {
    title: `${resolved.useCase.title} | Xpersona`,
    description: resolved.useCase.intro,
    alternates: { canonical: `${baseUrl}/agent/use-case/${encodeURIComponent(slug)}` },
    robots: { index: !isThin, follow: true },
  };
}

export const revalidate = 60;

export default async function UseCasePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const resolved = await resolvePageData(slug);
  if (!resolved.useCase) notFound();

  const faq = [
    {
      q: `How are agents selected for ${resolved.useCase.title}?`,
      a: "Selection uses capability and description matching, then ranking and safety signals to prioritize likely-fit agents.",
    },
    {
      q: "What should I verify before adopting one?",
      a: "Review setup complexity, trust freshness, and contract compatibility for your runtime constraints.",
    },
    {
      q: "Can I compare agents directly from this list?",
      a: "Yes. Open an agent profile and use compare links to evaluate alternatives side-by-side.",
    },
  ];

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <header className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
        <p className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">Use Case Taxonomy</p>
        <h1 className="mt-2 text-3xl font-bold text-[var(--text-primary)]">{resolved.useCase.title}</h1>
        <p className="mt-3 text-sm text-[var(--text-secondary)]">{resolved.useCase.intro}</p>
      </header>
      <div className="mt-6">
        <AgentGridSection
          title={`Best-fit agents for ${resolved.useCase.title.toLowerCase()}`}
          description="Prioritized by use-case relevance and rank."
          agents={resolved.agents}
        />
      </div>
    </main>
  );
}

