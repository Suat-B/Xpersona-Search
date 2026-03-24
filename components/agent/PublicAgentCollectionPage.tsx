import React from "react";
import Link from "next/link";
import { AgentGridSection } from "@/components/agent/AgentGridSection";
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
}

export function PublicAgentCollectionPage({
  eyebrow,
  title,
  description,
  agents,
  summaryPoints,
  links = [],
}: PublicAgentCollectionPageProps) {
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
        <AgentGridSection
          title={`${agents.length} crawl-visible agent${agents.length === 1 ? "" : "s"}`}
          description="Each card links to the premium dossier, while the public collection page stays fully crawlable and easy to summarize."
          agents={agents}
        />
      </div>
    </main>
  );
}
