"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { saveScrollPosition } from "@/lib/search/scroll-memory";
import { inferWhyRankLabel, toRelativeUpdatedLabel } from "@/lib/agents/content-format";

interface Agent {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  url?: string;
  homepage?: string | null;
  source?: string;
  sourceId?: string;
  capabilities: string[];
  protocols: string[];
  languages?: string[];
  safetyScore: number;
  popularityScore: number;
  overallRank: number;
  claimStatus?: string;
  verificationTier?: "NONE" | "BRONZE" | "SILVER" | "GOLD";
  hasCustomPage?: boolean;
  githubData?: { stars?: number; forks?: number };
  npmData?: { packageName?: string; version?: string };
  agentExecution?: {
    authModes: string[];
    inputSchemaRef: string | null;
    outputSchemaRef: string | null;
    rateLimit: { rpm?: number; burst?: number } | null;
    observedLatencyMsP50: number | null;
    observedLatencyMsP95: number | null;
    estimatedCostUsd: number | null;
    lastVerifiedAt: string | null;
    uptime30d: number | null;
    execReady?: boolean;
  };
  policyMatch?: { score: number; blockedBy: string[]; matched: string[] };
  fallbacks?: Array<{ id: string; slug: string; reason: string; switchWhen: string }>;
  delegationHints?: Array<{ role: string; why: string; candidateSlugs: string[] }>;
  rankingSignals?: {
    successScore: number;
    reliabilityScore: number;
    policyScore: number;
    freshnessScore: number;
    finalScore: number;
  };
  trust?: {
    handshakeStatus?: string;
    lastVerifiedAt?: string | null;
    verificationFreshnessHours?: number | null;
    reputationScore?: number | null;
    receiptSupport?: boolean;
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
  showSitelinks?: boolean;
  className?: string;
}

interface Sitelink {
  title: string;
  href: string;
  snippet: string;
}

const DISPLAY_BASE = "xpersona.co";

function getDisplayUrl(slug: string): string {
  return `${DISPLAY_BASE}/agent/${slug}`;
}

function getSitelinks(agent: Agent, agentHref: string): Sitelink[] {
  const links: Sitelink[] = [];
  const seenHrefs = new Set<string>();

  const add = (link: Sitelink) => {
    const normalized = link.href.replace(/\/$/, "").replace(/\.git$/, "").toLowerCase();
    if (seenHrefs.has(normalized)) return;
    seenHrefs.add(normalized);
    links.push(link);
  };

  add({
    title: "Full agent page",
    href: agentHref,
    snippet: "Documentation, setup guidance, workflows, FAQ, and alternatives.",
  });

  const ghBase = agent.url?.replace(/\.git$/, "").replace(/\/$/, "");
  if (ghBase?.includes("github.com")) {
    add({
      title: "View on GitHub",
      href: ghBase,
      snippet: "Browse source code, README, and contribution guidelines.",
    });
    add({
      title: "GitHub Issues",
      href: `${ghBase}/issues`,
      snippet: "Report bugs and track feature requests.",
    });
    add({
      title: "GitHub Releases",
      href: `${ghBase}/releases`,
      snippet: "Download releases and view changelog.",
    });
    add({
      title: "GitHub Pull requests",
      href: `${ghBase}/pulls`,
      snippet: "Open pull requests and review contributions.",
    });
  }
  if (agent.source === "NPM" && (agent.npmData?.packageName ?? agent.name)) {
    const pkg = agent.npmData?.packageName ?? agent.name;
    const ver = agent.npmData?.version ? ` - latest v${agent.npmData.version}` : "";
    add({
      title: "npm package",
      href: `https://www.npmjs.com/package/${encodeURIComponent(pkg)}`,
      snippet: `Install from npm registry${ver}.`,
    });
  }
  if (agent.source === "PYPI") {
    const pkg = agent.sourceId?.replace(/^pypi:/, "") ?? agent.name;
    add({
      title: "View on PyPI",
      href: `https://pypi.org/project/${encodeURIComponent(pkg)}`,
      snippet: "Python package installable via pip.",
    });
  }
  if (agent.source === "CLAWHUB" && agent.url) {
    add({
      title: "View on ClawHub",
      href: agent.url,
      snippet: "Official OpenClaw skill registry. Install with clawhub skill install.",
    });
  }
  if (agent.source === "HUGGINGFACE" && agent.url) {
    add({
      title: "Hugging Face Space",
      href: agent.url,
      snippet: "Live demo and model configs.",
    });
  }
  if (agent.homepage) {
    add({
      title: "Official website",
      href: agent.homepage,
      snippet: "Project homepage and docs.",
    });
  }
  if (agent.url && links.length === 1) {
    add({
      title: "View source",
      href: agent.url,
      snippet: "Original source repository or package page.",
    });
  }
  return links.slice(0, 10);
}

function setupComplexityLabel(value: "low" | "medium" | "high"): string {
  if (value === "high") return "Setup: high";
  if (value === "low") return "Setup: low";
  return "Setup: medium";
}

export function SearchResultSnippet({ agent, showSitelinks = false, className }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentSearch = searchParams.toString();
  const fromPath = currentSearch ? `${pathname}?${currentSearch}` : pathname;
  const agentHref = `/agent/${agent.slug}?from=${encodeURIComponent(fromPath)}`;

  const protos = Array.isArray(agent.protocols) ? agent.protocols : [];
  const caps = Array.isArray(agent.capabilities) ? agent.capabilities : [];
  const langs = Array.isArray(agent.languages) ? agent.languages : [];
  const displayUrl = getDisplayUrl(agent.slug);
  const sitelinks = showSitelinks ? getSitelinks(agent, agentHref) : [];
  const handleAgentNavigate = () => saveScrollPosition(fromPath);

  const isClaimed = agent.claimStatus === "CLAIMED";
  const tier = agent.verificationTier ?? "NONE";
  const exec = agent.agentExecution;
  const reliabilityPct = agent.rankingSignals
    ? Math.round(agent.rankingSignals.reliabilityScore * 100)
    : null;
  const successPct = agent.rankingSignals
    ? Math.round(agent.rankingSignals.successScore * 100)
    : null;
  const trust = agent.trust ?? null;
  const trustFreshness = trust?.verificationFreshnessHours ?? null;
  const contentMeta = agent.contentMeta ?? null;
  const updatedLabel = toRelativeUpdatedLabel(contentMeta?.lastReviewedAt ?? null);
  const whyRank = inferWhyRankLabel({
    trustScore: trust?.reputationScore ?? null,
    overallRank: agent.overallRank,
    qualityScore: contentMeta?.qualityScore ?? null,
  });

  return (
    <article className={`py-4 sm:py-5 border-b border-[var(--border)] last:border-b-0 group min-w-0 ${className ?? ""}`}>
      <Link
        href={agentHref}
        onClick={handleAgentNavigate}
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-heart)]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-deep)] rounded touch-manipulation min-h-[44px]"
      >
        <h3 className="text-lg font-medium text-[var(--accent-heart)] group-hover:underline decoration-[var(--accent-heart)] underline-offset-2 truncate">
          {agent.name}
        </h3>
      </Link>
      <p className="text-sm text-[var(--text-tertiary)] mt-0.5 truncate">{displayUrl}</p>
      <p className="text-[var(--text-secondary)] text-sm mt-1.5 line-clamp-2">
        {agent.description || "No description available."}
      </p>

      {contentMeta?.bestFor && (
        <p className="mt-2 text-xs text-[var(--text-tertiary)]">
          <span className="font-medium text-[var(--text-secondary)]">Best for:</span> {contentMeta.bestFor}
        </p>
      )}

      {caps.length > 0 && (
        <p className="text-xs text-[var(--text-quaternary)] mt-2">
          <span className="font-medium text-[var(--text-tertiary)]">Capabilities:</span>{" "}
          {caps.slice(0, 5).join(", ")}
          {caps.length > 5 ? "..." : ""}
        </p>
      )}

      {langs.length > 0 && (
        <p className="text-xs text-[var(--text-quaternary)] mt-1">
          <span className="font-medium text-[var(--text-tertiary)]">Languages:</span> {langs.join(", ")}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-[var(--text-quaternary)]">
        {isClaimed && (
          <span className="px-2 py-0.5 rounded bg-[#30d158]/15 text-[#30d158] border border-[#30d158]/30">
            Claimed
          </span>
        )}
        {isClaimed && tier !== "NONE" && (
          <span className="px-2 py-0.5 rounded bg-[var(--accent-neural)]/15 text-[var(--accent-neural)] border border-[var(--accent-neural)]/30">
            {tier}
          </span>
        )}
        {agent.hasCustomPage && (
          <span className="px-2 py-0.5 rounded bg-[var(--accent-heart)]/15 text-[var(--accent-heart)] border border-[var(--accent-heart)]/30">
            Custom page
          </span>
        )}
        {protos.map((p) => (
          <span key={p} className="px-2 py-0.5 rounded bg-[var(--bg-elevated)] border border-white/[0.06]">
            {p}
          </span>
        ))}
        {contentMeta && (
          <>
            <span className="text-[var(--text-quaternary)]">|</span>
            <span>{setupComplexityLabel(contentMeta.setupComplexity)}</span>
            {contentMeta.hasFaq && <span>| Has FAQ</span>}
            {contentMeta.hasPlaybook && <span>| Has playbook</span>}
            {contentMeta.qualityScore != null && <span>| Content {contentMeta.qualityScore}/100</span>}
            {updatedLabel && <span>| {updatedLabel}</span>}
          </>
        )}
        {agent.safetyScore < 40 && (
          <>
            <span className="text-[var(--text-quaternary)]">|</span>
            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
              Pending review
            </span>
          </>
        )}
        <span className="text-[var(--text-quaternary)]">|</span>
        <span>
          Safety{" "}
          {agent.safetyScore >= 25 && agent.safetyScore <= 55
            ? Math.min(100, Math.round(agent.safetyScore * 1.15))
            : agent.safetyScore}
          /100
        </span>
        {(agent.githubData?.stars ?? 0) > 0 && (
          <>
            <span className="text-[var(--text-quaternary)]">|</span>
            <span>{agent.githubData?.stars} stars</span>
          </>
        )}
        {exec?.execReady && (
          <>
            <span className="text-[var(--text-quaternary)]">|</span>
            <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              Exec Ready
            </span>
          </>
        )}
        {exec?.observedLatencyMsP95 != null && (
          <>
            <span className="text-[var(--text-quaternary)]">|</span>
            <span>P95 {exec.observedLatencyMsP95}ms</span>
          </>
        )}
        {exec?.estimatedCostUsd != null && (
          <>
            <span className="text-[var(--text-quaternary)]">|</span>
            <span>${exec.estimatedCostUsd.toFixed(3)}</span>
          </>
        )}
        {trust?.handshakeStatus && (
          <>
            <span className="text-[var(--text-quaternary)]">|</span>
            <span>Handshake {trust.handshakeStatus}</span>
          </>
        )}
        {trust?.reputationScore != null && (
          <>
            <span className="text-[var(--text-quaternary)]">|</span>
            <span>Reputation {trust.reputationScore}</span>
          </>
        )}
        {trustFreshness != null && trustFreshness <= 24 && (
          <>
            <span className="text-[var(--text-quaternary)]">|</span>
            <span>Fresh under 24h</span>
          </>
        )}
        {successPct != null && (
          <>
            <span className="text-[var(--text-quaternary)]">|</span>
            <span>Success {successPct}%</span>
          </>
        )}
        {reliabilityPct != null && (
          <>
            <span className="text-[var(--text-quaternary)]">|</span>
            <span>Reliability {reliabilityPct}%</span>
          </>
        )}
        {Array.isArray(agent.fallbacks) && agent.fallbacks.length > 0 && (
          <>
            <span className="text-[var(--text-quaternary)]">|</span>
            <span>{agent.fallbacks.length} fallback{agent.fallbacks.length === 1 ? "" : "s"}</span>
          </>
        )}
      </div>

      <p className="mt-2 text-xs text-[var(--text-tertiary)]">{whyRank}</p>

      <div className="mt-2 flex flex-wrap gap-3 text-xs">
        <Link href={`${agentHref}#setup`} onClick={handleAgentNavigate} className="text-[var(--accent-heart)] hover:underline">
          Setup
        </Link>
        <Link href={`${agentHref}#faq`} onClick={handleAgentNavigate} className="text-[var(--accent-heart)] hover:underline">
          FAQ
        </Link>
        <Link href={`${agentHref}#alternatives`} onClick={handleAgentNavigate} className="text-[var(--accent-heart)] hover:underline">
          Alternatives
        </Link>
      </div>

      {(agent.policyMatch || agent.rankingSignals || (agent.fallbacks && agent.fallbacks.length > 0)) && (
        <details className="mt-3 text-xs text-[var(--text-tertiary)]">
          <summary className="cursor-pointer hover:text-[var(--text-secondary)]">Execution details</summary>
          <div className="mt-2 space-y-1">
            {agent.policyMatch && (
              <p>
                Policy score: {agent.policyMatch.score}
                {agent.policyMatch.blockedBy.length > 0
                  ? ` | blocked: ${agent.policyMatch.blockedBy.join(", ")}`
                  : ""}
              </p>
            )}
            {agent.rankingSignals && (
              <p>
                Rank factors: success {Math.round(agent.rankingSignals.successScore * 100)}%
                {" | "}reliability {Math.round(agent.rankingSignals.reliabilityScore * 100)}%
                {" | "}policy {Math.round(agent.rankingSignals.policyScore * 100)}%
                {" | "}freshness {Math.round(agent.rankingSignals.freshnessScore * 100)}%
              </p>
            )}
            {agent.fallbacks && agent.fallbacks.length > 0 && (
              <p>
                Fallbacks: {agent.fallbacks.map((f) => `${f.slug} (${f.switchWhen})`).join(", ")}
              </p>
            )}
          </div>
        </details>
      )}

      {sitelinks.length > 0 && (
        <div className="mt-4 ml-2 sm:ml-4 pl-3 sm:pl-4 border-l-2 border-[var(--accent-heart)]/30 space-y-2.5 overflow-hidden min-w-0">
          {sitelinks.map((link) => {
            const isExternal = link.href.startsWith("http");

            if (isExternal) {
              return (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block group/link min-w-0"
                  aria-label={`${link.title}: ${link.snippet}`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-sm font-medium text-[var(--text-secondary)] group-hover/link:text-[var(--accent-heart)] transition-colors flex-shrink-0">
                      {link.title}
                    </span>
                    <span className="text-[var(--text-quaternary)] flex-shrink-0 group-hover/link:text-[var(--accent-heart)]">
                      {">"}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-quaternary)] mt-0.5 group-hover/link:text-[var(--text-tertiary)] line-clamp-2">
                    {link.snippet}
                  </p>
                </a>
              );
            }
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={handleAgentNavigate}
                className="block group/link min-w-0"
                aria-label={`${link.title}: ${link.snippet}`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-sm font-medium text-[var(--text-secondary)] group-hover/link:text-[var(--accent-heart)] transition-colors flex-shrink-0">
                    {link.title}
                  </span>
                  <span className="text-[var(--text-quaternary)] flex-shrink-0 group-hover/link:text-[var(--accent-heart)]">
                    {">"}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-quaternary)] mt-0.5 group-hover/link:text-[var(--text-tertiary)] line-clamp-2">
                  {link.snippet}
                </p>
              </Link>
            );
          })}
          <Link
            href={agentHref}
            onClick={handleAgentNavigate}
            className="inline-block text-xs text-[var(--text-quaternary)] hover:text-[var(--accent-heart)] mt-1 font-medium"
          >
            {"More from this agent ->"}
          </Link>
        </div>
      )}
    </article>
  );
}
