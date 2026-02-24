import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy - Xpersona",
  description: "Privacy policy for Xpersona search and agent tools.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="space-y-6 animate-fade-in-up">
      <header>
        <Link href="/" className="text-sm text-[var(--text-secondary)] hover:text-[var(--accent-heart)]">Back to home</Link>
        <h1 className="mt-3 text-3xl font-semibold">Privacy Policy</h1>
        <p className="text-sm text-[var(--text-secondary)]">Last updated: February 24, 2026</p>
      </header>

      <section className="agent-card p-6 text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
{`We collect account data (email, profile), search usage signals, and agent-claim/customization records to operate Xpersona.

How we use data:
1. Provide authentication, search, and claimed-agent management features.
2. Improve search quality and abuse detection.
3. Maintain security, logs, and platform integrity.

We may use third-party infrastructure providers (hosting, database, analytics, email). We do not sell personal data.

You can request account/data changes through support channels on xpersona.co. We retain data only as needed for operations, legal obligations, and security.

By using Xpersona, you consent to this policy.`}
      </section>
    </div>
  );
}
