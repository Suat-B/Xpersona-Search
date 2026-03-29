import type { Metadata } from "next";
import Link from "next/link";
import { AgentGridSection } from "@/components/agent/AgentGridSection";
import { getNewestAgents, getTrendingAgents } from "@/lib/agents/hub-data";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";

export const metadata: Metadata = {
  title: "MCP Server Directory | Xpersona",
  description: "Browse public MCP servers on Xpersona with dedicated crawlable pages, trust context, and cleaner search separation from agents and skills.",
  alternates: { canonical: `${baseUrl}/mcp` },
  robots: { index: true, follow: true },
};

export const revalidate = 60;

export default async function McpHubPage() {
  const [trending, newest] = await Promise.all([
    getTrendingAgents(20, ["mcp"]),
    getNewestAgents(20, ["mcp"]),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:py-10">
      <header className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
        <p className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">MCP Directory</p>
        <h1 className="mt-2 text-3xl font-bold text-[var(--text-primary)]">MCP Servers, Not Agent Noise</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">
          MCP listings now have their own crawlable home so search results can separate protocol servers from broader agents and skills.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link className="text-[var(--accent-heart)] hover:underline" href="/search?vertical=mcps">Search MCPs</Link>
          <Link className="text-[var(--accent-heart)] hover:underline" href="/agent">Browse agents</Link>
          <Link className="text-[var(--accent-heart)] hover:underline" href="/skill">Browse skills</Link>
        </div>
      </header>

      <div className="mt-6 space-y-6">
        <AgentGridSection
          title="Trending MCP servers"
          description="MCP-compatible listings with strong discovery momentum."
          agents={trending}
        />
        <AgentGridSection
          title="Newest MCP servers"
          description="Recently indexed MCP entries with fresh crawl-visible metadata."
          agents={newest}
        />
      </div>
    </main>
  );
}
