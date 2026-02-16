import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy – Xpersona",
  description: "Xpersona Privacy Policy. How we collect, use, and protect your data.",
};

const SECTIONS = [
  {
    id: "introduction",
    title: "1. Introduction",
    content: `Xpersona ("we," "our," or "us") operates xpersona.co, an AI-first probability game platform. This Privacy Policy explains how we collect, use, disclose, and protect your information when you use our website, services, and API.

By using Xpersona, you agree to the practices described in this policy. If you do not agree, please do not use our services.`,
  },
  {
    id: "information-we-collect",
    title: "2. Information We Collect",
    content: `We collect information in the following ways:

Account Information: When you sign in with Google, we receive your email address, name, and profile picture. For guest or API-only users, we may store an identifier, display name, and email (including @xpersona.agent for AI agents).

Payment Information: When you purchase credits, we process payments through Stripe. We do not store your full card details. We store transaction IDs, amounts, credit packages purchased, and payment status.

Game and Balance Data: We store your credit balance, game rounds (dice rolls, targets, outcomes), strategy configurations, API keys, and usage data associated with your account.

Technical Data: We collect IP address, browser type, device information, and usage logs when you access our services.`,
  },
  {
    id: "how-we-use",
    title: "3. How We Use Your Information",
    content: `We use your information to:

• Provide and operate the Xpersona platform, including gameplay, deposit, withdrawal, and API access
• Authenticate you and manage your account
• Process payments and credits
• Send transactional emails (e.g., password reset, withdrawal requests)
• Improve our services, security, and user experience
• Comply with legal obligations and enforce our terms
• Communicate with you about support inquiries or important updates`,
  },
  {
    id: "third-parties",
    title: "4. Third-Party Services",
    content: `We use the following third-party services, each with their own privacy policies:

Google: For authentication when you sign in with Google. See Google Privacy Policy.

Stripe: For payment processing. Stripe handles card data; we receive only transaction metadata. See Stripe Privacy Policy.

Vercel: Our hosting and deployment platform. See Vercel Privacy Policy.

Database Providers: We use hosted PostgreSQL (e.g., Neon, Supabase) to store account and game data.

Wise: For withdrawals, we may contact you via the email linked to your account and process payouts through Wise. See Wise Privacy Policy.

Analytics: We may use analytics tools to understand usage patterns.`,
  },
  {
    id: "cookies",
    title: "5. Cookies and Similar Technologies",
    content: `We use cookies and similar technologies for:

• Session management: Keeping you logged in
• Preferences: Storing theme and UI settings
• Security: Protecting against abuse and fraud

You can control cookies through your browser settings. Disabling certain cookies may affect the functionality of our services.`,
  },
  {
    id: "data-retention",
    title: "6. Data Retention",
    content: `We retain your data for as long as your account is active and as needed to provide services. After account deletion, we may retain certain data for legal, security, or operational purposes (e.g., fraud prevention, tax records) for a limited period.

Game history, strategy data, and transaction records may be retained in line with applicable laws and our legitimate interests.`,
  },
  {
    id: "your-rights",
    title: "7. Your Rights",
    content: `Depending on your location, you may have the right to:

• Access: Request a copy of your personal data
• Rectification: Correct inaccurate data
• Erasure: Request deletion of your data
• Restriction: Limit how we process your data
• Portability: Receive your data in a machine-readable format
• Object: Object to certain processing
• Withdraw consent: Where we rely on consent

To exercise these rights, contact us at the email below. We will respond within a reasonable timeframe.`,
  },
  {
    id: "security",
    title: "8. Security",
    content: `We implement technical and organizational measures to protect your data, including encryption in transit (HTTPS), secure database access, and restricted internal access. API keys are hashed; payment data is handled by Stripe.

Despite our efforts, no system is 100% secure. You are responsible for safeguarding your API keys and account credentials.`,
  },
  {
    id: "children",
    title: "9. Children",
    content: `Xpersona is not intended for users under the age of 18 (or the age of majority in your jurisdiction). We do not knowingly collect personal information from minors. If you believe we have collected data from a minor, please contact us and we will take steps to delete it.`,
  },
  {
    id: "international",
    title: "10. International Transfers",
    content: `Our services may be hosted and processed in multiple countries. By using Xpersona, you consent to the transfer of your information to countries outside your residence, which may have different data protection laws.`,
  },
  {
    id: "changes",
    title: "11. Changes to This Policy",
    content: `We may update this Privacy Policy from time to time. We will post the revised policy on this page and update the "Last updated" date. For material changes, we may notify you by email or a notice on our site. Continued use of Xpersona after changes constitutes acceptance of the updated policy.`,
  },
  {
    id: "contact",
    title: "12. Contact Us",
    content: `For questions about this Privacy Policy or your personal data, contact us at the email address associated with your account or through the support channel listed on xpersona.co.

Xpersona – AI-First Probability Game
https://xpersona.co`,
  },
];

export default function PrivacyPolicyPage() {
  return (
    <div className="space-y-8 animate-fade-in-up">
      <header>
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--accent-heart)] transition-colors mb-6"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to home
        </Link>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--text-primary)]">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Last updated: February 16, 2026
        </p>
      </header>

      <nav className="agent-card p-5 border-[var(--border)]">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">
          On this page
        </h2>
        <ul className="space-y-2">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="text-sm text-[var(--text-secondary)] hover:text-[var(--accent-heart)] transition-colors"
              >
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-6">
        {SECTIONS.map((section) => (
          <section
            key={section.id}
            id={section.id}
            className="agent-card p-6 sm:p-8 scroll-mt-24"
          >
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
              {section.title}
            </h2>
            <div className="text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
              {section.content}
            </div>
          </section>
        ))}
      </div>

      <footer className="pt-8 border-t border-[var(--border)] flex flex-wrap gap-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-[var(--accent-heart)] hover:text-[var(--accent-heart)]/80 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Xpersona
        </Link>
        <Link
          href="/terms-of-service"
          className="text-sm text-[var(--text-secondary)] hover:text-[var(--accent-heart)] transition-colors"
        >
          Terms of Service
        </Link>
      </footer>
    </div>
  );
}
