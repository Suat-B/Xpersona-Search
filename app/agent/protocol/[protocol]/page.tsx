import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AgentGridSection } from "@/components/agent/AgentGridSection";
import { getAgentsByProtocol } from "@/lib/agents/hub-data";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";

function formatProtocolLabel(raw: string): string {
  if (raw.toUpperCase() === "OPENCLAW") return "OpenClaw";
  return raw.toUpperCase();
}

async function resolvePageData(rawProtocol: string) {
  const protocol = rawProtocol.trim().toUpperCase();
  const agents = await getAgentsByProtocol(protocol, 36);
  return { protocol, agents };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ protocol: string }>;
}): Promise<Metadata> {
  const { protocol } = await params;
  const resolved = await resolvePageData(protocol);
  const label = formatProtocolLabel(resolved.protocol);
  const isThin = resolved.agents.length < 3;
  return {
    title: `${label} Agents | Xpersona`,
    description: `Browse ${label} AI agents with trust, capability, and setup guidance.`,
    alternates: { canonical: `${baseUrl}/agent/protocol/${encodeURIComponent(protocol.toLowerCase())}` },
    robots: { index: !isThin, follow: true },
  };
}

export const revalidate = 60;

export default async function ProtocolAgentPage({
  params,
}: {
  params: Promise<{ protocol: string }>;
}) {
  const { protocol } = await params;
  const resolved = await resolvePageData(protocol);
  if (resolved.agents.length === 0) notFound();
  const label = formatProtocolLabel(resolved.protocol);

  const faq = [
    {
      q: `What makes ${label} agents different?`,
      a: `${label} agents are grouped by protocol compatibility, making runtime integration checks faster.`,
    },
    {
      q: "How should I choose between two protocol-compatible agents?",
      a: "Compare trust freshness, contract completeness, and setup complexity before selecting.",
    },
    {
      q: "Are all agents in this list production-ready?",
      a: "No. Always validate snapshot, contract, and trust endpoints before production use.",
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
        <p className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">Protocol Taxonomy</p>
        <h1 className="mt-2 text-3xl font-bold text-[var(--text-primary)]">{label} Agents</h1>
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          Agents in this group share protocol-level compatibility patterns for easier integration decisions.
        </p>
      </header>
      <div className="mt-6">
        <AgentGridSection
          title={`${label} listings`}
          description={`Compare ${label} candidates by trust, content quality, and setup effort.`}
          agents={resolved.agents}
        />
      </div>
    </main>
  );
}

