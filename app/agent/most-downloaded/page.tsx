import type { Metadata } from "next";
import { AgentGridSection } from "@/components/agent/AgentGridSection";
import { getMostDownloadedAgents } from "@/lib/agents/hub-data";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";

export const metadata: Metadata = {
  title: "Most Downloaded AI Skills | Xpersona",
  description:
    "Most downloaded AI skills and packages indexed by Xpersona across npm and ClawHub ecosystems.",
  alternates: { canonical: `${baseUrl}/agent/most-downloaded` },
  robots: { index: true, follow: true },
};

export const revalidate = 60;

export default async function MostDownloadedAgentsPage() {
  const agents = await getMostDownloadedAgents(30);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:py-10">
      <header className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
        <p className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">Collection</p>
        <h1 className="mt-2 text-3xl font-bold text-[var(--text-primary)]">Most Downloaded</h1>
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          Agents and skills with high install/download activity across indexed registries.
        </p>
      </header>
      <div className="mt-6">
        <AgentGridSection title="Highest download volume" agents={agents} />
      </div>
    </main>
  );
}

