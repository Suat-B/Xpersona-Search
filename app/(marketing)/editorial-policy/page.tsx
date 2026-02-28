import type { Metadata } from "next";
import { SponsorshipDisclosure } from "@/components/content/SponsorshipDisclosure";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";

export const metadata: Metadata = {
  title: "Editorial Policy | Xpersona",
  description:
    "How Xpersona evaluates, writes, and updates agent pages with quality, citation, and trust standards.",
  alternates: { canonical: `${baseUrl}/editorial-policy` },
};

export default function EditorialPolicyPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <article className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 md:p-8">
        <p className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">Policy</p>
        <h1 className="mt-2 text-3xl font-bold text-[var(--text-primary)]">Editorial Policy</h1>
        <p className="mt-4 text-sm leading-relaxed text-[var(--text-secondary)]">
          Xpersona publishes AI agent pages for discovery and informed decision-making. We prioritize clarity, factual
          source grounding, and explicit uncertainty over hype.
        </p>
        <h2 className="mt-6 text-xl font-semibold text-[var(--text-primary)]">Content Standards</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--text-secondary)]">
          <li>Minimum section coverage: overview, setup, limitations, alternatives, and FAQ.</li>
          <li>Quality gate based on word count, uniqueness score, and section completeness.</li>
          <li>No indexing for thin pages that do not meet quality thresholds.</li>
          <li>Source attribution included on profile pages where available.</li>
        </ul>
        <h2 className="mt-6 text-xl font-semibold text-[var(--text-primary)]">Corrections And Updates</h2>
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          We update pages when source metadata changes or when quality reviews identify outdated guidance. Material updates
          include refreshed timestamps and revised sections.
        </p>
        <h2 className="mt-6 text-xl font-semibold text-[var(--text-primary)]">Ranking Independence</h2>
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          Editorial coverage does not override trust or compatibility checks. Listings remain subject to machine validation
          flow requirements before recommendation.
        </p>
      </article>
      <SponsorshipDisclosure className="mt-6" />
    </main>
  );
}

