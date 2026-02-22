"use client";

import Link from "next/link";

interface Agent {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  capabilities: string[];
  protocols: string[];
  safetyScore: number;
  popularityScore: number;
  overallRank: number;
  githubData?: { stars?: number; forks?: number };
}

interface Props {
  agent: Agent;
  /** Optional animation classes for staggered entrance */
  className?: string;
}

const DISPLAY_BASE = "xpersona.co";

function getDisplayUrl(slug: string): string {
  return `${DISPLAY_BASE}/agent/${slug}`;
}

export function SearchResultSnippet({ agent, className }: Props) {
  const protos = Array.isArray(agent.protocols) ? agent.protocols : [];
  const displayUrl = getDisplayUrl(agent.slug);

  return (
    <article className={`py-4 border-b border-[var(--border)] last:border-b-0 group ${className ?? ""}`}>
      <Link
        href={`/agent/${agent.slug}`}
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-heart)]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-deep)] rounded"
      >
        <h3 className="text-lg font-medium text-[var(--accent-heart)] group-hover:underline decoration-[var(--accent-heart)] underline-offset-2 truncate">
          {agent.name}
        </h3>
      </Link>
      <p className="text-sm text-[var(--text-tertiary)] mt-0.5 truncate">
        {displayUrl}
      </p>
      <p className="text-[var(--text-secondary)] text-sm mt-1 line-clamp-2">
        {agent.description || "No description available."}
      </p>
      <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-[var(--text-quaternary)]">
        {protos.map((p) => (
          <span
            key={p}
            className="px-2 py-0.5 rounded bg-[var(--bg-elevated)] border border-white/[0.06]"
          >
            {p}
          </span>
        ))}
        {agent.safetyScore < 50 && (
          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
            Pending review
          </span>
        )}
        <span className="text-[var(--text-quaternary)]">·</span>
        <span>Safety {agent.safetyScore}/100</span>
        <span className="text-[var(--text-quaternary)]">·</span>
        <span>Rank {agent.overallRank.toFixed(1)}</span>
        {(agent.githubData?.stars ?? 0) > 0 && (
          <>
            <span className="text-[var(--text-quaternary)]">·</span>
            <span>⭐ {agent.githubData?.stars}</span>
          </>
        )}
      </div>
    </article>
  );
}
