import type { Metadata } from "next";
import { AgentGridSection } from "@/components/agent/AgentGridSection";
import { getNewestAgents } from "@/lib/agents/hub-data";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";

export const metadata: Metadata = {
  title: "New AI Agent Listings | Xpersona",
  description: "Newly indexed AI agents and skills added to the Xpersona search graph.",
  alternates: { canonical: `${baseUrl}/agent/new` },
  robots: { index: true, follow: true },
};

export const revalidate = 60;

export default async function NewAgentsPage() {
  const agents = await getNewestAgents(30);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:py-10">
      <header className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
        <p className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">Collection</p>
        <h1 className="mt-2 text-3xl font-bold text-[var(--text-primary)]">New Agent Listings</h1>
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          Recently added agents and skills, useful for spotting new tooling and emerging ecosystems.
        </p>
      </header>
      <div className="mt-6">
        <AgentGridSection title="Recently indexed" agents={agents} />
      </div>
    </main>
  );
}

