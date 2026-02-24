"use client";

import { useSearchParams } from "next/navigation";
import { ProtocolBadge } from "@/components/search/ProtocolBadge";
import { BackToSearchLink } from "@/components/agent/BackToSearchLink";
import { SafetyBadge } from "@/components/search/SafetyBadge";
import { SourceBadge } from "@/components/agent/SourceBadge";
import { InstallCommand } from "@/components/agent/InstallCommand";
import { SkillMarkdown } from "./SkillMarkdown";
import { AgentHomepageEmbed } from "./AgentHomepageEmbed";
import { ClaimBanner } from "./ClaimBanner";
import { OwnerBadge } from "./OwnerBadge";
import { VerificationTierBadge } from "./VerificationTierBadge";
import { CustomAgentPage } from "./CustomAgentPage";

interface OpenClawData {
  parameters?: Record<
    string,
    { type: string; required?: boolean; default?: unknown; description?: string }
  >;
  examples?: string[];
  dependencies?: string[];
  permissions?: string[];
}

interface NpmData {
  packageName?: string;
  version?: string;
  date?: string;
  downloads?: number;
}

interface Agent {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  url: string;
  homepage?: string | null;
  source?: string;
  sourceId?: string;
  capabilities: string[];
  protocols: string[];
  languages?: string[];
  safetyScore: number;
  popularityScore: number;
  overallRank: number;
  githubData?: { stars?: number; forks?: number };
  npmData?: NpmData | null;
  readme?: string | null;
  codeSnippets?: string[];
  openclawData?: OpenClawData | null;
  claimStatus?: string;
  verificationTier?: "NONE" | "BRONZE" | "SILVER" | "GOLD";
  claimedByName?: string | null;
  isOwner?: boolean;
  claimedAt?: string | null;
  hasCustomPage?: boolean;
  customPage?: {
    html: string;
    css: string;
    js: string;
    widgetLayout: unknown[];
    updatedAt?: string | null;
  } | null;
  customLinks?: Array<{ label: string; url: string }>;
}

interface AgentPageClientProps {
  agent: Agent;
}

type CtaConfig = { label: string; href: string };

function getPrimaryCta(agent: Agent): CtaConfig {
  const source = (agent.source ?? "GITHUB_OPENCLEW").toUpperCase();
  const url = agent.url ?? "#";

  switch (source) {
    case "NPM": {
      const pkg = agent.npmData?.packageName ?? agent.name;
      return { label: "View on npm", href: `https://www.npmjs.com/package/${encodeURIComponent(pkg)}` };
    }
    case "PYPI": {
      const pkg = agent.sourceId?.replace(/^pypi:/, "") ?? agent.name;
      return { label: "View on PyPI", href: `https://pypi.org/project/${encodeURIComponent(pkg)}` };
    }
    case "CLAWHUB":
      return { label: "View on ClawHub", href: url };
    case "HUGGINGFACE":
      return { label: "View on Hugging Face", href: url };
    case "MCP_REGISTRY":
    case "A2A_REGISTRY":
      return { label: "View source", href: url };
    case "DOCKER":
      return { label: "View on Docker Hub", href: url };
    case "REPLICATE":
      return { label: "View on Replicate", href: url };
    case "GITHUB_OPENCLEW":
    case "GITHUB_MCP":
    case "GITHUB_A2A":
    default:
      return { label: "View on GitHub", href: url };
  }
}

