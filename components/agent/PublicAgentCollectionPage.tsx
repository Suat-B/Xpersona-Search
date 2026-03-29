import React from "react";
import Link from "next/link";
import { AgentGridSection } from "@/components/agent/AgentGridSection";
import { CrawlerSummaryCard } from "@/components/agent/CrawlerSummaryCard";
import type { HubAgent } from "@/lib/agents/hub-data";

type CollectionLink = {
  href: string;
  label: string;
};

interface PublicAgentCollectionPageProps {
  eyebrow: string;
  title: string;
  description: string;
  agents: HubAgent[];
  summaryPoints: string[];
  links?: CollectionLink[];
  crawlerSummary?: {
    summary: string;
    bestFor: string;
    notIdealFor: string;
    freshness: string;
    evidenceSources: string[];
  };
}

export function PublicAgentCollectionPage({
  eyebrow,
  title,
  description,
  agents,
  summaryPoints,
  links = [],
  crawlerSummary,
}: PublicAgentCollectionPageProps) {
  const summary = crawlerSummary ?? {
    summary: `${title} gives LLM crawlers a concise public surface for comparing agents, extracting citation-ready context, and deciding which detail pages to revisit.`,
    bestFor: "Answer-first discovery, shortlist generation, and public comparisons where protocol and evidence quality matter more than a sales pitch.",
    notIdealFor: "Private procurement decisions that need premium dossiers, deep vendor outreach, or non-public implementation evidence.",
    freshness: agents[0]?.updatedAt
      ? `Last visible agent update ${new Date(agents[0].updatedAt).toLocaleDateString("en-US")}`
      : "Freshness follows the latest public collection refresh.",
    evidenceSources: ["public collection metadata", "agent cards", "linked machine endpoints"],
  };
  const crawlerLinks = [
    { href: "/for-agents", label: "For AI Agents" },
    { href: "/llms.txt", label: "llms.txt" },
    { href: "/api/v1/openapi/ai-public", label: "AI OpenAPI" },
    ...links.slice(0, 2),
  ].filter((link, index, all) => all.findIndex((item) => item.href === link.href) === index);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:py-10">
      <header className="rounded-3xl border border-[var(--border)] bg-[radial-gradient(circle_at_top_left,rgba(255,112,138,0.16),transparent_40%),linear-gradient(180deg,var(--bg-card),var(--bg-elevated))] p-6 md:p-8">
        <p className="text-xs uppercase tracking-[0.22em] text-[var(--text-tertiary)]">{eyebrow}</p>
        <h1 className="mt-3 max-w-4xl text-3xl font-bold tracking-tight text-[var(--text-primary)] md:text-4xl">
          {title}
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)] md:text-base">
          {description}
        </p>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {summaryPoints.map((point) => (
            <div
              key={point}
              className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]/80 p-4 text-sm leading-relaxed text-[var(--text-secondary)]"
            >
              {point}
            </div>
          ))}
        </div>
        {links.length > 0 ? (
          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2 text-[var(--text-secondary)] hover:border-[var(--accent-heart)]/40 hover:text-[var(--text-primary)]"
              >
                {link.label}
              </Link>
            ))}
          </div>
        ) : null}
      </header>

      <div className="mt-6">
        <CrawlerSummaryCard
          eyebrow="Crawler Summary"
          title={`${title} at a glance`}
          summary={summary.summary}
          bestFor={summary.bestFor}
          notIdealFor={summary.notIdealFor}
          freshness={summary.freshness}
          evidenceSources={summary.evidenceSources}
          links={crawlerLinks}
        />
      </div>

      <div className="mt-6">
        <AgentGridSection
          title={`${agents.length} crawl-visible agent${agents.length === 1 ? "" : "s"}`}
          description="Each card links to the premium dossier, while the public collection page stays fully crawlable and easy to summarize."
          agents={agents}
        />
      </div>
    </main>
  );
}
