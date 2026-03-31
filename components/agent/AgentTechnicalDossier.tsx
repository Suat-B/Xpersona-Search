import React from "react";
import Link from "next/link";
import Image from "next/image";
import { AgentMiniCard } from "@/components/agent/AgentMiniCard";
import { BackToSearchLink } from "@/components/agent/BackToSearchLink";
import { CustomAgentPage } from "@/components/agent/CustomAgentPage";
import { InstallCommand } from "@/components/agent/InstallCommand";
import { OwnerBadge } from "@/components/agent/OwnerBadge";
import { SkillMarkdown } from "@/components/agent/SkillMarkdown";
import { SourceBadge } from "@/components/agent/SourceBadge";
import { VerificationTierBadge } from "@/components/agent/VerificationTierBadge";
import { ProtocolBadge } from "@/components/search/ProtocolBadge";
import { SafetyBadge } from "@/components/search/SafetyBadge";
import { InlineBotAd } from "@/components/ads/InlineBotAd";
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

interface AgentTechnicalDossierProps {
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

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatPercent(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const normalized = value <= 1 ? value * 100 : value;
  return `${normalized.toFixed(normalized >= 10 ? 0 : 1)}%`;
}

function formatUsd(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: value >= 1 ? 2 : 4 }).format(value);
}

function labelize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1 text-xs text-[var(--text-secondary)]">{children}</span>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4"><p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">{label}</p><p className="mt-2 text-base font-semibold text-[var(--text-primary)]">{value}</p></div>;
}

function EvidencePill({ evidence }: { evidence: DossierEvidence }) {
  const tone = evidence.verified ? "border-[#30d158]/30 bg-[#30d158]/10 text-[#30d158]" : evidence.emptyReason ? "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-tertiary)]" : "border-[var(--accent-warning)]/30 bg-[var(--accent-warning)]/10 text-[var(--accent-warning)]";
  const label = evidence.verified ? "Verified" : evidence.emptyReason ? "Missing" : "Self-declared";
  return <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em] ${tone}`}>{label}<span className="normal-case tracking-normal">{evidence.source}</span></span>;
}

function EmptyState({ message }: { message: string | null | undefined }) {
  return message ? <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-card)] p-4 text-sm text-[var(--text-tertiary)]">{message}</div> : null;
}

function ExternalLink({ link, emphasized = false }: { link: DossierLink; emphasized?: boolean }) {
  const cls = emphasized ? "bg-[var(--accent-heart)] text-white" : "border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)]";
  return <a href={link.url} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold ${cls}`}>{link.label}</a>;
}

function Section({ id, title, subtitle, evidence, children }: { id: string; title: string; subtitle: string; evidence: DossierEvidence; children: React.ReactNode }) {
  return <section id={id} className="rounded-[2rem] border border-[var(--border)] bg-[linear-gradient(180deg,var(--bg-card),var(--bg-elevated))] p-5 md:p-6"><div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-2xl font-semibold text-[var(--text-primary)]">{title}</h2><p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">{subtitle}</p></div><EvidencePill evidence={evidence} /></div>{children}</section>;
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return <div className="space-y-2"><p className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">{label}</p><pre className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-black/40 p-4 text-xs text-[var(--text-secondary)]">{JSON.stringify(value, null, 2)}</pre></div>;
}