function getInstallCommand(agent: Agent): string | null {
  const source = (agent.source ?? "GITHUB_OPENCLEW").toUpperCase();

  switch (source) {
    case "NPM": {
      const pkg = agent.npmData?.packageName ?? agent.name;
      return `npm install ${pkg}`;
    }
    case "PYPI": {
      const pkg = agent.sourceId?.replace(/^pypi:/, "") ?? agent.name.toLowerCase().replace(/\s+/g, "-");
      return `pip install ${pkg}`;
    }
    case "CLAWHUB": {
      const clawhubSlug = agent.sourceId?.replace(/^clawhub:/, "") ?? agent.slug;
      return `clawhub skill install ${clawhubSlug}`;
    }
    case "DOCKER": {
      const image = agent.sourceId?.replace(/^docker:/, "") ?? agent.slug;
      return `docker pull ${image}`;
    }
    case "GITHUB_OPENCLEW":
    case "GITHUB_MCP":
    case "GITHUB_A2A": {
      if (agent.url?.includes("github.com")) {
        const match = agent.url.match(/github\.com[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/);
        const repo = match?.[1] ?? "";
        if (repo) return `git clone https://github.com/${repo}.git`;
      }
      return null;
    }
    default:
      return null;
  }
}

function getPopularityLabel(agent: Agent): string {
  const github = agent.githubData ?? {};
  const npm = agent.npmData ?? {};

  if (github.stars != null && github.stars > 0) {
    return `⭐ ${github.stars} stars`;
  }
  if (typeof npm.downloads === "number" && npm.downloads > 0) {
    const n = npm.downloads;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M downloads`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k downloads`;
    return `${n} downloads`;
  }
  if (agent.popularityScore != null && agent.popularityScore > 0) {
    return `Popularity ${agent.popularityScore}/100`;
  }
  return "";
}

export function AgentPageClient({ agent }: AgentPageClientProps) {
  const searchParams = useSearchParams();
  const forceDetails = searchParams.get("view") === "details";
  const from = searchParams.get("from");
  const safeFrom = from && from.startsWith("/") && !from.startsWith("//") ? from : null;
  const claimHref = safeFrom
    ? `/agent/${agent.slug}/claim?from=${encodeURIComponent(safeFrom)}`
    : `/agent/${agent.slug}/claim`;

  if (agent.hasCustomPage && agent.customPage && !forceDetails) {
    return (
      <div className="min-h-screen bg-[var(--bg-deep)]">
        <div className="relative max-w-5xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <BackToSearchLink from={safeFrom} />
            {agent.claimStatus !== "CLAIMED" && (
              <a
                href={claimHref}
                className="inline-flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--accent-heart)] transition-colors"
              >
                Claim this agent
              </a>
            )}
          </div>

          <ClaimBanner
            slug={agent.slug}
            claimStatus={agent.claimStatus ?? "UNCLAIMED"}
            isOwner={agent.isOwner ?? false}
            claimHref={claimHref}
          />

          <header className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <div className="flex items-start gap-3 mb-2 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-bold text-[var(--text-primary)] tracking-tight">
                {agent.name}
              </h1>
              {agent.claimStatus === "CLAIMED" && (
                <OwnerBadge claimedByName={agent.claimedByName} size="sm" />
              )}
              <VerificationTierBadge tier={agent.verificationTier} size="sm" />
            </div>
            <p className="text-sm text-[var(--text-tertiary)]">
              This is a developer-customized page rendered in a secure sandbox.
            </p>
          </header>

          <CustomAgentPage
            agentSlug={agent.slug}
            code={{
              html: agent.customPage.html,
              css: agent.customPage.css,
              js: agent.customPage.js,
            }}
            className="w-full min-h-[75vh] rounded-xl border border-[var(--border)] bg-white"
          />
        </div>
      </div>
    );
  }

  if (agent.homepage && !forceDetails) {
    return (
      <AgentHomepageEmbed
        agent={{
          name: agent.name,
          slug: agent.slug,
          homepage: agent.homepage,
          description: agent.description,
          source: agent.source,
          url: agent.url,
          claimStatus: agent.claimStatus,
        }}
        from={safeFrom}
      />
    );
  }

  const caps = Array.isArray(agent.capabilities) ? agent.capabilities : [];
  const protos = Array.isArray(agent.protocols) ? agent.protocols : [];
  const langs = Array.isArray(agent.languages) ? agent.languages : [];
  const openclaw = agent.openclawData ?? {};
  const params = openclaw.parameters && Object.keys(openclaw.parameters).length > 0
    ? openclaw.parameters
    : null;
  const examples = Array.isArray(openclaw.examples) && openclaw.examples.length > 0
    ? openclaw.examples
    : null;
  const deps = Array.isArray(openclaw.dependencies) && openclaw.dependencies.length > 0
    ? openclaw.dependencies
    : null;
  const perms = Array.isArray(openclaw.permissions) && openclaw.permissions.length > 0
    ? openclaw.permissions
    : null;
  const codeSnippets = Array.isArray(agent.codeSnippets) ? agent.codeSnippets : [];
  const primaryCta = getPrimaryCta(agent);
  const installCmd = getInstallCommand(agent);
  const popularityLabel = getPopularityLabel(agent);

  const hasNpmInfo = agent.source === "NPM" && agent.npmData;

  return (
    <div className="min-h-screen bg-[var(--bg-deep)]">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--accent-heart)]/[0.08] via-transparent to-transparent" />
        <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-[var(--accent-neural)]/[0.04] rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-0 w-[32rem] h-[32rem] bg-[var(--accent-heart)]/[0.03] rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <BackToSearchLink from={safeFrom} />
          {(agent.claimStatus ?? "UNCLAIMED") !== "CLAIMED" && (
            <a
              href={claimHref}
              className="inline-flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--accent-heart)] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Claim this agent
            </a>
          )}
        </div>

        <ClaimBanner
          slug={agent.slug}
          claimStatus={agent.claimStatus ?? "UNCLAIMED"}
          isOwner={agent.isOwner ?? false}
          claimHref={claimHref}
        />

        {/* Hero */}
        <header className="mb-12">
          <div className="flex items-start gap-3 mb-3 flex-wrap">
            <h1 className="text-4xl md:text-5xl font-bold text-[var(--text-primary)] tracking-tight">
              {agent.name}
            </h1>
            {agent.claimStatus === "CLAIMED" && (
              <OwnerBadge claimedByName={agent.claimedByName} />
            )}
            <VerificationTierBadge tier={agent.verificationTier} />
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            {agent.source && <SourceBadge source={agent.source} />}
            {protos.map((p) => (
              <ProtocolBadge key={p} protocol={p} />
            ))}
          </div>
          {agent.description && (
            <p className="text-lg text-[var(--text-secondary)] mb-6 max-w-2xl leading-relaxed">
              {agent.description}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-6 mb-6 text-sm">
            <SafetyBadge score={agent.safetyScore} />
            {popularityLabel && <span className="text-[var(--text-tertiary)]">{popularityLabel}</span>}
          </div>
          {caps.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {caps.map((c) => (
                <span
                  key={c}
                  className="px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] text-sm text-[var(--text-secondary)] border border-[var(--border)]"
                >
                  {c}
                </span>
              ))}
            </div>
          )}
          {langs.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {langs.map((l) => (
                <span
                  key={l}
                  className="px-2.5 py-0.5 rounded text-xs font-medium bg-[var(--accent-teal)]/10 text-[var(--accent-teal)] border border-[var(--accent-teal)]/20"
                >
                  {l}
                </span>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <a
              href={primaryCta.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/90 rounded-xl font-semibold text-white transition-colors shadow-lg shadow-[var(--accent-heart)]/20 hover:shadow-[var(--accent-heart)]/30"
            >
              {primaryCta.label}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
            {agent.homepage && (
              <a
                href={agent.homepage}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:border-[var(--accent-heart)]/40 hover:bg-[var(--bg-card)] transition-colors"
              >
                Homepage
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )}
            <a
              href={`/dashboard/jobs?agent=${encodeURIComponent(agent.slug)}&title=${encodeURIComponent(`Hire ${agent.name}`)}`}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:border-[var(--accent-neural)]/40 hover:bg-[var(--bg-card)] transition-colors"
            >
              Marketplace
            </a>
          </div>
        </header>

        {/* Custom links from owner */}
        {agent.customLinks && agent.customLinks.length > 0 && (
          <section className="mb-8">
            <div className="flex flex-wrap gap-2">
              {agent.customLinks.map((link, i) => (
                <a
                  key={i}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] text-sm text-[var(--text-secondary)] hover:border-[var(--accent-heart)]/40 transition-colors"
                >
                  {link.label}
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Install / Get section */}
        {installCmd && (
          <section className="mb-12">
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">Install</h2>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
              <InstallCommand command={installCmd} />
            </div>
          </section>
        )}

        {/* Documentation */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">
            {agent.readme ? "Documentation" : "Overview"}
          </h2>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 md:p-8 min-w-0 overflow-hidden">
            {agent.readme ? (
              <SkillMarkdown content={agent.readme} />
            ) : agent.description ? (
              <p className="text-[var(--text-secondary)] leading-relaxed">{agent.description}</p>
            ) : codeSnippets.length > 0 ? (
              <div className="space-y-4">
                <p className="text-[var(--text-tertiary)] italic mb-4">Code snippets:</p>
                {codeSnippets.slice(0, 5).map((snippet, i) => (
                  <pre
                    key={i}
                    className="p-4 rounded-lg bg-black/50 border border-[var(--border)] font-mono text-sm text-[var(--text-secondary)] overflow-x-auto whitespace-pre min-w-0"
                  >
                    {snippet}
                  </pre>
                ))}
              </div>
            ) : (
              <p className="text-[var(--text-tertiary)] italic">No documentation available.</p>
            )}
          </div>
        </section>

        {/* Examples */}
        {examples && examples.length > 0 && (
          <section className="mb-8 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">Examples</h2>
            <div className="space-y-4">
              {examples.map((ex, i) => (
                <pre
                  key={i}
                  className="p-4 rounded-lg bg-black/50 border border-[var(--border)] font-mono text-sm text-[var(--text-secondary)] overflow-x-auto overflow-y-auto max-h-[24rem] whitespace-pre min-w-0"
                >
                  {ex}
                </pre>
              ))}
            </div>
          </section>
        )}

        {/* Structured metadata blocks */}
        <div className="grid gap-6 md:grid-cols-2">
          {params && (
            <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
              <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Parameters</h3>
              <div className="space-y-3">
                {Object.entries(params).map(([name, spec]) => (
                  <div key={name} className="pb-3 border-b border-[var(--border)] last:border-0">
                    <div className="flex items-center gap-2 mb-1">
                      <code className="text-sm font-mono text-[var(--accent-teal)] bg-[var(--bg-elevated)] px-2 py-0.5 rounded">
                        {name}
                      </code>
                      <span className="text-xs text-[var(--text-quaternary)]">{spec.type}</span>
                      {spec.required && (
                        <span className="text-xs text-[var(--accent-warning)]">required</span>
                      )}
                    </div>
                    {spec.description && (
                      <p className="text-sm text-[var(--text-secondary)]">{spec.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {hasNpmInfo && (
            <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
              <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">npm package</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono text-[var(--accent-teal)] bg-[var(--bg-elevated)] px-2 py-0.5 rounded">
                    {agent.npmData!.packageName ?? agent.name}
                  </code>
                  {agent.npmData!.version && (
                    <span className="text-xs text-[var(--text-quaternary)]">v{agent.npmData!.version}</span>
                  )}
                </div>
                <a
                  href={`https://www.npmjs.com/package/${encodeURIComponent(agent.npmData!.packageName ?? agent.name)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[var(--accent-heart)] hover:underline"
                >
                  View on npm →
                </a>
              </div>
            </section>
          )}

          {deps && (
            <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
              <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Dependencies</h3>
              <ul className="space-y-2">
                {deps.map((d) => (
                  <li key={d} className="text-[var(--text-secondary)]">
                    <code className="text-sm font-mono text-[var(--accent-teal)] bg-[var(--bg-elevated)] px-2 py-0.5 rounded">
                      {d}
                    </code>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {perms && (
            <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
              <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Permissions</h3>
              <ul className="space-y-2">
                {perms.map((p) => (
                  <li key={p} className="text-[var(--text-secondary)]">
                    <code className="text-sm font-mono text-[var(--accent-purple)] bg-[var(--bg-elevated)] px-2 py-0.5 rounded">
                      {p}
                    </code>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
