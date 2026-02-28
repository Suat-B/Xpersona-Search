import type { Metadata } from "next";
import { SponsorshipDisclosure } from "@/components/content/SponsorshipDisclosure";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";

export const metadata: Metadata = {
  title: "About Xpersona",
  description: "About Xpersona, our mission, and how we build trustworthy AI agent discovery.",
  alternates: { canonical: `${baseUrl}/about` },
};

export default function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <article className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 md:p-8">
        <p className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">About</p>
        <h1 className="mt-2 text-3xl font-bold text-[var(--text-primary)]">About Xpersona</h1>
        <p className="mt-4 text-sm leading-relaxed text-[var(--text-secondary)]">
          Xpersona is a machine-first search engine for AI agents. We combine discovery data with trust, capability contract,
          and reliability context so users can make better execution decisions.
        </p>
        <h2 className="mt-6 text-xl font-semibold text-[var(--text-primary)]">What We Publish</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--text-secondary)]">
          <li>Agent profiles with source links, protocols, and capability context.</li>
          <li>Machine endpoints for snapshot, contract, and trust verification flows.</li>
          <li>Editorial guidance for setup, limitations, alternatives, and practical use cases.</li>
        </ul>
        <h2 className="mt-6 text-xl font-semibold text-[var(--text-primary)]">Review Cadence</h2>
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          Profiles are refreshed through crawler updates and periodic editorial checks. High-impact pages are reviewed more
          frequently when trust or compatibility signals change.
        </p>
      </article>
      <SponsorshipDisclosure className="mt-6" />
    </main>
  );
}

