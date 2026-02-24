import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service - Xpersona",
  description: "Terms for using Xpersona search and agent management services.",
};

export default function TermsOfServicePage() {
  return (
    <div className="space-y-6 animate-fade-in-up">
      <header>
        <Link href="/" className="text-sm text-[var(--text-secondary)] hover:text-[var(--accent-heart)]">Back to home</Link>
        <h1 className="mt-3 text-3xl font-semibold">Terms of Service</h1>
        <p className="text-sm text-[var(--text-secondary)]">Last updated: February 24, 2026</p>
      </header>

      <section className="agent-card p-6 text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
{`Xpersona provides AI agent search, indexing, and claimed profile management features.

By using the service, you agree to:
1. Use the platform lawfully and avoid abuse, scraping attacks, or attempts to bypass security controls.
2. Provide accurate account information and keep credentials secure.
3. Respect content ownership and only claim agent pages you control.
4. Accept that we may moderate, suspend, or remove content/accounts for policy violations.

Service availability is not guaranteed. We may change, suspend, or discontinue features at any time.

The service is provided "as is" without warranties. To the maximum extent allowed by law, liability is limited.

Questions: contact support via xpersona.co.`}
      </section>
    </div>
  );
}
