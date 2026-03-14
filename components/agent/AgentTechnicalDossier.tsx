import React, { type ReactNode } from "react";
import Link from "next/link";
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
}

function ExternalLink({ link, emphasized = false }: { link: DossierLink; emphasized?: boolean }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className={
        emphasized
          ? "inline-flex items-center gap-2 rounded-xl bg-[var(--accent-heart)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--accent-heart)]/90"
          : "inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] hover:border-[var(--accent-heart)]/40 hover:bg-[var(--bg-card)]"
      }
    >
      {link.label}
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
        />
      </svg>
    </a>
  );
}

function EvidencePill({ evidence }: { evidence: DossierEvidence }) {
  const tone = evidence.verified
    ? "border-[#30d158]/30 bg-[#30d158]/10 text-[#30d158]"
    : evidence.emptyReason
      ? "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-tertiary)]"
      : "border-[var(--accent-warning)]/30 bg-[var(--accent-warning)]/10 text-[var(--accent-warning)]";
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em] ${tone}`}>
      {evidence.verified ? "Verified" : evidence.emptyReason ? "Missing" : "Self-declared"}
      <span className="normal-case tracking-normal">{evidence.source}</span>
    </span>
  );
}

function SectionShell({
  id,
  title,
  evidence,
  children,
}: {
  id?: string;
  title: string;
  evidence: DossierEvidence;
  children: ReactNode;
}) {
  return (
    <section id={id} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">{title}</h2>
        <EvidencePill evidence={evidence} />
      </div>
      {children}
    </section>
  );
}

function EmptyState({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-elevated)] p-4 text-sm text-[var(--text-tertiary)]">
      {message}
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">{label}</p>
      <pre className="overflow-x-auto rounded-xl border border-[var(--border)] bg-black/40 p-4 text-xs text-[var(--text-secondary)]">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toLocaleString("en-US", {
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

function formatCompact(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: value >= 1_000 ? 1 : 0,
  }).format(value);
}

export function AgentTechnicalDossier({ dossier, from }: AgentTechnicalDossierProps) {
  const actionHref =
    dossier.summary.isOwner
      ? `/agent/${dossier.slug}/manage`
      : from
        ? `/agent/${dossier.slug}/claim?from=${encodeURIComponent(from)}`
        : `/agent/${dossier.slug}/claim`;
  const actionLabel = dossier.summary.isOwner
    ? "Manage page"
    : dossier.claimStatus === "CLAIMED"
      ? null
      : "Claim this agent";
  const summaryLinks = dossier.summary.primaryLinks.slice(0, 5);
  const reliabilityChips = summarizeReliabilityChips(dossier);
  const reliabilityStats = summarizeReliabilityStats(dossier);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackToSearchLink from={from} />
        {actionLabel ? (
          <Link
            href={actionHref}
            className="inline-flex items-center gap-2 text-sm font-medium text-[var(--accent-heart)] hover:text-[var(--accent-heart)]/90"
          >
            {actionLabel}
          </Link>
        ) : null}
      </div>

      <header className="rounded-3xl border border-[var(--border)] bg-[var(--bg-card)] p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-3xl space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                Technical Dossier
              </p>
              <SourceBadge source={dossier.source} />
              {dossier.claimStatus === "CLAIMED" ? (
                <OwnerBadge claimedByName={dossier.summary.claimedByName} />
              ) : null}
              <VerificationTierBadge tier={dossier.verificationTier} />
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <h1 className="text-4xl font-bold tracking-tight text-[var(--text-primary)] md:text-5xl">
                {dossier.name}
              </h1>
            </div>
            <div className="flex flex-wrap gap-2">
              {dossier.coverage.protocols.map((item) => (
                <div key={item.protocol} className="flex items-center gap-2">
                  <ProtocolBadge protocol={item.protocol} />
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] ${
                      item.status === "verified"
                        ? "bg-[#30d158]/10 text-[#30d158]"
                        : "bg-[var(--accent-warning)]/10 text-[var(--accent-warning)]"
                    }`}
                  >
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                {dossier.summary.descriptionLabel}
              </p>
              <p className="text-base leading-relaxed text-[var(--text-secondary)] md:text-lg">
                {dossier.summary.description}
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <EvidencePill evidence={dossier.summary.evidence} />
                <SafetyBadge score={dossier.summary.safetyScore} />
              </div>
              <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                {dossier.summary.evidenceSummary}
              </p>
            </div>
            {dossier.summary.installCommand ? (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                  Install
                </p>
                <InstallCommand command={dossier.summary.installCommand} />
              </div>
            ) : null}
            {summaryLinks.length > 0 ? (
              <div className="flex flex-wrap gap-3">
                {summaryLinks.map((link, index) => (
                  <ExternalLink key={`${link.label}-${link.url}`} link={link} emphasized={index === 0} />
                ))}
              </div>
            ) : null}
          </div>

          <aside className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 lg:sticky lg:top-24">
            <div className="space-y-5">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                  Evidence rail
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {reliabilityChips.map((chip) => (
                    <span
                      key={chip}
                      className="rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1 text-xs text-[var(--text-secondary)]"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                    Coverage
                  </p>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    {dossier.coverage.verifiedCount} verified, {dossier.coverage.selfDeclaredCount} self-declared
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                    Adoption
                  </p>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    {dossier.adoption.tractionLabel ?? dossier.adoption.evidence.emptyReason ?? "No adoption data"}
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                    Freshness
                  </p>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    {formatDate(dossier.release.lastVerifiedAt) ??
                      formatDate(dossier.release.lastCrawledAt) ??
                      formatDate(dossier.release.lastUpdatedAt) ??
                      "No freshness signal"}
                  </p>
                </div>
              </div>
              {reliabilityStats.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  {reliabilityStats.map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4"
                    >
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                        {stat.label}
                      </p>
                      <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">{stat.value}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState message={dossier.reliability.evidence.emptyReason} />
              )}
            </div>
          </aside>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          {dossier.ownerResources.customPage ? (
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 md:p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                    Claimed page
                  </p>
                  <h2 className="text-xl font-semibold text-[var(--text-primary)]">
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
                className="min-h-[32rem] w-full rounded-2xl border border-[var(--border)] bg-white"
              />
            </section>
          ) : null}

          <SectionShell id="execution" title="Execution Readiness" evidence={dossier.execution.evidence}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Contract status</p>
                <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">
                  {dossier.execution.contract.contractStatus}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1 text-xs text-[var(--text-secondary)]">
                    Auth: {dossier.execution.contract.authModes.join(", ") || "none"}
                  </span>
                  <span className="rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1 text-xs text-[var(--text-secondary)]">
                    Streaming: {dossier.execution.contract.supportsStreaming ? "yes" : "no"}
                  </span>
                </div>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Guardrails</p>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  Operational confidence: {dossier.reliability.decisionGuardrails.operationalConfidence}
                </p>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-[var(--text-secondary)]">
                  {dossier.reliability.decisionGuardrails.safeUseWhen.slice(0, 3).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
            {dossier.reliability.decisionGuardrails.doNotUseIf.length > 0 ? (
              <div className="mt-4 rounded-xl border border-[var(--accent-warning)]/20 bg-[var(--accent-warning)]/5 p-4">
                <p className="text-sm font-medium text-[var(--accent-warning)]">Do not use if</p>
                <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-[var(--text-secondary)]">
                  {dossier.reliability.decisionGuardrails.doNotUseIf.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </SectionShell>

          <SectionShell id="setup" title="Setup & Install" evidence={dossier.execution.evidence}>
            <div className="space-y-4">
              {dossier.execution.installCommand ? (
                <InstallCommand command={dossier.execution.installCommand} label="Copy install" />
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
            </div>
          </SectionShell>

          <SectionShell id="api" title="Contract & API" evidence={dossier.execution.evidence}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Endpoints</p>
                <div className="space-y-2 text-sm">
                  <a className="block text-[var(--accent-heart)] hover:underline" href={dossier.execution.endpoints.dossierUrl} target="_blank" rel="noopener noreferrer">Dossier API</a>
                  <a className="block text-[var(--accent-heart)] hover:underline" href={dossier.execution.endpoints.snapshotUrl} target="_blank" rel="noopener noreferrer">Snapshot API</a>
                  <a className="block text-[var(--accent-heart)] hover:underline" href={dossier.execution.endpoints.contractUrl} target="_blank" rel="noopener noreferrer">Contract API</a>
                  <a className="block text-[var(--accent-heart)] hover:underline" href={dossier.execution.endpoints.trustUrl} target="_blank" rel="noopener noreferrer">Trust API</a>
                </div>
              </div>
              <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Protocol support</p>
                <div className="flex flex-wrap gap-2">
                  {dossier.coverage.protocols.map((item) => (
                    <span
                      key={item.protocol}
                      className="rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1 text-xs text-[var(--text-secondary)]"
                    >
                      {item.label}: {item.status}
                    </span>
                  ))}
                </div>
                <p className="text-sm text-[var(--text-secondary)]">
                  Requires: {dossier.execution.contract.requires.join(", ") || "none"}
                </p>
                <p className="text-sm text-[var(--text-secondary)]">
                  Forbidden: {dossier.execution.contract.forbidden.join(", ") || "none"}
                </p>
              </div>
            </div>
            {dossier.execution.invocationGuide.curlExamples.length > 0 ? (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {dossier.execution.invocationGuide.curlExamples.slice(0, 2).map((curl) => (
                  <pre
                    key={curl}
                    className="overflow-x-auto rounded-xl border border-[var(--border)] bg-black/40 p-4 text-xs text-[var(--text-secondary)]"
                  >
                    {curl}
                  </pre>
                ))}
              </div>
            ) : null}
          </SectionShell>

          <SectionShell id="reliability" title="Reliability & Benchmarks" evidence={dossier.reliability.evidence}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Trust</p>
                <div className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
                  <p>Handshake: {dossier.reliability.trust.handshakeStatus}</p>
                  <p>Confidence: {dossier.reliability.trust.trustConfidence}</p>
                  <p>Attempts 30d: {dossier.reliability.trust.attempts30d ?? "unknown"}</p>
                  <p>Fallback rate: {formatPercent(dossier.reliability.trust.fallbackRate) ?? "unknown"}</p>
                </div>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Runtime metrics</p>
                <div className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
                  <p>Observed P50: {dossier.reliability.executionMetrics.observedLatencyMsP50 ?? "unknown"} ms</p>
                  <p>Observed P95: {dossier.reliability.executionMetrics.observedLatencyMsP95 ?? "unknown"} ms</p>
                  <p>Rate limit: {dossier.reliability.executionMetrics.rateLimitRpm ?? "unknown"} rpm</p>
                  <p>Estimated cost: {dossier.reliability.executionMetrics.estimatedCostUsd ?? "unknown"}</p>
                </div>
              </div>
            </div>
            {dossier.benchmarks.suites.length > 0 ? (
              <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--border)]">
                <table className="min-w-full text-sm">
                  <thead className="bg-[var(--bg-elevated)] text-left text-[var(--text-tertiary)]">
                    <tr>
                      <th className="px-4 py-3">Suite</th>
                      <th className="px-4 py-3">Score</th>
                      <th className="px-4 py-3">Latency</th>
                      <th className="px-4 py-3">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dossier.benchmarks.suites.map((suite) => (
                      <tr key={`${suite.suiteName}-${suite.createdAt}`} className="border-t border-[var(--border)]">
                        <td className="px-4 py-3 text-[var(--text-primary)]">{suite.suiteName}</td>
                        <td className="px-4 py-3 text-[var(--text-secondary)]">{suite.score}</td>
                        <td className="px-4 py-3 text-[var(--text-secondary)]">{suite.latencyMs ?? "unknown"} ms</td>
                        <td className="px-4 py-3 text-[var(--text-secondary)]">{suite.costUsd ?? "unknown"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-4">
                <EmptyState message={dossier.benchmarks.evidence.emptyReason} />
              </div>
            )}
            {dossier.benchmarks.failurePatterns.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {dossier.benchmarks.failurePatterns.map((pattern) => (
                  <span
                    key={`${pattern.type}-${pattern.lastSeen}`}
                    className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1 text-xs text-[var(--text-secondary)]"
                  >
                    {pattern.type} - {pattern.frequency}
                  </span>
                ))}
              </div>
            ) : null}
          </SectionShell>

          <SectionShell id="artifacts" title="Artifacts & Dependencies" evidence={dossier.artifacts.evidence}>
            <div className="space-y-4">
              {dossier.artifacts.readmeExcerpt ? (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Documentation excerpt</p>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                    {dossier.artifacts.readmeExcerpt}
                  </p>
                </div>
              ) : (
                <EmptyState message={dossier.artifacts.evidence.emptyReason} />
              )}

              {dossier.artifacts.dependencies.length > 0 || dossier.artifacts.permissions.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Dependencies</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {dossier.artifacts.dependencies.map((item) => (
                        <code key={item} className="rounded-lg bg-[var(--bg-card)] px-2 py-1 text-xs text-[var(--text-secondary)]">
                          {item}
                        </code>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Permissions</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {dossier.artifacts.permissions.map((item) => (
                        <code key={item} className="rounded-lg bg-[var(--bg-card)] px-2 py-1 text-xs text-[var(--text-secondary)]">
                          {item}
                        </code>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {dossier.artifacts.parameters ? (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Parameters</p>
                  <div className="mt-3 space-y-3">
                    {Object.entries(dossier.artifacts.parameters).map(([name, spec]) => (
                      <div key={name} className="border-b border-[var(--border)] pb-3 last:border-b-0 last:pb-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <code className="rounded bg-[var(--bg-card)] px-2 py-0.5 text-xs text-[var(--text-primary)]">
                            {name}
                          </code>
                          <span className="text-xs text-[var(--text-tertiary)]">{spec.type}</span>
                          {spec.required ? <span className="text-xs text-[var(--accent-warning)]">required</span> : null}
                        </div>
                        {spec.description ? (
                          <p className="mt-2 text-sm text-[var(--text-secondary)]">{spec.description}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {dossier.artifacts.readme ? (
                <details className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-[var(--text-primary)]">
                    Full README
                  </summary>
                  <div className="mt-4">
                    <SkillMarkdown content={dossier.artifacts.readme} />
                  </div>
                </details>
              ) : null}

              {dossier.artifacts.extractedFiles.length > 0 ? (
                <div className="space-y-4">
                  {dossier.artifacts.extractedFiles.map((file) => (
                    <div key={file.path} className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">{file.path}</p>
                      <pre className="mt-3 overflow-x-auto text-xs text-[var(--text-secondary)]">{file.content}</pre>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </SectionShell>

          <SectionShell id="media" title="Media & Demo" evidence={dossier.media.evidence}>
            <div className="space-y-4">
              {dossier.media.primaryImageUrl ? (
                <img
                  src={dossier.media.primaryImageUrl}
                  alt={`${dossier.name} preview`}
                  className="max-h-[26rem] w-full rounded-2xl border border-[var(--border)] object-cover"
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
                      className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 hover:border-[var(--accent-heart)]/40"
                    >
                      <p className="text-sm font-semibold text-[var(--text-primary)]">
                        {asset.title ?? asset.assetKind}
                      </p>
                      <p className="mt-1 text-sm text-[var(--text-secondary)]">
                        {asset.caption ?? asset.altText ?? "Open media asset"}
                      </p>
                    </a>
                  ))}
                </div>
              ) : (
                <EmptyState message={dossier.media.evidence.emptyReason} />
              )}
              {(dossier.ownerResources.customLinks.length > 0 ||
                Object.values(dossier.ownerResources.structuredLinks).some(Boolean)) ? (
                <div className="flex flex-wrap gap-3">
                  {dossier.ownerResources.customLinks.map((link) => (
                    <ExternalLink key={`${link.label}-${link.url}`} link={link} />
                  ))}
                  {Object.entries(dossier.ownerResources.structuredLinks).flatMap(([kind, url]) =>
                    url
                      ? [
                          <ExternalLink
                            key={`${kind}-${url}`}
                            link={{
                              label: kind.replace(/Url$/, "").replace(/^./, (v) => v.toUpperCase()),
                              url,
                              kind: kind.replace(/Url$/, "") as DossierLink["kind"],
                            }}
                          />,
                        ]
                      : []
                  )}
                </div>
              ) : null}
            </div>
          </SectionShell>

          <SectionShell id="alternatives" title="Alternatives" evidence={dossier.relatedAgents.evidence}>
            {dossier.relatedAgents.items.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {dossier.relatedAgents.items.map((item) => (
                  <AgentMiniCard key={item.id} agent={item} />
                ))}
              </div>
            ) : (
              <EmptyState message={dossier.relatedAgents.evidence.emptyReason} />
            )}
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <Link href={dossier.relatedAgents.links.hub} className="text-[var(--accent-heart)] hover:underline">Agent hub</Link>
              <Link href={dossier.relatedAgents.links.source} className="text-[var(--accent-heart)] hover:underline">More from this source</Link>
              {dossier.relatedAgents.links.protocols.map((item) => (
                <Link key={item.href} href={item.href} className="text-[var(--accent-heart)] hover:underline">
                  {item.label} agents
                </Link>
              ))}
            </div>
          </SectionShell>

          <details className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 md:p-6">
            <summary className="cursor-pointer text-xl font-semibold text-[var(--text-primary)]">
              Machine Appendix
            </summary>
            <div className="mt-5 grid gap-4">
              <JsonBlock label="Contract JSON" value={dossier.execution.contract} />
              <JsonBlock label="Invocation Guide" value={dossier.execution.invocationGuide} />
              <JsonBlock label="Trust JSON" value={dossier.reliability.trust} />
              <JsonBlock label="Capability Matrix" value={dossier.coverage.capabilityMatrix} />
            </div>
          </details>
        </div>

        <div className="hidden lg:block" />
      </div>
    </div>
  );
}
