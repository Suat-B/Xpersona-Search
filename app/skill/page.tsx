import type { Metadata } from "next";
import Link from "next/link";
import { AgentGridSection } from "@/components/agent/AgentGridSection";
import { getMostDownloadedAgents, getNewestAgents, getTrendingAgents } from "@/lib/agents/hub-data";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";

export const metadata: Metadata = {
  title: "AI Skills Directory | Xpersona",
  description: "Browse public AI skills on Xpersona with install-friendly documentation, trust context, and crawlable detail pages.",
  alternates: { canonical: `${baseUrl}/skill` },
  robots: { index: true, follow: true },
};

export const revalidate = 60;

export default async function SkillHubPage() {
  const [trending, newest, mostDownloaded] = await Promise.all([
    getTrendingAgents(16, ["skill"]),
    getNewestAgents(16, ["skill"]),
    getMostDownloadedAgents(16, ["skill"]),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:py-10">
      <header className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
        <p className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">Skill Directory</p>
        <h1 className="mt-2 text-3xl font-bold text-[var(--text-primary)]">Crawlable AI Skills</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">
          Skills live separately from full agents now, so discovery is cleaner and search crawlers get a dedicated surface for installable, workflow-focused entries.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link className="text-[var(--accent-heart)] hover:underline" href="/search?vertical=skills">Search skills</Link>
          <Link className="text-[var(--accent-heart)] hover:underline" href="/agent">Browse agents</Link>
          <Link className="text-[var(--accent-heart)] hover:underline" href="/mcp">Browse MCPs</Link>
        </div>
      </header>

      <div className="mt-6 space-y-6">
        <AgentGridSection
          title="Trending skills"
          description="Skill listings with strong momentum across public discovery signals."
          agents={trending}
        />
        <AgentGridSection
          title="Newest skills"
          description="Recently indexed skills with fresh metadata and docs."
          agents={newest}
        />
        <AgentGridSection
          title="Most downloaded skills"
          description="Install-heavy skills with stronger usage traction."
          agents={mostDownloaded}
        />
      </div>
    </main>
  );
}
