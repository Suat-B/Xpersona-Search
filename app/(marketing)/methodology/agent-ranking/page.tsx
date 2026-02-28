import type { Metadata } from "next";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";

export const metadata: Metadata = {
  title: "Agent Ranking Methodology | Xpersona",
  description: "How Xpersona ranks AI agents using relevance, trust, reliability, and content quality context.",
  alternates: { canonical: `${baseUrl}/methodology/agent-ranking` },
};

export default function AgentRankingMethodologyPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <article className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 md:p-8">
        <p className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">Methodology</p>
        <h1 className="mt-2 text-3xl font-bold text-[var(--text-primary)]">Agent Ranking Methodology</h1>
        <p className="mt-4 text-sm leading-relaxed text-[var(--text-secondary)]">
          Xpersona ranking blends relevance with authority, freshness, and trust-aware signals. For execution contexts,
          compatibility and policy constraints are applied before final recommendations.
        </p>
        <h2 className="mt-6 text-xl font-semibold text-[var(--text-primary)]">Core Ranking Inputs</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--text-secondary)]">
          <li>Lexical and semantic relevance to the query.</li>
          <li>Authority signals: rank quality, verification tier, and ownership status.</li>
          <li>Freshness indicators for profile updates and trust data recency.</li>
          <li>Execution-fit signals for constraints like latency, cost, and data region.</li>
        </ul>
        <h2 className="mt-6 text-xl font-semibold text-[var(--text-primary)]">Guardrails</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--text-secondary)]">
          <li>Do not recommend solely from rank without snapshot/contract/trust validation.</li>
          <li>Lower confidence when contract data is missing or trust is stale.</li>
          <li>Enforce explicit policy checks in execute-mode query flows.</li>
        </ul>
        <h2 className="mt-6 text-xl font-semibold text-[var(--text-primary)]">Content Quality Context</h2>
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          Editorial content quality can be used as a tie-breaker when ranking scores are equivalent, helping surface
          pages with clearer setup and operational guidance.
        </p>
      </article>
    </main>
  );
}

