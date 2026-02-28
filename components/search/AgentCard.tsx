"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { saveScrollPosition } from "@/lib/search/scroll-memory";
import { SafetyBadge } from "./SafetyBadge";
import { ProtocolBadge } from "./ProtocolBadge";
import { SourceBadge } from "@/components/agent/SourceBadge";
import { OwnerBadge } from "@/components/agent/OwnerBadge";

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
  claimStatus?: string;
  verificationTier?: "NONE" | "BRONZE" | "SILVER" | "GOLD";
  hasCustomPage?: boolean;
  trust?: {
    handshakeStatus?: string;
    verificationFreshnessHours?: number | null;
    reputationScore?: number | null;
  } | null;
  contentMeta?: {
    hasEditorialContent: boolean;
    qualityScore: number | null;
    lastReviewedAt: string | null;
    bestFor: string | null;
    setupComplexity: "low" | "medium" | "high";
    hasFaq: boolean;
    hasPlaybook: boolean;
  } | null;
}

interface Props {
  agent: Agent;
  rank: number;
}

function getPopularityLabel(agent: Agent): string {
  const github = agent.githubData ?? {};
  const npm = agent.npmData ?? {};
  if (github.stars != null && github.stars > 0) return `${github.stars} stars`;
  if (typeof npm.downloads === "number" && npm.downloads > 0) {
    const n = npm.downloads;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M downloads`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k downloads`;
    return `${n} downloads`;
  }
  return `${agent.githubData?.stars ?? 0} stars`;
}

export function AgentCard({ agent, rank }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentSearch = searchParams.toString();
  const fromPath = currentSearch ? `${pathname}?${currentSearch}` : pathname;
  const agentHref = `/agent/${agent.slug}?from=${encodeURIComponent(fromPath)}`;
  const handleAgentNavigate = () => saveScrollPosition(fromPath);

  const caps = Array.isArray(agent.capabilities) ? agent.capabilities : [];
  const protos = Array.isArray(agent.protocols) ? agent.protocols : [];
  const popularityLabel = getPopularityLabel(agent);
  const trust = agent.trust ?? null;
  const contentMeta = agent.contentMeta ?? null;

  return (
    <article className="agent-card neural-glass-hover p-6 rounded-xl border border-[var(--border)] hover:border-[var(--accent-heart)]/40 transition-all duration-200">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <span className="text-2xl font-bold text-[var(--text-tertiary)]" aria-hidden>
              #{rank}
            </span>
            <Link
              href={agentHref}
              onClick={handleAgentNavigate}
              className="text-xl font-semibold text-[var(--text-primary)] hover:text-[var(--accent-heart)] truncate transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:ring-offset-2 focus:ring-offset-[var(--bg-deep)] rounded"
            >
              {agent.name}
            </Link>
            {agent.source && <SourceBadge source={agent.source} />}
            {agent.claimStatus === "CLAIMED" && <OwnerBadge size="sm" />}
            {agent.claimStatus === "CLAIMED" &&
              agent.verificationTier &&
              agent.verificationTier !== "NONE" && (
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--accent-neural)]/30 bg-[var(--accent-neural)]/10 px-2 py-0.5 text-xs font-medium text-[var(--accent-neural)]">
                  {agent.verificationTier}
                </span>
              )}
            {agent.hasCustomPage && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--accent-heart)]/30 bg-[var(--accent-heart)]/10 px-2 py-0.5 text-xs font-medium text-[var(--accent-heart)]">
                Custom Page
              </span>
            )}
            {protos.map((p) => (
              <ProtocolBadge key={p} protocol={p} />
            ))}
          </div>
          <p className="text-[var(--text-secondary)] mb-3 line-clamp-2">
            {agent.description || "No description"}
          </p>
          {contentMeta?.bestFor && (
            <p className="text-xs text-[var(--text-tertiary)] mb-3">
              <span className="font-medium text-[var(--text-secondary)]">Best for:</span> {contentMeta.bestFor}
            </p>
          )}
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
          <div className="flex items-center gap-3 text-sm flex-wrap">
            <SafetyBadge score={agent.safetyScore} />
            <span className="text-[var(--text-quaternary)]">|</span>
            <span className="text-[var(--text-tertiary)]">{popularityLabel}</span>
            {contentMeta && (
              <>
                <span className="text-[var(--text-quaternary)]">|</span>
                <span className="text-[var(--text-tertiary)]">Setup {contentMeta.setupComplexity}</span>
                {contentMeta.hasFaq && <span className="text-[var(--text-tertiary)]">| FAQ</span>}
                {contentMeta.hasPlaybook && <span className="text-[var(--text-tertiary)]">| Playbook</span>}
                {contentMeta.qualityScore != null && (
                  <span className="text-[var(--text-tertiary)]">| Content {contentMeta.qualityScore}/100</span>
                )}
              </>
            )}
            {trust?.handshakeStatus && (
              <>
                <span className="text-[var(--text-quaternary)]">|</span>
                <span className="text-[var(--text-tertiary)]">Handshake {trust.handshakeStatus}</span>
              </>
            )}
            {trust?.reputationScore != null && (
              <>
                <span className="text-[var(--text-quaternary)]">|</span>
                <span className="text-[var(--text-tertiary)]">Reputation {trust.reputationScore}</span>
              </>
            )}
          </div>
        </div>
        <Link
          href={agentHref}
          onClick={handleAgentNavigate}
          className="px-6 py-3 bg-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/90 active:bg-[var(--accent-heart)]/80 rounded-lg font-semibold flex-shrink-0 text-white transition-all duration-200 shadow-md shadow-[var(--accent-heart)]/20 hover:shadow-[var(--accent-heart)]/30 focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:ring-offset-2 focus:ring-offset-[var(--bg-deep)]"
        >
          View
        </Link>
        <Link
          href={`/dashboard/jobs?agent=${encodeURIComponent(agent.slug)}&title=${encodeURIComponent(`Hire ${agent.name}`)}&q=${encodeURIComponent(searchParams.get("q") ?? "")}`}
          className="px-4 py-3 rounded-lg font-semibold flex-shrink-0 border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:border-[var(--accent-neural)]/40 transition-all duration-200"
        >
          Hire
        </Link>
      </div>
    </article>
  );
}

