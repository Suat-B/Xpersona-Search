import Link from "next/link";
import { toRelativeUpdatedLabel } from "@/lib/agents/content-format";

type AgentMiniCardProps = {
  agent: {
    slug: string;
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

export function AgentMiniCard({ agent }: AgentMiniCardProps) {
  const downloads = formatDownloads(agent.downloads);
  const updated = toRelativeUpdatedLabel(agent.updatedAt);

  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/agent/${agent.slug}`}
          className="text-base font-semibold text-[var(--text-primary)] hover:text-[var(--accent-heart)] hover:underline"
        >
          {agent.name}
        </Link>
        <span className="text-xs rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[var(--text-tertiary)]">
          {agent.source}
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-sm text-[var(--text-secondary)]">
        {agent.description || "No description available."}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--text-tertiary)]">
        <span>Rank {Math.round(agent.overallRank)}</span>
        {downloads ? <span>| {downloads}</span> : null}
        {updated ? <span>| {updated}</span> : null}
      </div>
      {agent.protocols.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {agent.protocols.slice(0, 3).map((protocol) => (
            <span
              key={protocol}
              className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]"
            >
              {protocol}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}
