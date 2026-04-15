import React from "react";
import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { AgentMiniCard } from "@/components/agent/AgentMiniCard";
import { BackToSearchLink } from "@/components/agent/BackToSearchLink";
import { CustomAgentPage } from "@/components/agent/CustomAgentPage";
import { InstallCommand } from "@/components/agent/InstallCommand";
import { SkillMarkdown } from "@/components/agent/SkillMarkdown";
import type {
  PublicAgentEvidencePack,
  PublicAgentFactCategory,
} from "@/lib/agents/public-facts";
import {
  summarizeReliabilityChips,
  summarizeReliabilityStats,
  type AgentDossier,
  type DossierEvidence,
  type DossierLink,
} from "@/lib/agents/agent-dossier";
import { sourceDisplayLabel } from "@/lib/search/source-taxonomy";

interface AgentMinimalDossierProps {
  dossier: AgentDossier;
  from?: string | null;
  publicEvidence?: PublicAgentEvidencePack | null;
}

const FACT_ORDER: PublicAgentFactCategory[] = [
  "identity",
  "vendor",
  "compatibility",
  "artifact",
  "release",
  "adoption",
  "security",
  "pricing",
  "benchmark",
  "integration",
  "learning_asset",
];

const PAGE_THEME: CSSProperties = {
  ["--bg-deep" as string]: "#f5f5f7",
  ["--bg-card" as string]: "rgba(255, 255, 255, 0.9)",
  ["--bg-elevated" as string]: "rgba(246, 246, 248, 0.94)",
  ["--text-primary" as string]: "#1d1d1f",
  ["--text-secondary" as string]: "rgba(29, 29, 31, 0.78)",
  ["--text-tertiary" as string]: "rgba(29, 29, 31, 0.56)",
  ["--text-quaternary" as string]: "rgba(29, 29, 31, 0.36)",
  ["--border" as string]: "rgba(15, 23, 42, 0.07)",
  ["--accent-heart" as string]: "#0071e3",
  ["--accent-neural" as string]: "#5ac8fa",
  ["--accent-success" as string]: "#248a3d",
  ["--accent-warning" as string]: "#b26a00",
  ["--accent-danger" as string]: "#c9342f",
  ["--accent-purple" as string]: "#6e56cf",
  ["--accent-teal" as string]: "#0f9488",
};

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatPercent(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const normalized = value <= 1 ? value * 100 : value;
  return `${normalized.toFixed(normalized >= 10 ? 0 : 1)}%`;
}

function formatUsd(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1 ? 2 : 4,
  }).format(value);
}

