import Link from "next/link";
import { SafetyBadge } from "./SafetyBadge";
import { ProtocolBadge } from "./ProtocolBadge";
import { SourceBadge } from "@/components/agent/SourceBadge";

interface Agent {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  source?: string;
  capabilities: string[];
  protocols: string[];
  safetyScore: number;
  popularityScore: number;
  overallRank: number;
  githubData?: { stars?: number; forks?: number };
  npmData?: { downloads?: number };
}

interface Props {
  agent: Agent;
  rank: number;
}

function getPopularityLabel(agent: Agent): string {
  const github = agent.githubData ?? {};
  const npm = agent.npmData ?? {};
  if (github.stars != null && github.stars > 0) return `⭐ ${github.stars}`;
  if (typeof npm.downloads === "number" && npm.downloads > 0) {
    const n = npm.downloads;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M downloads`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k downloads`;
    return `${n} downloads`;
  }
  return `⭐ ${agent.githubData?.stars ?? 0}`;
}

export function AgentCard({ agent, rank }: Props) {
  const caps = Array.isArray(agent.capabilities) ? agent.capabilities : [];
  const protos = Array.isArray(agent.protocols) ? agent.protocols : [];
  const popularityLabel = getPopularityLabel(agent);

  return (
    <article className="agent-card neural-glass-hover p-6 rounded-xl border border-[var(--border)] hover:border-[var(--accent-heart)]/40 transition-all duration-200">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <span className="text-2xl font-bold text-[var(--text-tertiary)]" aria-hidden>#{rank}</span>
            <Link
              href={`/agent/${agent.slug}`}
              className="text-xl font-semibold text-[var(--text-primary)] hover:text-[var(--accent-heart)] truncate transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:ring-offset-2 focus:ring-offset-[var(--bg-deep)] rounded"
            >
              {agent.name}
            </Link>
            {agent.source && <SourceBadge source={agent.source} />}
            {protos.map((p) => (
              <ProtocolBadge key={p} protocol={p} />
            ))}
          </div>
          <p className="text-[var(--text-secondary)] mb-4 line-clamp-2">
            {agent.description || "No description"}
          </p>
          <div className="flex flex-wrap gap-2 mb-4">
            {caps.slice(0, 5).map((cap) => (
              <span
                key={cap}
                className="px-3 py-1 rounded-lg bg-[var(--bg-elevated)] text-sm text-[var(--text-secondary)] border border-white/[0.06]"
              >
                {cap}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-4 text-sm">
            <SafetyBadge score={agent.safetyScore} />
            <span className="text-[var(--text-quaternary)]">·</span>
            <span className="text-[var(--text-tertiary)]">{popularityLabel}</span>
            <span className="text-[var(--text-quaternary)]">·</span>
            <span className="text-[var(--text-tertiary)]">Rank: {agent.overallRank.toFixed(1)}/100</span>
          </div>
        </div>
        <Link
          href={`/agent/${agent.slug}`}
          className="px-6 py-3 bg-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/90 active:bg-[var(--accent-heart)]/80 rounded-lg font-semibold flex-shrink-0 text-white transition-all duration-200 shadow-md shadow-[var(--accent-heart)]/20 hover:shadow-[var(--accent-heart)]/30 focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:ring-offset-2 focus:ring-offset-[var(--bg-deep)]"
        >
          View
        </Link>
      </div>
    </article>
  );
}
