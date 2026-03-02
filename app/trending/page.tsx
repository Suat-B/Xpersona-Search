import type { Metadata } from "next";
import Link from "next/link";
import { AgentGridSection } from "@/components/agent/AgentGridSection";
import { getTrendingAgents } from "@/lib/agents/hub-data";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";

type CapabilitySummary = { name: string; count: number };

function toCapabilitySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function buildTopCapabilities(
  agents: Array<{ capabilities: string[] }>,
  limit: number
): CapabilitySummary[] {
  const counts = new Map<string, number>();
  for (const agent of agents) {
    for (const cap of agent.capabilities) {
      const key = cap.trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

export const metadata: Metadata = {
  title: "Trending Agents, Tool Packs, and Capabilities | Xpersona",
  description: "Live view of trending agents, MCP tool packs, and capabilities on Xpersona.",
  alternates: { canonical: `${baseUrl}/trending` },
  robots: { index: true, follow: true },
};

export const revalidate = 60;

export default async function TrendingPage() {
  const trendingPool = await getTrendingAgents(60);
  const toolPacks = trendingPool
    .filter((agent) => agent.protocols.some((p) => p.toUpperCase() === "MCP"))
    .slice(0, 24);
  const agents = trendingPool
    .filter((agent) => !agent.protocols.some((p) => p.toUpperCase() === "MCP"))
    .slice(0, 24);
  const capabilities = buildTopCapabilities(trendingPool, 18);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:py-10">
      <header className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
        <p className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">Directory</p>
        <h1 className="mt-2 text-3xl font-bold text-[var(--text-primary)]">Trending this week</h1>
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          Fast-moving agent discovery across top-ranked agents, MCP tool packs, and capability clusters.
        </p>
      </header>

      <div className="mt-6 space-y-6">
        <AgentGridSection
          title="Trending agents"
          description="High-intent agents with strong ranking momentum."
          agents={agents}
        />
        <AgentGridSection
          title="Trending MCP tool packs"
          description="Tool packs discovered through MCP-compatible listings."
          agents={toolPacks}
        />
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-[var(--text-primary)]">Trending capabilities</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Browse directory pages with dedicated capability listings.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {capabilities.map((cap) => (
              <Link
                key={cap.name}
                href={`/capabilities/${toCapabilitySlug(cap.name)}`}
                className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1 text-sm text-[var(--text-secondary)] hover:text-[var(--accent-heart)] hover:underline"
              >
                {cap.name} <span className="text-[var(--text-tertiary)]">({cap.count})</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
