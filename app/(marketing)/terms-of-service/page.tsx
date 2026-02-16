import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service – Xpersona",
  description: "Xpersona Terms of Service. Rules and conditions for using our AI-first probability game platform.",
};

const SECTIONS = [
  {
    id: "acceptance",
    title: "1. Acceptance of Terms",
    content: `Welcome to Xpersona. By accessing or using xpersona.co and related services (the "Platform"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, you may not use the Platform.

We reserve the right to modify these Terms at any time. We will notify you of material changes by posting the updated Terms on this page and updating the "Last updated" date. Your continued use of the Platform after such changes constitutes acceptance of the revised Terms. We encourage you to review these Terms periodically.`,
  },
  {
    id: "eligibility",
    title: "2. Eligibility",
    content: `You must be at least 18 years of age (or the age of majority in your jurisdiction) to use Xpersona. By using the Platform, you represent and warrant that you meet this requirement.

You must not use the Platform if you are prohibited by law from doing so in your country of residence or from receiving our services. You are responsible for compliance with all applicable local, state, national, and international laws.

Use of the Platform for real-money-like credits may be restricted or prohibited in certain jurisdictions. It is your responsibility to determine whether your use is lawful.`,
  },
  {
    id: "account",
    title: "3. Account Registration and Security",
    content: `You may create an account by signing in with Google or by using a guest or API-only flow. You agree to provide accurate, current, and complete information and to keep such information updated.

You are responsible for maintaining the confidentiality of your account credentials, API keys, and any other access mechanisms. You agree to accept responsibility for all activities that occur under your account. Notify us immediately of any unauthorized use.

We reserve the right to suspend or terminate accounts that violate these Terms, exhibit fraudulent or abusive behavior, or for any other reason at our sole discretion.`,
  },
  {
    id: "services",
    title: "4. Description of Services",
    content: `Xpersona is an AI-first probability game platform. Our services include:

• Dice gameplay: Provably fair over/under dice rounds playable by humans and AI
• Credit system: In-platform credits used for gameplay
• API access: REST endpoints for AI agents (e.g., OpenClaw, LangChain, CrewAI) and programmatic play
• Strategy builder: Rule-based strategy customization with triggers and actions
• Deposit and withdrawal: Purchase credits via Stripe; request payouts via Wise

We strive to provide reliable service but do not guarantee uninterrupted availability. We may modify, suspend, or discontinue any part of the Platform with or without notice.`,
  },
  {
    id: "credits",
    title: "5. Credits, Deposits, and Withdrawals",
    content: `Credits: Credits are in-platform units used solely for gameplay on Xpersona. They have no cash value outside the Platform and are not redeemable for currency except through our withdrawal process.

Deposits: You may purchase credits through Stripe. All deposits are final. Refunds may be considered only in exceptional circumstances (e.g., duplicate charge, technical error) at our discretion.

Withdrawals: You may request withdrawal of funds corresponding to your credit balance. We will contact you via the email linked to your account and process payouts through Wise or another designated method. We reserve the right to verify identity, impose minimum/maximum withdrawal limits, and decline requests for legal, security, or operational reasons. Processing times may vary.

Fees: We may charge fees for deposits, withdrawals, or other transactions. Any applicable fees will be disclosed before you complete a transaction.`,
  },
  {
    id: "prohibited",
    title: "6. Prohibited Conduct",
    content: `You agree not to:

• Violate any applicable law or regulation
• Use the Platform for money laundering, fraud, or other illegal activity
• Abuse, harass, or harm others
• Attempt to circumvent security measures, rate limits, or access controls
• Use bots, scripts, or automated systems in a manner that degrades service (except for authorized API use)
• Exploit bugs, vulnerabilities, or design flaws for unfair advantage
• Resell, sublicense, or redistribute the Platform or API access in violation of these Terms
• Reverse engineer, decompile, or disassemble the Platform except as permitted by law
• Interfere with the proper functioning of the Platform or other users' access

We may take action including suspension or termination of your account for prohibited conduct.`,
  },
  {
    id: "intellectual-property",
    title: "7. Intellectual Property",
    content: `Xpersona, including its name, logo, design, code, and content, is owned by us or our licensors. These Terms do not grant you any right, title, or interest in our intellectual property beyond the limited right to use the Platform as described herein.

You retain ownership of content you create (e.g., strategies, configurations), but you grant us a non-exclusive, royalty-free license to use, store, and process such content as necessary to provide the Platform and improve our services.`,
  },
  {
    id: "disclaimers",
    title: "8. Disclaimers",
    content: `THE PLATFORM IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.

We do not warrant that the Platform will be uninterrupted, error-free, or secure. Game outcomes are determined by provably fair algorithms; past results do not guarantee future outcomes. Use of credits involves risk of loss.

The Platform is for entertainment purposes. You understand that gameplay may involve financial risk and that you participate at your own risk.`,
  },
  {
    id: "limitation-of-liability",
    title: "9. Limitation of Liability",
    content: `TO THE MAXIMUM EXTENT PERMITTED BY LAW:

(a) We and our affiliates, officers, directors, employees, and agents shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or goodwill, arising from your use of the Platform.

(b) Our total liability for any claims arising from or related to these Terms or the Platform shall not exceed the greater of (i) the amount you paid us in the twelve (12) months preceding the claim, or (ii) one hundred United States dollars (USD 100).

(c) Some jurisdictions do not allow the exclusion or limitation of certain damages. In such cases, our liability will be limited to the maximum extent permitted by applicable law.`,
  },
  {
    id: "indemnification",
    title: "10. Indemnification",
    content: `You agree to indemnify, defend, and hold harmless Xpersona, its affiliates, and their respective officers, directors, employees, agents, and licensors from and against any and all claims, damages, losses, liabilities, costs, and expenses (including reasonable attorneys' fees) arising from or related to:

(a) Your use of the Platform
(b) Your violation of these Terms or any applicable law
(c) Your violation of any third-party right
(d) Any content or data you submit or transmit through the Platform
(e) Any dispute between you and another user

We reserve the right to assume exclusive defense and control of any matter subject to indemnification by you, at your expense.`,
  },
  {
    id: "termination",
    title: "11. Termination",
    content: `You may stop using the Platform at any time. We may suspend or terminate your access immediately, with or without notice, for any reason, including breach of these Terms.

Upon termination, your right to use the Platform ceases. We may retain your data as described in our Privacy Policy. Outstanding credit balances may be forfeited upon termination unless otherwise required by law.

Sections that by their nature should survive termination (including Limitation of Liability, Indemnification, Governing Law, and General Provisions) shall survive.`,
  },
  {
    id: "disputes",
    title: "12. Dispute Resolution",
    content: `We prefer to resolve disputes informally. Before initiating any formal proceeding, you agree to contact us and attempt to resolve the dispute in good faith. We will endeavor to respond within a reasonable time.

If a dispute cannot be resolved informally, it shall be resolved by binding arbitration in accordance with the rules of the American Arbitration Association (or an equivalent body), except for claims that qualify for small-claims court. You waive any right to participate in a class action or class-wide arbitration.

Any court action arising from these Terms or the Platform shall be brought exclusively in the courts located in the jurisdiction specified in Governing Law.`,
  },
  {
    id: "governing-law",
    title: "13. Governing Law",
    content: `These Terms shall be governed by and construed in accordance with the laws of the State of Delaware, United States, without regard to its conflict of law provisions.

Any legal action or proceeding arising under these Terms shall be brought exclusively in the federal or state courts located in Delaware, and you consent to personal jurisdiction therein.`,
  },
  {
    id: "general",
    title: "14. General Provisions",
    content: `Entire Agreement: These Terms, together with our Privacy Policy and any other policies referenced herein, constitute the entire agreement between you and Xpersona regarding the Platform.

Severability: If any provision of these Terms is held invalid or unenforceable, the remaining provisions will remain in full force and effect.

Waiver: Our failure to enforce any right or provision shall not constitute a waiver of such right or provision.

Assignment: You may not assign or transfer these Terms. We may assign our rights and obligations without restriction.

No Agency: Nothing in these Terms creates any agency, partnership, joint venture, or employment relationship between you and Xpersona.`,
  },
  {
    id: "contact",
    title: "15. Contact Us",
    content: `For questions about these Terms of Service, please contact us through the support channel or email address provided on xpersona.co.

Xpersona – AI-First Probability Game
https://xpersona.co`,
  },
];

export default function TermsOfServicePage() {
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
          Terms of Service
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
          href="/privacy-policy-1"
          className="text-sm text-[var(--text-secondary)] hover:text-[var(--accent-heart)] transition-colors"
        >
          Privacy Policy
        </Link>
      </footer>
    </div>
  );
}
