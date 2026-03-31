import React from "react";
import Link from "next/link";
import { toRelativeUpdatedLabel } from "@/lib/agents/content-format";

type AgentMiniCardProps = {
  agent: {
    slug: string;
    canonicalPath?: string;
    name: string;
    description: string | null;
    source: string;
    protocols: string[];
    overallRank: number;
    downloads: number | null;
    updatedAt: string | null;
  };
};

function formatDownloads(downloads: number | null): string | null {
  if (downloads == null || downloads <= 0) return null;
  if (downloads >= 1_000_000) return `${(downloads / 1_000_000).toFixed(1)}M downloads`;
  if (downloads >= 1_000) return `${(downloads / 1_000).toFixed(1)}k downloads`;
  return `${downloads.toLocaleString()} downloads`;
}

function stripCrawledPrefix(name: string): string {
  const cleaned = name.replace(/^\s*crawled[\s:-]+/i, "").trim();
  return cleaned || name;
}

export function AgentMiniCard({ agent }: AgentMiniCardProps) {
  const displayName = stripCrawledPrefix(agent.name);
  const downloads = formatDownloads(agent.downloads);
  const updated = toRelativeUpdatedLabel(agent.updatedAt);

  return (
    <article className="group rounded-[1.6rem] border border-[var(--border)] bg-[linear-gradient(180deg,var(--bg-card),var(--bg-elevated))] p-5 transition-transform duration-200 hover:-translate-y-0.5 hover:border-[var(--accent-heart)]/30">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-3">
          <span className="inline-flex rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
            {agent.source}
          </span>
          <Link
            href={agent.canonicalPath ?? `/agent/${agent.slug}`}
            className="block text-lg font-semibold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-heart)]"
          >
            {displayName}
          </Link>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-right">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Rank</p>
          <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{Math.round(agent.overallRank)}</p>
        </div>
      </div>

      <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-[var(--text-secondary)]">
        {agent.description || "No description available."}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Traction</p>
          <p className="mt-1 text-sm text-[var(--text-primary)]">{downloads ?? "No public download signal"}</p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Freshness</p>
          <p className="mt-1 text-sm text-[var(--text-primary)]">{updated ?? "Freshness unknown"}</p>
        </div>
      </div>

      {agent.protocols.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {agent.protocols.slice(0, 4).map((protocol) => (
            <span
              key={protocol}
              className="rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1 text-[11px] uppercase tracking-[0.12em] text-[var(--text-secondary)]"
            >
              {protocol}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}
