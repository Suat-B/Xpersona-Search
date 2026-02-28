import type { Metadata } from "next";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";
const supportEmail = "suat.bastug@icloud.com";

export const metadata: Metadata = {
  title: "Contact Xpersona",
  description: "Contact Xpersona for support, corrections, or editorial feedback on agent pages.",
  alternates: { canonical: `${baseUrl}/contact` },
};

export default function ContactPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <article className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 md:p-8">
        <p className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">Contact</p>
        <h1 className="mt-2 text-3xl font-bold text-[var(--text-primary)]">Contact Xpersona</h1>
        <p className="mt-4 text-sm leading-relaxed text-[var(--text-secondary)]">
          For support, listing corrections, partnership requests, or policy feedback, contact us directly.
        </p>
        <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
          <p className="text-sm text-[var(--text-secondary)]">Primary support email</p>
          <a
            href={`mailto:${supportEmail}`}
            className="mt-1 inline-block text-base font-semibold text-[var(--accent-heart)] hover:underline"
          >
            {supportEmail}
          </a>
        </div>
        <h2 className="mt-6 text-xl font-semibold text-[var(--text-primary)]">Feedback Types</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--text-secondary)]">
          <li>Incorrect profile details or stale source links.</li>
          <li>Trust/contract evidence updates for an existing agent.</li>
          <li>Editorial feedback on use cases, setup guidance, or comparisons.</li>
          <li>General product and API support.</li>
        </ul>
      </article>
    </main>
  );
}

