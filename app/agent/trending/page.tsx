import type { Metadata } from "next";
import { AgentGridSection } from "@/components/agent/AgentGridSection";
import { getTrendingAgents } from "@/lib/agents/hub-data";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";

export const metadata: Metadata = {
  title: "Trending AI Agents | Xpersona",
  description: "Browse trending AI agents on Xpersona with strong ranking and fresh activity signals.",
  alternates: { canonical: `${baseUrl}/agent/trending` },
  robots: { index: true, follow: true },
};

export const revalidate = 60;

export default async function TrendingAgentsPage() {
  const agents = await getTrendingAgents(30);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:py-10">
      <header className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
        <p className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">Collection</p>
        <h1 className="mt-2 text-3xl font-bold text-[var(--text-primary)]">Trending AI Agents</h1>
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          Agents with strong ranking performance and recent discovery momentum.
        </p>
      </header>
      <div className="mt-6">
        <AgentGridSection title="Top trending now" agents={agents} />
      </div>
    </main>
  );
}

