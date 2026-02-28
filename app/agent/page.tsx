import type { Metadata } from "next";
import Link from "next/link";
import { AgentGridSection } from "@/components/agent/AgentGridSection";
import { getHubOverview, sourceSlugFromValue } from "@/lib/agents/hub-data";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";
const PLAYBOOKS = [
  {
    title: "Research synthesis agents",
    intro:
      "Prioritize agents with strong source links, transparent citations, and fresh verification checks.",
    href: "/agent/use-case/research-assistant-agents",
  },
  {
    title: "Developer automation agents",
    intro:
      "Look for protocol compatibility, fast execution telemetry, and documented tool permissions.",
    href: "/agent/use-case/developer-automation-agents",
  },
  {
    title: "Support automation agents",
    intro:
      "Value clear safety posture, trusted data sources, and proven reliability in production.",
    href: "/agent/use-case/support-automation-agents",
  },
  {
    title: "Content creation agents",
    intro:
      "Choose agents with editorial content, consistent outputs, and well-defined integrations.",
    href: "/agent/use-case/content-creation-agents",
  },
];

export const metadata: Metadata = {
  title: "AI Agent Directory | Xpersona",
  description:
    "Browse the Xpersona AI agent directory by trending agents, newest launches, protocol, source, and real use cases.",
  alternates: { canonical: `${baseUrl}/agent` },
  robots: { index: true, follow: true },
};

export const revalidate = 60;

export default async function AgentHubPage() {
  const overview = await getHubOverview();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Xpersona Agent Directory",
    url: `${baseUrl}/agent`,
    description: "Searchable AI agent hub with protocol, source, and use-case navigation.",
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${baseUrl}` },
        { "@type": "ListItem", position: 2, name: "Agent", item: `${baseUrl}/agent` },
      ],
    },
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
        <p className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">Agent Directory</p>
        <h1 className="mt-2 text-3xl font-bold text-[var(--text-primary)]">Discover AI Agents By Intent</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">
          This hub organizes agent profiles by protocol, source, and use case. Each agent profile includes trust,
          contract, and snapshot links plus editorial guidance to make selection safer and faster.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <Link className="text-[var(--accent-heart)] hover:underline" href="/agent/trending">Trending</Link>
          <Link className="text-[var(--accent-heart)] hover:underline" href="/agent/new">New</Link>
          <Link className="text-[var(--accent-heart)] hover:underline" href="/agent/most-downloaded">Most downloaded</Link>
        </div>
      </header>

      <div className="mt-6 space-y-6">
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">How to evaluate agents</h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed">
            Xpersona helps you move from discovery to safe execution by pairing agent listings with verification
            metadata. Focus on a mix of fit, trust, and execution readiness so your shortlists are reliable, not just
            popular.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-[var(--text-secondary)]">
            <li>Match by protocol so the integration contract is compatible with your stack.</li>
            <li>Check trust freshness and handshake status to reduce unknown risk.</li>
            <li>Prefer agents with editorial notes, FAQs, or playbooks for faster onboarding.</li>
            <li>Balance popularity with safety score and recent verification data.</li>
          </ul>
          <p className="mt-3 text-sm text-[var(--text-secondary)] leading-relaxed">
            Use the sections below to compare agents by momentum, freshness, and use case, then click into each profile
            for full trust details.
          </p>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">Trust and verification methodology</h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed">
            Verification tiers highlight ownership signals, while handshake status and freshness reveal how recently an
            agent was confirmed. Reputation and content quality scores help you compare reliability across similar
            options. Treat these signals as decision inputs, not just labels.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Verification tier</h3>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Higher tiers indicate stronger ownership evidence and lower identity risk.
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Handshake freshness</h3>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Recent verification means the agent is actively maintained and observed.
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Content quality</h3>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Editorial coverage, FAQs, and playbooks reduce setup time and ambiguity.
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Safety signals</h3>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Safety scores reflect policy alignment and help manage execution risk.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">Selection playbooks</h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Start with a playbook to shortlist agents that match your execution goals and trust requirements.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {PLAYBOOKS.map((item) => (
              <Link
                key={item.title}
                href={item.href}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 hover:border-[var(--accent-heart)]/40"
              >
                <h3 className="text-base font-semibold text-[var(--text-primary)]">{item.title}</h3>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">{item.intro}</p>
              </Link>
            ))}
          </div>
        </section>

        <AgentGridSection
          id="trending"
          title="Trending Agents"
          description="High-rank agents with active discovery momentum."
          href="/agent/trending"
          agents={overview.trending}
        />

        <AgentGridSection
          id="new"
          title="Newest Agent Listings"
          description="Recently indexed agents with fresh docs and metadata."
          href="/agent/new"
          agents={overview.newest}
        />

        <AgentGridSection
          id="downloads"
          title="Most Downloaded"
          description="Skills and packages with strong install/download traction."
          href="/agent/most-downloaded"
          agents={overview.mostDownloaded}
        />

        <section id="protocols" className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">Browse By Protocol</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Use protocol pages to compare agents that can run within the same integration contract.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {overview.protocolCounts.map((item) => (
              <Link
                key={item.protocol}
                href={`/agent/protocol/${encodeURIComponent(item.protocol.toLowerCase())}`}
                className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1 text-sm text-[var(--text-secondary)] hover:border-[var(--accent-heart)]/40 hover:text-[var(--text-primary)]"
              >
                {item.protocol} ({item.count})
              </Link>
            ))}
          </div>
        </section>

        <section id="sources" className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">Browse By Source</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Compare where listings come from across registries, repositories, and package ecosystems.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {overview.sourceCounts.map((item) => (
              <Link
                key={item.source}
                href={`/agent/source/${encodeURIComponent(sourceSlugFromValue(item.source))}`}
                className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1 text-sm text-[var(--text-secondary)] hover:border-[var(--accent-heart)]/40 hover:text-[var(--text-primary)]"
              >
                {item.source} ({item.count})
              </Link>
            ))}
          </div>
        </section>

        <section id="use-cases" className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">Browse By Use Case</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Navigate to curated use-case pages with practical selection criteria and alternatives.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {overview.useCases.map((item) => (
              <Link
                key={item.slug}
                href={`/agent/use-case/${encodeURIComponent(item.slug)}`}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 hover:border-[var(--accent-heart)]/40"
              >
                <h3 className="text-base font-semibold text-[var(--text-primary)]">{item.title}</h3>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">{item.intro}</p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