function labelize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function dedupeLinks<T extends { url: string }>(links: T[]): T[] {
  const seen = new Set<string>();
  return links.filter((link) => {
    const normalized = link.url.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function formatVerificationTier(tier: string): string | null {
  const normalized = tier.trim().toUpperCase();
  if (!normalized || normalized === "NONE") return null;
  return `${normalized.toLowerCase().replace(/^./, (value) => value.toUpperCase())} verified`;
}

function formatSafetyLabel(score: number): string {
  return `Safety ${score}/100`;
}

function formatProtocolSupport(item: { label: string; status: string }): string {
  return `${item.label} · ${item.status}`;
}

function Surface({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[1.75rem] border border-[var(--border)] bg-[var(--bg-card)] shadow-[0_10px_28px_rgba(15,23,42,0.035)] ${className}`.trim()}
    >
      {children}
    </div>
  );
}

function SimplePill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "blue" | "green" | "gold";
}) {
  const toneClass =
    tone === "blue"
      ? "border-[var(--accent-heart)]/12 bg-[var(--accent-heart)]/[0.06] text-[var(--accent-heart)]"
      : tone === "green"
        ? "border-[#248a3d]/12 bg-[#248a3d]/[0.06] text-[#248a3d]"
        : tone === "gold"
          ? "border-[#8b6a18]/12 bg-[#8b6a18]/[0.06] text-[#8b6a18]"
          : "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]";
  return (
    <span
      className={`rounded-full border px-3 py-1 text-[11px] font-medium tracking-[0.01em] ${toneClass}`.trim()}
    >
      {children}
    </span>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.35rem] border border-[var(--border)] bg-white/78 px-4 py-4">
      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
        {label}
      </p>
      <p className="mt-2 text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
        {value}
      </p>
    </div>
  );
}

function EvidencePill({ evidence }: { evidence: DossierEvidence }) {
  const tone = evidence.verified
    ? "border-[#248a3d]/20 bg-[#248a3d]/8 text-[#248a3d]"
    : evidence.emptyReason
      ? "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-tertiary)]"
      : "border-[#b26a00]/20 bg-[#b26a00]/8 text-[#b26a00]";
  const label = evidence.verified ? "Verified" : evidence.emptyReason ? "Missing" : "Self-declared";

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${tone}`.trim()}
    >
      {label}
      <span className="normal-case tracking-normal">{evidence.source}</span>
    </span>
  );
}

function EmptyState({ message }: { message: string | null | undefined }) {
  return message ? (
    <div className="rounded-[1.4rem] border border-dashed border-[var(--border)] bg-[var(--bg-elevated)] p-4 text-sm text-[var(--text-tertiary)]">
      {message}
    </div>
  ) : null;
}

function ExternalLink({
  link,
  emphasized = false,
}: {
  link: DossierLink;
  emphasized?: boolean;
}) {
  const classes = emphasized
    ? "border-transparent bg-[#1d1d1f] text-white shadow-[0_10px_24px_rgba(29,29,31,0.14)]"
    : "border-[var(--border)] bg-white/80 text-[var(--text-primary)]";

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium transition-colors hover:border-[var(--accent-heart)]/25 ${classes}`.trim()}
    >
      {link.label}
    </a>
  );
}

function ProgressiveSection({
  id,
  title,
  summary,
  evidence,
  defaultOpen = false,
  children,
}: {
  id: string;
  title: string;
  summary: string;
  evidence: DossierEvidence;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      id={id}
      open={defaultOpen}
      className="group rounded-[1.9rem] border border-[var(--border)] bg-[var(--bg-card)] shadow-[0_12px_34px_rgba(15,23,42,0.035)]"
    >
      <summary className="list-none cursor-pointer px-5 py-5 md:px-6 [&::-webkit-details-marker]:hidden">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <h2 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
              {title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{summary}</p>
          </div>
          <div className="flex items-center gap-3">
            <EvidencePill evidence={evidence} />
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-tertiary)] transition-transform group-open:rotate-180">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path
                  d="M6 9l6 6 6-6"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </div>
        </div>
      </summary>
      <div className="space-y-5 border-t border-[var(--border)] px-5 py-5 md:px-6">{children}</div>
    </details>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
        {label}
      </p>
      <pre className="overflow-x-auto rounded-[1.35rem] border border-[var(--border)] bg-[#16181d] p-4 text-xs text-slate-200">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function SectionCard({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[1.5rem] border border-[var(--border)] bg-white/78 p-5">
      {eyebrow ? (
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
          {eyebrow}
        </p>
      ) : null}
      <h3 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">{title}</h3>
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  );
}

export function AgentMinimalDossier({
  dossier,
  from,
  publicEvidence,
}: AgentMinimalDossierProps) {
  const actionHref = dossier.summary.isOwner
    ? `/agent/${dossier.slug}/manage`
    : from
      ? `/agent/${dossier.slug}/claim?from=${encodeURIComponent(from)}`
      : `/agent/${dossier.slug}/claim`;
  const actionLabel = dossier.summary.isOwner
    ? "Manage page"
    : dossier.claimStatus === "CLAIMED"
      ? null
      : "Claim this agent";
  const facts = publicEvidence?.facts ?? [];
  const events = publicEvidence?.changeEvents ?? [];
  const factsByCategory = FACT_ORDER.map((category) => ({
    category,
    items: facts.filter((fact) => fact.category === category),
  })).filter((group) => group.items.length > 0);
  const highlights = publicEvidence?.card.highlights ?? [];
  const chips = summarizeReliabilityChips(dossier);
  const reliabilityStats = summarizeReliabilityStats(dossier);
  const primaryLinks = dedupeLinks(dossier.summary.primaryLinks);
  const ownerLinks = dedupeLinks([
    ...dossier.ownerResources.customLinks,
    ...(dossier.ownerResources.structuredLinks.docsUrl
      ? [{ label: "Docs", url: dossier.ownerResources.structuredLinks.docsUrl, kind: "docs" as const }]
      : []),
    ...(dossier.ownerResources.structuredLinks.demoUrl
      ? [{ label: "Demo", url: dossier.ownerResources.structuredLinks.demoUrl, kind: "demo" as const }]
      : []),
    ...(dossier.ownerResources.structuredLinks.supportUrl
      ? [{ label: "Support", url: dossier.ownerResources.structuredLinks.supportUrl, kind: "support" as const }]
      : []),
    ...(dossier.ownerResources.structuredLinks.pricingUrl
      ? [{ label: "Pricing", url: dossier.ownerResources.structuredLinks.pricingUrl, kind: "pricing" as const }]
      : []),
    ...(dossier.ownerResources.structuredLinks.statusUrl
      ? [{ label: "Status", url: dossier.ownerResources.structuredLinks.statusUrl, kind: "status" as const }]
      : []),
  ]);
  const summaryText = [dossier.summary.description, dossier.summary.evidenceSummary]
    .filter(Boolean)
    .join(" ");
  const bestFor =
    dossier.reliability.decisionGuardrails.safeUseWhen[0] ??
    `${dossier.name} is best for ${
      dossier.coverage.capabilities.slice(0, 3).map((item) => item.label).join(", ") ||
      "general automation"
    } workflows where ${
      dossier.coverage.protocols.slice(0, 2).map((item) => item.label).join(" and ") ||
      "documented"
    } compatibility matters.`;
  const notIdealFor =
    dossier.reliability.decisionGuardrails.doNotUseIf[0] ??
    `${dossier.name} is not ideal for teams that need stronger public trust telemetry, lower setup complexity, or more explicit contract coverage before production rollout.`;
  const evidenceSources = [
    dossier.summary.evidence.source,
    dossier.execution.evidence.source,
    dossier.reliability.evidence.source,
    publicEvidence ? "public facts pack" : null,
  ].filter((value): value is string => Boolean(value));
  const freshnessLabel =
    formatDate(dossier.release.lastVerifiedAt) ??
    formatDate(dossier.release.lastCrawledAt) ??
    formatDate(dossier.release.lastUpdatedAt) ??
    "Unknown";
  const heroStats = [
    {
      label: "Overall rank",
      value: dossier.summary.overallRank > 0 ? `#${Math.round(dossier.summary.overallRank)}` : "Unranked",
    },
    {
      label: "Adoption",
      value: dossier.adoption.tractionLabel ?? "No public adoption signal",
    },
    {
      label: "Trust",
      value:
        dossier.summary.trustScore != null
          ? dossier.summary.trustScore.toFixed(2)
          : dossier.reliability.trust.reputationScore != null
            ? String(dossier.reliability.trust.reputationScore)
            : "Unknown",
    },
    { label: "Freshness", value: freshnessLabel },
  ];
  const nav = [
    ["overview", "Overview"],
    ["evidence-timeline", "Evidence & Timeline"],
    ["artifacts-docs", "Artifacts & Docs"],
    ["api-reliability", "API & Reliability"],
    ["media-related", "Media & Related"],
    ["appendix", "Machine Appendix"],
  ] as const;

  return (
    <div style={PAGE_THEME} className="font-[var(--font-inter)] text-[var(--text-primary)]">
      <div className="overflow-hidden rounded-[2.4rem] border border-white/20 bg-[linear-gradient(180deg,#fbfbfd,#f6f6f8_38%,#f2f2f5)] shadow-[0_24px_72px_rgba(15,23,42,0.08)]">
        <div className="bg-[radial-gradient(circle_at_top_left,rgba(0,113,227,0.10),transparent_34%),radial-gradient(circle_at_85%_0%,rgba(90,200,250,0.08),transparent_22%)] px-4 py-5 md:px-10 md:py-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <BackToSearchLink from={from} />
            {actionLabel ? (
              <Link
                href={actionHref}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--accent-heart)]/20 bg-[var(--accent-heart)] px-4 py-2 text-sm font-medium text-white shadow-[0_12px_24px_rgba(0,113,227,0.16)] transition-opacity hover:opacity-95"
              >
                {actionLabel}
              </Link>
            ) : null}
          </div>

          <header className="mt-6">
            <Surface className="overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(255,255,255,0.84))] p-6 md:p-10">
              <div className="flex flex-wrap items-center gap-2">
                <SimplePill>Agent Dossier</SimplePill>
                <SimplePill>{sourceDisplayLabel(dossier.source)}</SimplePill>
                {dossier.claimStatus === "CLAIMED" ? (
                  <SimplePill tone="green">
                    {dossier.summary.claimedByName ? `Owner · ${dossier.summary.claimedByName}` : "Verified owner"}
                  </SimplePill>
                ) : null}
                {formatVerificationTier(dossier.verificationTier) ? (
                  <SimplePill tone="gold">{formatVerificationTier(dossier.verificationTier)}</SimplePill>
                ) : null}
                <SimplePill tone="blue">{formatSafetyLabel(dossier.summary.safetyScore)}</SimplePill>
              </div>

              <div className="mt-8 max-w-4xl">
                <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                  Xpersona Agent
                </p>
                <h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] text-[var(--text-primary)] md:text-[4.4rem] md:leading-[1.02]">
                  {dossier.name}
                </h1>
                <p className="mt-5 max-w-3xl text-[15px] leading-7 text-[var(--text-secondary)] md:text-[19px] md:leading-8">
                  {dossier.summary.description}
                </p>
              </div>

              {dossier.coverage.protocols.length > 0 ? (
                <div className="mt-6 flex flex-wrap gap-2">
                  {dossier.coverage.protocols.map((item) => (
                    <SimplePill key={item.protocol}>{formatProtocolSupport(item)}</SimplePill>
                  ))}
                </div>
              ) : null}

              {highlights.length > 0 ? (
                <div className="mt-6 flex flex-wrap gap-2">
                  {highlights.map((highlight) => (
                    <SimplePill key={highlight}>{highlight}</SimplePill>
                  ))}
                </div>
              ) : null}

              <div className="mt-8 flex flex-wrap gap-3">
                {primaryLinks.map((link, index) => (
                  <ExternalLink
                    key={`${link.label}-${link.url}`}
                    link={link}
                    emphasized={index === 0}
                  />
                ))}
              </div>

              {dossier.summary.installCommand ? (
                <div className="mt-8 max-w-3xl">
                  <InstallCommand command={dossier.summary.installCommand} label="Copy install" />
                </div>
              ) : null}

              <div className="mt-9 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {heroStats.map((stat) => (
                  <SummaryStat key={stat.label} label={stat.label} value={stat.value} />
                ))}
              </div>
            </Surface>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Surface className="p-5">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                  Freshness
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                  Last checked {freshnessLabel}
                </p>
              </Surface>
              <Surface className="p-5">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                  Best For
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{bestFor}</p>
              </Surface>
              <Surface className="p-5">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                  Not Ideal For
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                  {notIdealFor}
                </p>
              </Surface>
              <Surface className="p-5">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                  Evidence Sources Checked
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                  {evidenceSources.join(", ")}
                </p>
              </Surface>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {nav.map(([id, label]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="rounded-full border border-[var(--border)] bg-white/72 px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-white hover:text-[var(--text-primary)]"
                >
                  {label}
                </a>
              ))}
            </div>
          </header>

          {dossier.ownerResources.customPage ? (
            <section className="mt-6">
              <Surface className="p-5 md:p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      Claimed page
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">
                      Custom technical brief
                    </h2>
                  </div>
                  {dossier.ownerResources.customPageUpdatedAt ? (
                    <span className="text-sm text-[var(--text-tertiary)]">
                      Updated {formatDate(dossier.ownerResources.customPageUpdatedAt)}
                    </span>
                  ) : null}
                </div>
                <CustomAgentPage
                  agentSlug={dossier.slug}
                  code={dossier.ownerResources.customPage}
                  className="min-h-[32rem] w-full rounded-[1.5rem] border border-[var(--border)] bg-white"
                />
              </Surface>
            </section>
          ) : null}

          <div className="mt-6 space-y-5">
            <ProgressiveSection
              id="overview"
              title="Overview"
              summary="Key links, install path, reliability highlights, and the shortest practical read before diving into the crawl record."
              evidence={dossier.summary.evidence}
              defaultOpen
            >
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
                <SectionCard title="Executive Summary" eyebrow="Overview">
                  <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{summaryText}</p>
                  <div className="flex flex-wrap gap-2">
                    {chips.map((chip) => (
                      <SimplePill key={chip}>{chip}</SimplePill>
                    ))}
                  </div>
                  {publicEvidence?.card.stats?.length ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {publicEvidence.card.stats.map((item) => (
                        <SummaryStat key={`${item.label}-${item.value}`} label={item.label} value={item.value} />
                      ))}
                    </div>
                  ) : null}
                </SectionCard>

                <SectionCard title="Setup Snapshot" eyebrow="Install & run">
                  {dossier.execution.installCommand ? (
                    <InstallCommand command={dossier.execution.installCommand} label="Copy" />
                  ) : null}
                  <ol className="space-y-3">
                    {dossier.execution.setupSteps.map((step, index) => (
                      <li key={`${step}-${index}`} className="flex gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--bg-elevated)] text-xs font-medium text-[var(--text-primary)]">
                          {index + 1}
                        </span>
                        <p className="pt-0.5 text-sm leading-relaxed text-[var(--text-secondary)]">{step}</p>
                      </li>
                    ))}
                  </ol>
                </SectionCard>
              </div>

              {reliabilityStats.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {reliabilityStats.map((stat) => (
                    <SummaryStat key={stat.label} label={stat.label} value={stat.value} />
                  ))}
                </div>
              ) : null}
            </ProgressiveSection>

            <ProgressiveSection
              id="evidence-timeline"
              title="Evidence & Timeline"
              summary="Public facts grouped by evidence type, plus release and crawl events with provenance and freshness."
              evidence={dossier.summary.evidence}
            >
              <SectionCard title="Evidence Ledger" eyebrow="Public facts">
                {factsByCategory.length > 0 ? (
                  <div className="space-y-4">
                    {factsByCategory.map((group, index) => (
                      <details
                        key={group.category}
                        open={index === 0}
                        className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--bg-elevated)] p-4"
                      >
                        <summary className="cursor-pointer list-none text-base font-semibold text-[var(--text-primary)] [&::-webkit-details-marker]:hidden">
                          {labelize(group.category)} ({group.items.length})
                        </summary>
                        <div className="mt-4 grid gap-3 lg:grid-cols-2">
                          {group.items.map((fact) => (
                            <div
                              key={`${fact.factKey}-${fact.value}-${fact.sourceUrl}`}
                              className="rounded-[1.25rem] border border-[var(--border)] bg-white/78 p-4"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                                    {fact.label}
                                  </p>
                                  <p className="mt-2 text-base font-semibold text-[var(--text-primary)]">
                                    {fact.value}
                                  </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <SimplePill>{fact.sourceType}</SimplePill>
                                  <SimplePill>{fact.confidence}</SimplePill>
                                </div>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-3 text-xs text-[var(--text-tertiary)]">
                                <span>Observed {formatDate(fact.observedAt) ?? "unknown"}</span>
                                {fact.href ? (
                                  <a
                                    className="text-[var(--accent-heart)] hover:underline"
                                    href={fact.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    Source link
                                  </a>
                                ) : null}
                                {fact.sourceUrl ? (
                                  <a
                                    className="hover:text-[var(--text-primary)] hover:underline"
                                    href={fact.sourceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    Provenance
                                  </a>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                ) : (
                  <EmptyState message="No public facts are available for this agent yet." />
                )}
              </SectionCard>

              <SectionCard title="Release & Crawl Timeline" eyebrow="Events">
                {events.length > 0 ? (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {events.map((event) => (
                      <a
                        key={`${event.eventType}-${event.title}-${event.observedAt ?? "na"}`}
                        href={event.href ?? undefined}
                        target={event.href ? "_blank" : undefined}
                        rel={event.href ? "noopener noreferrer" : undefined}
                        className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--bg-elevated)] p-4 transition-colors hover:border-[var(--accent-heart)]/20"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                              {labelize(event.eventType)}
                            </p>
                            <p className="mt-2 text-base font-semibold text-[var(--text-primary)]">
                              {event.title}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <SimplePill>{event.sourceType}</SimplePill>
                            <SimplePill>{event.confidence}</SimplePill>
                          </div>
                        </div>
                        {event.description ? (
                          <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
                            {event.description}
                          </p>
                        ) : null}
                        <p className="mt-3 text-xs text-[var(--text-tertiary)]">
                          Observed {formatDate(event.observedAt) ?? "unknown"}
                        </p>
                      </a>
                    ))}
                  </div>
                ) : (
                  <EmptyState message={dossier.release.evidence.emptyReason} />
                )}
              </SectionCard>
            </ProgressiveSection>

            <ProgressiveSection
              id="artifacts-docs"
              title="Artifacts & Docs"
              summary="Parameters, dependencies, examples, extracted files, editorial overview, and the complete README when available."
              evidence={dossier.artifacts.evidence}
            >
              <SectionCard title="Artifacts Archive" eyebrow="Captured outputs">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <SummaryStat label="Extracted files" value={String(dossier.artifacts.extractedFiles.length)} />
                  <SummaryStat label="Examples" value={String(dossier.artifacts.executableExamples.length)} />
                  <SummaryStat label="Snippets" value={String(dossier.artifacts.codeSnippets.length)} />
                  <SummaryStat
                    label="Languages"
                    value={dossier.artifacts.languages.join(", ") || "Unknown"}
                  />
                </div>

                {dossier.artifacts.parameters ? (
                  <div className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      Parameters
                    </p>
                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      {Object.entries(dossier.artifacts.parameters).map(([name, spec]) => (
                        <div
                          key={name}
                          className="rounded-[1.15rem] border border-[var(--border)] bg-white/78 p-4"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <code className="rounded bg-[var(--bg-elevated)] px-2 py-0.5 text-xs text-[var(--text-primary)]">
                              {name}
                            </code>
                            <span className="text-xs text-[var(--text-tertiary)]">{spec.type}</span>
                            {spec.required ? (
                              <span className="text-xs text-[var(--accent-warning)]">required</span>
                            ) : null}
                          </div>
                          {spec.description ? (
                            <p className="mt-3 text-sm text-[var(--text-secondary)]">
                              {spec.description}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {dossier.artifacts.dependencies.length > 0 || dossier.artifacts.permissions.length > 0 ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                        Dependencies
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {dossier.artifacts.dependencies.length > 0 ? (
                          dossier.artifacts.dependencies.map((item) => (
                            <code
                              key={item}
                              className="rounded-lg bg-white/84 px-2 py-1 text-xs text-[var(--text-secondary)]"
                            >
                              {item}
                            </code>
                          ))
                        ) : (
                          <span className="text-sm text-[var(--text-tertiary)]">
                            No dependencies captured.
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                        Permissions
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {dossier.artifacts.permissions.length > 0 ? (
                          dossier.artifacts.permissions.map((item) => (
                            <code
                              key={item}
                              className="rounded-lg bg-white/84 px-2 py-1 text-xs text-[var(--text-secondary)]"
                            >
                              {item}
                            </code>
                          ))
                        ) : (
                          <span className="text-sm text-[var(--text-tertiary)]">
                            No permissions captured.
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}

                {dossier.artifacts.executableExamples.length > 0 ? (
                  <details className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                    <summary className="cursor-pointer list-none text-base font-semibold text-[var(--text-primary)] [&::-webkit-details-marker]:hidden">
                      Executable Examples
                    </summary>
                    <div className="mt-4 space-y-4">
                      {dossier.artifacts.executableExamples.map((item, index) => (
                        <div
                          key={`${item.language}-${index}`}
                          className="rounded-[1.15rem] border border-[var(--border)] bg-[#16181d] p-4"
                        >
                          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                            {item.language}
                          </p>
                          <pre className="mt-3 overflow-x-auto text-xs text-slate-200">
                            {item.snippet}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}

                {dossier.artifacts.codeSnippets.length > 0 ? (
                  <details className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                    <summary className="cursor-pointer list-none text-base font-semibold text-[var(--text-primary)] [&::-webkit-details-marker]:hidden">
                      Code Snippets
                    </summary>
                    <div className="mt-4 space-y-4">
                      {dossier.artifacts.codeSnippets.map((item, index) => (
                        <pre
                          key={`${item.slice(0, 20)}-${index}`}
                          className="overflow-x-auto rounded-[1.15rem] border border-[var(--border)] bg-[#16181d] p-4 text-xs text-slate-200"
                        >
                          {item}
                        </pre>
                      ))}
                    </div>
                  </details>
                ) : null}

                {dossier.artifacts.extractedFiles.length > 0 ? (
                  <details className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                    <summary className="cursor-pointer list-none text-base font-semibold text-[var(--text-primary)] [&::-webkit-details-marker]:hidden">
                      Extracted Files
                    </summary>
                    <div className="mt-4 space-y-4">
                      {dossier.artifacts.extractedFiles.map((file) => (
                        <div
                          key={file.path}
                          className="rounded-[1.15rem] border border-[var(--border)] bg-[#16181d] p-4"
                        >
                          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                            {file.path}
                          </p>
                          <pre className="mt-3 overflow-x-auto text-xs text-slate-200">
                            {file.content}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}

                <EmptyState message={dossier.artifacts.evidence.emptyReason} />
              </SectionCard>

              <SectionCard title="Docs & README" eyebrow="Editorial read">
                <div className="grid gap-4 md:grid-cols-2">
                  <SummaryStat label="Docs source" value={dossier.artifacts.docsSourceLabel ?? "Unknown"} />
                  <SummaryStat
                    label="Editorial quality"
                    value={dossier.artifacts.editorialQuality.status}
                  />
                </div>
                <div className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                  <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                    {dossier.artifacts.editorialOverview ??
                      dossier.artifacts.readmeExcerpt ??
                      dossier.artifacts.evidence.emptyReason ??
                      "No documentation captured."}
                  </p>
                </div>
                {dossier.artifacts.readme ? (
                  <details className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                    <summary className="cursor-pointer list-none text-base font-semibold text-[var(--text-primary)] [&::-webkit-details-marker]:hidden">
                      Full README
                    </summary>
                    <div className="mt-4 rounded-[1.25rem] border border-[var(--border)] bg-white/78 p-5">
                      <SkillMarkdown content={dossier.artifacts.readme} />
                    </div>
                  </details>
                ) : (
                  <EmptyState message={dossier.artifacts.evidence.emptyReason} />
                )}
              </SectionCard>
            </ProgressiveSection>

            <ProgressiveSection
              id="api-reliability"
              title="API & Reliability"
              summary="Machine endpoints, contract coverage, trust signals, runtime metrics, benchmarks, and guardrails for agent-to-agent use."
              evidence={dossier.execution.evidence}
            >
              <SectionCard title="Contract & API" eyebrow="Machine interfaces">
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      Endpoints
                    </p>
                    <div className="mt-4 space-y-2 text-sm">
                      <a
                        className="block text-[var(--accent-heart)] hover:underline"
                        href={dossier.execution.endpoints.dossierUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Dossier API
                      </a>
                      <a
                        className="block text-[var(--accent-heart)] hover:underline"
                        href={dossier.execution.endpoints.snapshotUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Snapshot API
                      </a>
                      <a
                        className="block text-[var(--accent-heart)] hover:underline"
                        href={dossier.execution.endpoints.contractUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Contract API
                      </a>
                      <a
                        className="block text-[var(--accent-heart)] hover:underline"
                        href={dossier.execution.endpoints.trustUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Trust API
                      </a>
                    </div>
                  </div>

                  <div className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      Contract coverage
                    </p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <SummaryStat label="Status" value={dossier.execution.contract.contractStatus} />
                      <SummaryStat
                        label="Auth"
                        value={dossier.execution.contract.authModes.join(", ") || "None"}
                      />
                      <SummaryStat
                        label="Streaming"
                        value={dossier.execution.contract.supportsStreaming ? "Yes" : "No"}
                      />
                      <SummaryStat
                        label="Data region"
                        value={dossier.execution.contract.dataRegion ?? "Unspecified"}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      Protocol support
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {dossier.coverage.protocols.length > 0 ? (
                        dossier.coverage.protocols.map((item) => (
                          <SimplePill key={item.protocol}>
                            {item.label}: {item.status}
                          </SimplePill>
                        ))
                      ) : (
                        <span className="text-sm text-[var(--text-tertiary)]">
                          No protocol metadata captured.
                        </span>
                      )}
                    </div>
                    <p className="mt-4 text-sm text-[var(--text-secondary)]">
                      Requires: {dossier.execution.contract.requires.join(", ") || "none"}
                    </p>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                      Forbidden: {dossier.execution.contract.forbidden.join(", ") || "none"}
                    </p>
                  </div>

                  <div className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      Guardrails
                    </p>
                    <p className="mt-4 text-sm text-[var(--text-secondary)]">
                      Operational confidence:{" "}
                      {dossier.reliability.decisionGuardrails.operationalConfidence}
                    </p>
                    <div className="mt-4 space-y-2">
                      {dossier.reliability.decisionGuardrails.safeUseWhen.length > 0 ? (
                        dossier.reliability.decisionGuardrails.safeUseWhen.map((item) => (
                          <div
                            key={item}
                            className="rounded-xl border border-[var(--border)] bg-white/78 px-3 py-2 text-sm text-[var(--text-secondary)]"
                          >
                            {item}
                          </div>
                        ))
                      ) : (
                        <span className="text-sm text-[var(--text-tertiary)]">
                          No positive guardrails captured.
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {dossier.execution.invocationGuide.curlExamples.length > 0 ? (
                  <details className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                    <summary className="cursor-pointer list-none text-base font-semibold text-[var(--text-primary)] [&::-webkit-details-marker]:hidden">
                      Invocation examples
                    </summary>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      {dossier.execution.invocationGuide.curlExamples.map((curl) => (
                        <pre
                          key={curl}
                          className="overflow-x-auto rounded-[1.15rem] border border-[var(--border)] bg-[#16181d] p-4 text-xs text-slate-200"
                        >
                          {curl}
                        </pre>
                      ))}
                    </div>
                  </details>
                ) : null}
              </SectionCard>

              <SectionCard title="Reliability & Benchmarks" eyebrow="Operational fit">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      Trust signals
                    </p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <SummaryStat label="Handshake" value={dossier.reliability.trust.handshakeStatus} />
                      <SummaryStat label="Confidence" value={dossier.reliability.trust.trustConfidence} />
                      <SummaryStat
                        label="Attempts 30d"
                        value={String(dossier.reliability.trust.attempts30d ?? "unknown")}
                      />
                      <SummaryStat
                        label="Fallback rate"
                        value={formatPercent(dossier.reliability.trust.fallbackRate) ?? "unknown"}
                      />
                    </div>
                  </div>

                  <div className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      Runtime metrics
                    </p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <SummaryStat
                        label="Observed P50"
                        value={
                          dossier.reliability.executionMetrics.observedLatencyMsP50 != null
                            ? `${dossier.reliability.executionMetrics.observedLatencyMsP50} ms`
                            : "unknown"
                        }
                      />
                      <SummaryStat
                        label="Observed P95"
                        value={
                          dossier.reliability.executionMetrics.observedLatencyMsP95 != null
                            ? `${dossier.reliability.executionMetrics.observedLatencyMsP95} ms`
                            : "unknown"
                        }
                      />
                      <SummaryStat
                        label="Rate limit"
                        value={
                          dossier.reliability.executionMetrics.rateLimitRpm != null
                            ? `${dossier.reliability.executionMetrics.rateLimitRpm} rpm`
                            : "unknown"
                        }
                      />
                      <SummaryStat
                        label="Estimated cost"
                        value={
                          formatUsd(dossier.reliability.executionMetrics.estimatedCostUsd) ?? "unknown"
                        }
                      />
                    </div>
                  </div>
                </div>

                {dossier.reliability.decisionGuardrails.doNotUseIf.length > 0 ? (
                  <div className="rounded-[1.25rem] border border-[#b26a00]/18 bg-[#b26a00]/7 p-4">
                    <p className="text-sm font-medium text-[#b26a00]">Do not use if</p>
                    <div className="mt-3 space-y-2">
                      {dossier.reliability.decisionGuardrails.doNotUseIf.map((item) => (
                        <div
                          key={item}
                          className="rounded-xl border border-[#b26a00]/12 bg-white/78 px-3 py-2 text-sm text-[var(--text-secondary)]"
                        >
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {dossier.benchmarks.suites.length > 0 ? (
                  <div className="overflow-x-auto rounded-[1.25rem] border border-[var(--border)] bg-[var(--bg-elevated)]">
                    <table className="min-w-full text-sm">
                      <thead className="bg-white/70 text-left text-[var(--text-tertiary)]">
                        <tr>
                          <th className="px-4 py-3">Suite</th>
                          <th className="px-4 py-3">Score</th>
                          <th className="px-4 py-3">Accuracy</th>
                          <th className="px-4 py-3">Latency</th>
                          <th className="px-4 py-3">Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dossier.benchmarks.suites.map((suite) => (
                          <tr
                            key={`${suite.suiteName}-${suite.createdAt}`}
                            className="border-t border-[var(--border)]"
                          >
                            <td className="px-4 py-3 text-[var(--text-primary)]">{suite.suiteName}</td>
                            <td className="px-4 py-3 text-[var(--text-secondary)]">{suite.score}</td>
                            <td className="px-4 py-3 text-[var(--text-secondary)]">
                              {formatPercent(suite.accuracy) ?? "unknown"}
                            </td>
                            <td className="px-4 py-3 text-[var(--text-secondary)]">
                              {suite.latencyMs != null ? `${suite.latencyMs} ms` : "unknown"}
                            </td>
                            <td className="px-4 py-3 text-[var(--text-secondary)]">
                              {formatUsd(suite.costUsd) ?? "unknown"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState message={dossier.benchmarks.evidence.emptyReason} />
                )}

                {dossier.benchmarks.failurePatterns.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {dossier.benchmarks.failurePatterns.map((item) => (
                      <SimplePill key={`${item.type}-${item.lastSeen}`}>
                        {item.type}: {item.frequency}
                      </SimplePill>
                    ))}
                  </div>
                ) : null}
              </SectionCard>
            </ProgressiveSection>

            <ProgressiveSection
              id="media-related"
              title="Media & Related"
              summary="Public screenshots, demo and owner links, plus neighboring agents from the same ecosystem for shortlist building."
              evidence={dossier.media.evidence}
            >
              <SectionCard title="Media & Demo" eyebrow="Visual context">
                {dossier.media.primaryImageUrl ? (
                  <Image
                    src={dossier.media.primaryImageUrl}
                    alt={`${dossier.name} preview`}
                    width={1600}
                    height={900}
                    unoptimized
                    className="max-h-[28rem] w-full rounded-[1.25rem] border border-[var(--border)] object-cover"
                  />
                ) : null}

                {dossier.media.assets.length > 0 ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {dossier.media.assets.map((asset) => (
                      <a
                        key={asset.url}
                        href={asset.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--bg-elevated)] p-4 transition-colors hover:border-[var(--accent-heart)]/20"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-[var(--text-primary)]">
                              {asset.title ?? asset.assetKind}
                            </p>
                            <p className="mt-1 text-sm text-[var(--text-secondary)]">
                              {asset.caption ?? asset.altText ?? "Open media asset"}
                            </p>
                          </div>
                          <SimplePill>{asset.assetKind}</SimplePill>
                        </div>
                      </a>
                    ))}
                  </div>
                ) : (
                  <EmptyState message={dossier.media.evidence.emptyReason} />
                )}

                {ownerLinks.length > 0 ? (
                  <div className="flex flex-wrap gap-3">
                    {ownerLinks.map((link) => (
                      <ExternalLink key={`${link.label}-${link.url}`} link={link} />
                    ))}
                  </div>
                ) : null}
              </SectionCard>

              <SectionCard title="Related Agents" eyebrow="Comparison set">
                {dossier.relatedAgents.items.length > 0 ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {dossier.relatedAgents.items.map((item) => (
                      <AgentMiniCard key={item.id} agent={item} />
                    ))}
                  </div>
                ) : (
                  <EmptyState message={dossier.relatedAgents.evidence.emptyReason} />
                )}

                <div className="flex flex-wrap gap-3 text-sm">
                  <Link href={dossier.relatedAgents.links.hub} className="text-[var(--accent-heart)] hover:underline">
                    Agent hub
                  </Link>
                  <Link
                    href={dossier.relatedAgents.links.source}
                    className="text-[var(--accent-heart)] hover:underline"
                  >
                    More from this source
                  </Link>
                  {dossier.relatedAgents.links.protocols.map((item) => (
                    <Link key={item.href} href={item.href} className="text-[var(--accent-heart)] hover:underline">
                      {item.label} agents
                    </Link>
                  ))}
                </div>
              </SectionCard>
            </ProgressiveSection>

            <ProgressiveSection
              id="appendix"
              title="Machine Appendix"
              summary="Raw contract, invocation, trust, capability, facts, and change-event payloads for machine-side inspection."
              evidence={dossier.execution.evidence}
            >
              <div className="grid gap-4">
                <JsonBlock label="Contract JSON" value={dossier.execution.contract} />
                <JsonBlock label="Invocation Guide" value={dossier.execution.invocationGuide} />
                <JsonBlock label="Trust JSON" value={dossier.reliability.trust} />
                <JsonBlock label="Capability Matrix" value={dossier.coverage.capabilityMatrix} />
                <JsonBlock label="Facts JSON" value={facts} />
                <JsonBlock label="Change Events JSON" value={events} />
              </div>
            </ProgressiveSection>
          </div>
        </div>
      </div>
    </div>
  );
}