export function AgentTechnicalDossier({ dossier, from, publicEvidence }: AgentTechnicalDossierProps) {
  const actionHref = dossier.summary.isOwner ? `/agent/${dossier.slug}/manage` : from ? `/agent/${dossier.slug}/claim?from=${encodeURIComponent(from)}` : `/agent/${dossier.slug}/claim`;
  const actionLabel = dossier.summary.isOwner ? "Manage page" : dossier.claimStatus === "CLAIMED" ? null : "Claim this agent";
  const facts = publicEvidence?.facts ?? [];
  const events = publicEvidence?.changeEvents ?? [];
  const groups = FACT_ORDER.map((category) => ({ category, items: facts.filter((fact) => fact.category === category) })).filter((group) => group.items.length > 0);
  const chips = summarizeReliabilityChips(dossier);
  const stats = summarizeReliabilityStats(dossier);
  const heroStats = publicEvidence?.card.stats ?? [];
  const highlights = publicEvidence?.card.highlights ?? [];
  const nav = [["summary", "Executive Summary"], ["ledger", "Evidence Ledger"], ["timeline", "Timeline"], ["artifacts", "Artifacts Archive"], ["docs", "Docs & README"], ["api", "Contract & API"], ["reliability", "Reliability"], ["media", "Media & Demo"], ["alternatives", "Related Agents"], ["appendix", "Machine Appendix"]] as const;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackToSearchLink from={from} />
        {actionLabel ? <Link href={actionHref} className="inline-flex items-center gap-2 rounded-full border border-[var(--accent-heart)]/30 bg-[var(--accent-heart)]/10 px-4 py-2 text-sm font-medium text-[var(--accent-heart)]">{actionLabel}</Link> : null}
      </div>

      <header className="overflow-hidden rounded-[2rem] border border-[var(--border)] bg-[radial-gradient(circle_at_top_left,rgba(255,112,138,0.18),transparent_34%),radial-gradient(circle_at_top_right,rgba(0,194,168,0.12),transparent_24%),linear-gradient(180deg,var(--bg-card),var(--bg-elevated))] p-6 md:p-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <Pill>Agent Dossier</Pill>
              <SourceBadge source={dossier.source} />
              {dossier.claimStatus === "CLAIMED" ? <OwnerBadge claimedByName={dossier.summary.claimedByName} /> : null}
              <VerificationTierBadge tier={dossier.verificationTier} />
              <SafetyBadge score={dossier.summary.safetyScore} />
            </div>
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-[var(--text-primary)] md:text-5xl">{dossier.name}</h1>
              <p className="mt-4 max-w-4xl text-base leading-relaxed text-[var(--text-secondary)] md:text-lg">{dossier.summary.description}</p>
            </div>
            {dossier.coverage.protocols.length > 0 ? <div className="flex flex-wrap gap-2">{dossier.coverage.protocols.map((item) => <div key={item.protocol} className="flex items-center gap-2"><ProtocolBadge protocol={item.protocol} /><Pill>{item.status}</Pill></div>)}</div> : null}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Public facts" value={String(facts.length)} />
              <Stat label="Change events" value={String(events.length)} />
              <Stat label="Artifacts" value={String(dossier.artifacts.extractedFiles.length + dossier.media.assets.length)} />
              <Stat label="Freshness" value={formatDate(dossier.release.lastVerifiedAt) ?? formatDate(dossier.release.lastCrawledAt) ?? formatDate(dossier.release.lastUpdatedAt) ?? "Unknown"} />
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]/85 p-5">
              <div className="mb-3 flex flex-wrap items-center gap-3"><EvidencePill evidence={dossier.summary.evidence} />{chips.map((chip) => <Pill key={chip}>{chip}</Pill>)}</div>
              <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{dossier.summary.evidenceSummary}</p>
            </div>
            {highlights.length > 0 ? <div className="flex flex-wrap gap-2">{highlights.map((item) => <Pill key={item}>{item}</Pill>)}</div> : null}
            {heroStats.length > 0 ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{heroStats.map((item) => <Stat key={`${item.label}-${item.value}`} label={item.label} value={item.value} />)}</div> : null}
          </div>
          <aside className="h-fit rounded-[1.75rem] border border-[var(--border)] bg-[var(--bg-card)]/90 p-5 xl:sticky xl:top-24">
            <div className="space-y-5">
              <div><p className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Dossier Map</p><div className="mt-3 flex flex-col gap-2 text-sm">{nav.map(([id, label]) => <a key={id} href={`#${id}`} className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[var(--text-secondary)]">{label}</a>)}</div></div>
              <div className="grid gap-3"><Stat label="Coverage" value={`${dossier.coverage.verifiedCount} verified | ${dossier.coverage.selfDeclaredCount} profile`} /><Stat label="Adoption" value={dossier.adoption.tractionLabel ?? "No adoption data"} /><Stat label="Benchmark suites" value={String(dossier.benchmarks.suites.length)} /></div>
              {stats.length > 0 ? <div className="grid gap-3">{stats.map((item) => <Stat key={item.label} label={item.label} value={item.value} />)}</div> : <EmptyState message={dossier.reliability.evidence.emptyReason} />}
            </div>
          </aside>
        </div>
      </header>

      {dossier.ownerResources.customPage ? <section className="rounded-[2rem] border border-[var(--border)] bg-[linear-gradient(180deg,var(--bg-card),var(--bg-elevated))] p-5 md:p-6"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Claimed page</p><h2 className="text-2xl font-semibold text-[var(--text-primary)]">Custom technical brief</h2></div>{dossier.ownerResources.customPageUpdatedAt ? <span className="text-sm text-[var(--text-tertiary)]">Updated {formatDate(dossier.ownerResources.customPageUpdatedAt)}</span> : null}</div><CustomAgentPage agentSlug={dossier.slug} code={dossier.ownerResources.customPage} className="min-h-[32rem] w-full rounded-2xl border border-[var(--border)] bg-white" /></section> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Section id="summary" title="Executive Summary" subtitle="Key links, install path, and a quick operational read before the deeper crawl record." evidence={dossier.summary.evidence}>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-4"><div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5"><p className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Summary</p><p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">{dossier.summary.evidenceSummary}</p></div>{dossier.summary.primaryLinks.length > 0 ? <div className="flex flex-wrap gap-3">{dossier.summary.primaryLinks.map((link, index) => <ExternalLink key={`${link.label}-${link.url}`} link={link} emphasized={index === 0} />)}</div> : null}</div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5"><p className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Setup snapshot</p>{dossier.summary.installCommand ? <div className="mt-4"><InstallCommand command={dossier.summary.installCommand} label="Copy install" /></div> : null}<ol className="mt-4 space-y-3">{dossier.execution.setupSteps.map((step, index) => <li key={`${step}-${index}`} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--bg-elevated)] text-xs font-medium text-[var(--text-primary)]">{index + 1}</span><p className="pt-0.5 text-sm leading-relaxed text-[var(--text-secondary)]">{step}</p></li>)}</ol></div>
            </div>
          </Section>

          <InlineBotAd position="after-summary" />

          <Section id="ledger" title="Evidence Ledger" subtitle="Everything public we have scraped or crawled about this agent, grouped by evidence type with provenance." evidence={dossier.summary.evidence}>
            {groups.length > 0 ? <div className="space-y-4">{groups.map((group, index) => <details key={group.category} open={index < 2} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4"><summary className="cursor-pointer text-lg font-semibold text-[var(--text-primary)]">{labelize(group.category)} ({group.items.length})</summary><div className="mt-4 grid gap-3 lg:grid-cols-2">{group.items.map((fact) => <div key={`${fact.factKey}-${fact.value}-${fact.sourceUrl}`} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">{fact.label}</p><p className="mt-2 text-base font-semibold text-[var(--text-primary)]">{fact.value}</p></div><div className="flex flex-wrap gap-2"><Pill>{fact.sourceType}</Pill><Pill>{fact.confidence}</Pill></div></div><div className="mt-3 flex flex-wrap gap-3 text-xs text-[var(--text-tertiary)]"><span>Observed {formatDate(fact.observedAt) ?? "unknown"}</span>{fact.href ? <a className="text-[var(--accent-heart)] hover:underline" href={fact.href} target="_blank" rel="noopener noreferrer">Source link</a> : null}{fact.sourceUrl ? <a className="hover:text-[var(--text-primary)] hover:underline" href={fact.sourceUrl} target="_blank" rel="noopener noreferrer">Provenance</a> : null}</div></div>)}</div></details>)}</div> : <EmptyState message="No public facts are available for this agent yet." />}
          </Section>

          <Section id="timeline" title="Release & Crawl Timeline" subtitle="Merged public release, docs, artifact, benchmark, pricing, and trust refresh events." evidence={dossier.release.evidence}>
            {events.length > 0 ? <div className="grid gap-3 lg:grid-cols-2">{events.map((event) => <a key={`${event.eventType}-${event.title}-${event.observedAt ?? "na"}`} href={event.href ?? undefined} target={event.href ? "_blank" : undefined} rel={event.href ? "noopener noreferrer" : undefined} className="block"><div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">{labelize(event.eventType)}</p><p className="mt-2 text-base font-semibold text-[var(--text-primary)]">{event.title}</p></div><div className="flex flex-wrap gap-2"><Pill>{event.sourceType}</Pill><Pill>{event.confidence}</Pill></div></div>{event.description ? <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">{event.description}</p> : null}<p className="mt-3 text-xs text-[var(--text-tertiary)]">Observed {formatDate(event.observedAt) ?? "unknown"}</p></div></a>)}</div> : <EmptyState message={dossier.release.evidence.emptyReason} />}
          </Section>

          <Section id="artifacts" title="Artifacts Archive" subtitle="Extracted files, examples, snippets, parameters, dependencies, permissions, and artifact metadata." evidence={dossier.artifacts.evidence}>
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Extracted files" value={String(dossier.artifacts.extractedFiles.length)} /><Stat label="Examples" value={String(dossier.artifacts.executableExamples.length)} /><Stat label="Snippets" value={String(dossier.artifacts.codeSnippets.length)} /><Stat label="Languages" value={dossier.artifacts.languages.join(", ") || "Unknown"} /></div>
              {dossier.artifacts.parameters ? <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5"><p className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Parameters</p><div className="mt-4 grid gap-3 lg:grid-cols-2">{Object.entries(dossier.artifacts.parameters).map(([name, spec]) => <div key={name} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4"><div className="flex flex-wrap items-center gap-2"><code className="rounded bg-[var(--bg-card)] px-2 py-0.5 text-xs text-[var(--text-primary)]">{name}</code><span className="text-xs text-[var(--text-tertiary)]">{spec.type}</span>{spec.required ? <span className="text-xs text-[var(--accent-warning)]">required</span> : null}</div>{spec.description ? <p className="mt-3 text-sm text-[var(--text-secondary)]">{spec.description}</p> : null}</div>)}</div></div> : null}
              {dossier.artifacts.dependencies.length > 0 || dossier.artifacts.permissions.length > 0 ? <div className="grid gap-4 md:grid-cols-2"><div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5"><p className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Dependencies</p><div className="mt-4 flex flex-wrap gap-2">{dossier.artifacts.dependencies.length > 0 ? dossier.artifacts.dependencies.map((item) => <code key={item} className="rounded-lg bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--text-secondary)]">{item}</code>) : <span className="text-sm text-[var(--text-tertiary)]">No dependencies captured.</span>}</div></div><div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5"><p className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Permissions</p><div className="mt-4 flex flex-wrap gap-2">{dossier.artifacts.permissions.length > 0 ? dossier.artifacts.permissions.map((item) => <code key={item} className="rounded-lg bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--text-secondary)]">{item}</code>) : <span className="text-sm text-[var(--text-tertiary)]">No permissions captured.</span>}</div></div></div> : null}
              {dossier.artifacts.executableExamples.length > 0 ? <details open className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5"><summary className="cursor-pointer text-lg font-semibold text-[var(--text-primary)]">Executable Examples</summary><div className="mt-4 space-y-4">{dossier.artifacts.executableExamples.map((item, index) => <div key={`${item.language}-${index}`} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4"><p className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">{item.language}</p><pre className="mt-3 overflow-x-auto text-xs text-[var(--text-secondary)]">{item.snippet}</pre></div>)}</div></details> : null}
              {dossier.artifacts.codeSnippets.length > 0 ? <details className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5"><summary className="cursor-pointer text-lg font-semibold text-[var(--text-primary)]">Code Snippets</summary><div className="mt-4 space-y-4">{dossier.artifacts.codeSnippets.map((item, index) => <pre key={`${item.slice(0, 20)}-${index}`} className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 text-xs text-[var(--text-secondary)]">{item}</pre>)}</div></details> : null}
              {dossier.artifacts.extractedFiles.length > 0 ? <details className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5"><summary className="cursor-pointer text-lg font-semibold text-[var(--text-primary)]">Extracted Files</summary><div className="mt-4 space-y-4">{dossier.artifacts.extractedFiles.map((file) => <div key={file.path} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4"><p className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">{file.path}</p><pre className="mt-3 overflow-x-auto text-xs text-[var(--text-secondary)]">{file.content}</pre></div>)}</div></details> : null}
              <EmptyState message={dossier.artifacts.evidence.emptyReason} />
            </div>
          </Section>

          <InlineBotAd position="after-artifacts" />

          <Section id="docs" title="Docs & README" subtitle="Full documentation captured from public sources, including the complete README when available." evidence={dossier.artifacts.evidence}>
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2"><Stat label="Docs source" value={dossier.artifacts.docsSourceLabel ?? "Unknown"} /><Stat label="Editorial quality" value={dossier.artifacts.editorialQuality.status} /></div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5"><p className="text-sm leading-relaxed text-[var(--text-secondary)]">{dossier.artifacts.editorialOverview ?? dossier.artifacts.readmeExcerpt ?? dossier.artifacts.evidence.emptyReason ?? "No documentation captured."}</p></div>
              {dossier.artifacts.readme ? <details open className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5"><summary className="cursor-pointer text-lg font-semibold text-[var(--text-primary)]">Full README</summary><div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5"><SkillMarkdown content={dossier.artifacts.readme} /></div></details> : <EmptyState message={dossier.artifacts.evidence.emptyReason} />}
            </div>
          </Section>

          <Section id="api" title="Contract & API" subtitle="Machine endpoints, protocol fit, contract coverage, invocation examples, and guardrails for agent-to-agent use." evidence={dossier.execution.evidence}>
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5"><p className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Endpoints</p><div className="mt-4 space-y-2 text-sm"><a className="block text-[var(--accent-heart)] hover:underline" href={dossier.execution.endpoints.dossierUrl} target="_blank" rel="noopener noreferrer">Dossier API</a><a className="block text-[var(--accent-heart)] hover:underline" href={dossier.execution.endpoints.snapshotUrl} target="_blank" rel="noopener noreferrer">Snapshot API</a><a className="block text-[var(--accent-heart)] hover:underline" href={dossier.execution.endpoints.contractUrl} target="_blank" rel="noopener noreferrer">Contract API</a><a className="block text-[var(--accent-heart)] hover:underline" href={dossier.execution.endpoints.trustUrl} target="_blank" rel="noopener noreferrer">Trust API</a></div></div><div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5"><p className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Contract coverage</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><Stat label="Status" value={dossier.execution.contract.contractStatus} /><Stat label="Auth" value={dossier.execution.contract.authModes.join(", ") || "None"} /><Stat label="Streaming" value={dossier.execution.contract.supportsStreaming ? "Yes" : "No"} /><Stat label="Data region" value={dossier.execution.contract.dataRegion ?? "Unspecified"} /></div></div></div>
              <div className="grid gap-4 md:grid-cols-2"><div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5"><p className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Protocol support</p><div className="mt-4 flex flex-wrap gap-2">{dossier.coverage.protocols.length > 0 ? dossier.coverage.protocols.map((item) => <Pill key={item.protocol}>{item.label}: {item.status}</Pill>) : <span className="text-sm text-[var(--text-tertiary)]">No protocol metadata captured.</span>}</div><p className="mt-4 text-sm text-[var(--text-secondary)]">Requires: {dossier.execution.contract.requires.join(", ") || "none"}</p><p className="mt-2 text-sm text-[var(--text-secondary)]">Forbidden: {dossier.execution.contract.forbidden.join(", ") || "none"}</p></div><div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5"><p className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Guardrails</p><p className="mt-4 text-sm text-[var(--text-secondary)]">Operational confidence: {dossier.reliability.decisionGuardrails.operationalConfidence}</p><div className="mt-4 space-y-2">{dossier.reliability.decisionGuardrails.safeUseWhen.length > 0 ? dossier.reliability.decisionGuardrails.safeUseWhen.map((item) => <div key={item} className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-secondary)]">{item}</div>) : <span className="text-sm text-[var(--text-tertiary)]">No positive guardrails captured.</span>}</div></div></div>
              {dossier.execution.invocationGuide.curlExamples.length > 0 ? <details open className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5"><summary className="cursor-pointer text-lg font-semibold text-[var(--text-primary)]">Invocation examples</summary><div className="mt-4 grid gap-4 md:grid-cols-2">{dossier.execution.invocationGuide.curlExamples.map((curl) => <pre key={curl} className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-black/40 p-4 text-xs text-[var(--text-secondary)]">{curl}</pre>)}</div></details> : null}
            </div>
          </Section>

          <Section id="reliability" title="Reliability & Benchmarks" subtitle="Trust and runtime signals, benchmark suites, failure patterns, and practical risk constraints." evidence={dossier.reliability.evidence}>
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2"><div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5"><p className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Trust signals</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><Stat label="Handshake" value={dossier.reliability.trust.handshakeStatus} /><Stat label="Confidence" value={dossier.reliability.trust.trustConfidence} /><Stat label="Attempts 30d" value={String(dossier.reliability.trust.attempts30d ?? "unknown")} /><Stat label="Fallback rate" value={formatPercent(dossier.reliability.trust.fallbackRate) ?? "unknown"} /></div></div><div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5"><p className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Runtime metrics</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><Stat label="Observed P50" value={dossier.reliability.executionMetrics.observedLatencyMsP50 != null ? `${dossier.reliability.executionMetrics.observedLatencyMsP50} ms` : "unknown"} /><Stat label="Observed P95" value={dossier.reliability.executionMetrics.observedLatencyMsP95 != null ? `${dossier.reliability.executionMetrics.observedLatencyMsP95} ms` : "unknown"} /><Stat label="Rate limit" value={dossier.reliability.executionMetrics.rateLimitRpm != null ? `${dossier.reliability.executionMetrics.rateLimitRpm} rpm` : "unknown"} /><Stat label="Estimated cost" value={formatUsd(dossier.reliability.executionMetrics.estimatedCostUsd) ?? "unknown"} /></div></div></div>
              {dossier.reliability.decisionGuardrails.doNotUseIf.length > 0 ? <div className="rounded-2xl border border-[var(--accent-warning)]/20 bg-[var(--accent-warning)]/5 p-5"><p className="text-sm font-medium text-[var(--accent-warning)]">Do not use if</p><div className="mt-3 space-y-2">{dossier.reliability.decisionGuardrails.doNotUseIf.map((item) => <div key={item} className="rounded-xl border border-[var(--accent-warning)]/15 bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-secondary)]">{item}</div>)}</div></div> : null}
              {dossier.benchmarks.suites.length > 0 ? <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]"><table className="min-w-full text-sm"><thead className="bg-[var(--bg-elevated)] text-left text-[var(--text-tertiary)]"><tr><th className="px-4 py-3">Suite</th><th className="px-4 py-3">Score</th><th className="px-4 py-3">Accuracy</th><th className="px-4 py-3">Latency</th><th className="px-4 py-3">Cost</th></tr></thead><tbody>{dossier.benchmarks.suites.map((suite) => <tr key={`${suite.suiteName}-${suite.createdAt}`} className="border-t border-[var(--border)]"><td className="px-4 py-3 text-[var(--text-primary)]">{suite.suiteName}</td><td className="px-4 py-3 text-[var(--text-secondary)]">{suite.score}</td><td className="px-4 py-3 text-[var(--text-secondary)]">{formatPercent(suite.accuracy) ?? "unknown"}</td><td className="px-4 py-3 text-[var(--text-secondary)]">{suite.latencyMs != null ? `${suite.latencyMs} ms` : "unknown"}</td><td className="px-4 py-3 text-[var(--text-secondary)]">{formatUsd(suite.costUsd) ?? "unknown"}</td></tr>)}</tbody></table></div> : <EmptyState message={dossier.benchmarks.evidence.emptyReason} />}
              {dossier.benchmarks.failurePatterns.length > 0 ? <div className="flex flex-wrap gap-2">{dossier.benchmarks.failurePatterns.map((item) => <Pill key={`${item.type}-${item.lastSeen}`}>{item.type}: {item.frequency}</Pill>)}</div> : null}
            </div>
          </Section>

          <InlineBotAd position="after-reliability" />

          <Section id="media" title="Media & Demo" subtitle="Every public screenshot, visual asset, demo link, and owner-provided destination tied to this agent." evidence={dossier.media.evidence}>
            <div className="space-y-4">
              {dossier.media.primaryImageUrl ? <Image src={dossier.media.primaryImageUrl} alt={`${dossier.name} preview`} width={1600} height={900} unoptimized className="max-h-[28rem] w-full rounded-2xl border border-[var(--border)] object-cover" /> : null}
              {dossier.media.assets.length > 0 ? <div className="grid gap-4 md:grid-cols-2">{dossier.media.assets.map((asset) => <a key={asset.url} href={asset.url} target="_blank" rel="noopener noreferrer" className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold text-[var(--text-primary)]">{asset.title ?? asset.assetKind}</p><p className="mt-1 text-sm text-[var(--text-secondary)]">{asset.caption ?? asset.altText ?? "Open media asset"}</p></div><Pill>{asset.assetKind}</Pill></div></a>)}</div> : <EmptyState message={dossier.media.evidence.emptyReason} />}
              {(dossier.ownerResources.customLinks.length > 0 || Object.values(dossier.ownerResources.structuredLinks).some(Boolean)) ? <div className="flex flex-wrap gap-3">{dossier.ownerResources.customLinks.map((link) => <ExternalLink key={`${link.label}-${link.url}`} link={link} />)}{Object.entries(dossier.ownerResources.structuredLinks).flatMap(([kind, url]) => url ? [<ExternalLink key={`${kind}-${url}`} link={{ label: kind.replace(/Url$/, "").replace(/^./, (v) => v.toUpperCase()), url, kind: kind.replace(/Url$/, "") as DossierLink["kind"] }} />] : [])}</div> : null}
            </div>
          </Section>

          <Section id="alternatives" title="Related Agents" subtitle="Neighboring agents from the same protocol and source ecosystem for comparison and shortlist building." evidence={dossier.relatedAgents.evidence}>
            {dossier.relatedAgents.items.length > 0 ? <div className="grid gap-4 md:grid-cols-2">{dossier.relatedAgents.items.map((item) => <AgentMiniCard key={item.id} agent={item} />)}</div> : <EmptyState message={dossier.relatedAgents.evidence.emptyReason} />}
            <div className="mt-4 flex flex-wrap gap-3 text-sm"><Link href={dossier.relatedAgents.links.hub} className="text-[var(--accent-heart)] hover:underline">Agent hub</Link><Link href={dossier.relatedAgents.links.source} className="text-[var(--accent-heart)] hover:underline">More from this source</Link>{dossier.relatedAgents.links.protocols.map((item) => <Link key={item.href} href={item.href} className="text-[var(--accent-heart)] hover:underline">{item.label} agents</Link>)}</div>
          </Section>

          <details id="appendix" className="rounded-[2rem] border border-[var(--border)] bg-[linear-gradient(180deg,var(--bg-card),var(--bg-elevated))] p-5 md:p-6">
            <summary className="cursor-pointer text-2xl font-semibold text-[var(--text-primary)]">Machine Appendix</summary>
            <div className="mt-5 grid gap-4">
              <JsonBlock label="Contract JSON" value={dossier.execution.contract} />
              <JsonBlock label="Invocation Guide" value={dossier.execution.invocationGuide} />
              <JsonBlock label="Trust JSON" value={dossier.reliability.trust} />
              <JsonBlock label="Capability Matrix" value={dossier.coverage.capabilityMatrix} />
              <JsonBlock label="Facts JSON" value={facts} />
              <JsonBlock label="Change Events JSON" value={events} />
            </div>
          </details>
        </div>
        <div className="hidden xl:block" />
      </div>
    </div>
  );
}
