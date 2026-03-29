import React from "react";
import Link from "next/link";

type SummaryLink = {
  href: string;
  label: string;
};

interface CrawlerSummaryCardProps {
  eyebrow: string;
  title: string;
  summary: string;
  bestFor: string;
  notIdealFor: string;
  freshness: string;
  evidenceSources: string[];
  links: SummaryLink[];
}

export function CrawlerSummaryCard({
  eyebrow,
  title,
  summary,
  bestFor,
  notIdealFor,
  freshness,
  evidenceSources,
  links,
}: CrawlerSummaryCardProps) {
  return (
    <section className="rounded-2xl border border-[var(--accent-heart)]/20 bg-[linear-gradient(180deg,rgba(255,112,138,0.08),rgba(255,112,138,0.02))] p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.22em] text-[var(--text-tertiary)]">{eyebrow}</p>
          <h2 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{title}</h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">{summary}</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-secondary)]">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Freshness</p>
          <p className="mt-2 font-medium text-[var(--text-primary)]">{freshness}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Best For</p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{bestFor}</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Not Ideal For</p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{notIdealFor}</p>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Evidence Sources Checked</p>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
          {evidenceSources.join(", ")}
        </p>
      </div>

      <div className="mt-5 flex flex-wrap gap-3 text-sm">
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
    </section>
  );
}
