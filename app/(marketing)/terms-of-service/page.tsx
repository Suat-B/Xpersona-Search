import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service - Xpersona",
  description: "Terms for using Xpersona search and agent management services.",
};

export default function TermsOfServicePage() {
  const toc = [
    { id: "overview", label: "Overview" },
    { id: "definitions", label: "Definitions" },
    { id: "account", label: "Account & Security" },
    { id: "use", label: "Acceptable Use" },
    { id: "profiles", label: "Claimed Profiles" },
    { id: "content", label: "Content & Licenses" },
    { id: "availability", label: "Service Availability" },
    { id: "fees", label: "Fees & Billing" },
    { id: "privacy", label: "Privacy" },
    { id: "ip", label: "Intellectual Property" },
    { id: "liability", label: "Disclaimers & Liability" },
    { id: "disputes", label: "Disputes & Arbitration" },
    { id: "annex", label: "Annexes" },
    { id: "contact", label: "Contact" },
  ];

  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_600px_at_20%_-10%,rgba(122,143,255,0.18),transparent),radial-gradient(900px_600px_at_85%_10%,rgba(255,110,199,0.14),transparent),linear-gradient(180deg,rgba(8,10,16,1),rgba(10,12,18,1))] text-[var(--text-primary)]">
      <div className="border-b border-white/10">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[var(--accent-heart)] to-[var(--accent)] shadow-[0_0_18px_rgba(255,110,199,0.4)]" />
            <div>
              <p className="text-sm uppercase tracking-[0.35em] text-[var(--text-secondary)]">Policies</p>
              <h1 className="text-lg font-semibold">Xpersona Terms</h1>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
            <Link href="/" className="hover:text-[var(--accent-heart)]">Home</Link>
            <span className="h-1 w-1 rounded-full bg-white/30" />
            <Link href="/privacy-policy-1" className="hover:text-[var(--accent-heart)]">Privacy</Link>
          </div>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 pb-24 pt-10 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="space-y-6 text-sm text-[var(--text-secondary)]">
          <Link href="/" className="text-xs uppercase tracking-[0.35em] hover:text-[var(--accent-heart)]">Back to home</Link>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.3em]">On this page</p>
            <ul className="mt-4 space-y-2">
              {toc.map((item) => (
                <li key={item.id}>
                  <a className="hover:text-[var(--accent-heart)]" href={`#${item.id}`}>
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.3em]">Last updated</p>
            <p className="mt-3 text-base text-white">February 24, 2026</p>
          </div>
        </aside>

        <main className="space-y-12">
          <header className="space-y-5">
            <p className="text-xs uppercase tracking-[0.35em] text-[var(--text-secondary)]">Privacy & Terms</p>
            <h2 className="text-4xl font-semibold">Terms of Service</h2>
            <p className="max-w-2xl text-base text-[var(--text-secondary)]">
              These Terms govern access to the Xpersona platform for AI agent search, indexing,
              and claimed profile management services. Please read them carefully.
            </p>
          </header>

          <section id="overview" className="space-y-4">
            <h3 className="text-2xl font-semibold">Overview</h3>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-[var(--text-secondary)] leading-relaxed">
              <p>
                IMPORTANT NOTICE: These Terms of Service (&quot;Terms&quot;) constitute a legally
                binding agreement between you and Xpersona. By accessing, browsing, registering for,
                or using any portion of the Xpersona platform, websites, applications, APIs, products,
                or services (collectively, the &quot;Service&quot;), you acknowledge that you have read,
                understood, and agree to be bound by these Terms and any referenced policies. If you do
                not agree, do not access or use the Service.
              </p>
              <p className="mt-4">
                The Service provides AI agent search, indexing, discovery, ranking, metadata enrichment,
                claimed profile management, portfolio curation, and related tools. We may add, modify, or
                remove features at any time, including beta or experimental capabilities.
              </p>
            </div>
          </section>

          <section id="definitions" className="space-y-4">
            <h3 className="text-2xl font-semibold">Definitions</h3>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-[var(--text-secondary)] leading-relaxed space-y-3">
              <p><strong className="text-white">Xpersona</strong> means the entity operating the Service and its affiliates.</p>
              <p><strong className="text-white">User</strong> means any individual or entity accessing or using the Service.</p>
              <p><strong className="text-white">Content</strong> means any data, text, metadata, profiles, listings, code, software agents, submissions, or other materials made available through the Service.</p>
              <p><strong className="text-white">Agent</strong> means an AI system, model, workflow, bot, or software process indexed, discovered, evaluated, or managed through the Service.</p>
              <p><strong className="text-white">Claimed Profile</strong> means an Agent profile or listing you assert control over through the claim process.</p>
              <p><strong className="text-white">Workspace</strong> means any account, organization, project, or environment created to use or administer the Service.</p>
            </div>
          </section>

          <section id="account" className="space-y-4">
            <h3 className="text-2xl font-semibold">Account & Security</h3>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-[var(--text-secondary)] leading-relaxed space-y-4">
              <p>
                You agree to provide truthful and complete registration information, maintain the accuracy
                of your account data, and promptly update changes. You are responsible for safeguarding
                credentials and for all activities under your account.
              </p>
              <p>
                You must notify us immediately of unauthorized access or security incidents. We are not
                responsible for losses caused by your failure to secure your account.
              </p>
            </div>
          </section>

          <section id="use" className="space-y-4">
            <h3 className="text-2xl font-semibold">Acceptable Use</h3>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-[var(--text-secondary)] leading-relaxed space-y-3">
              <p>You agree not to:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li>Violate any law, regulation, or third-party right.</li>
                <li>Misrepresent ownership of Content or Agents or submit fraudulent claims.</li>
                <li>Interfere with, disrupt, or attempt to circumvent security, access controls, rate limits, or usage restrictions.</li>
                <li>Engage in automated scraping, harvesting, or data extraction beyond any expressly permitted API or license.</li>
                <li>Upload or transmit malware, malicious code, or harmful content.</li>
                <li>Use the Service for competitive intelligence designed to reverse-engineer our systems beyond legitimate interoperability.</li>
              </ul>
            </div>
          </section>

          <section id="profiles" className="space-y-4">
            <h3 className="text-2xl font-semibold">Claimed Profiles</h3>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-[var(--text-secondary)] leading-relaxed space-y-3">
              <p>
                Claiming a profile is a legal assertion that you have the rights and authority to represent
                the Agent or content at issue. We may require verification, documentation, or additional
                proof. We may revoke or suspend claimed status at any time for noncompliance, disputes, or
                legal risk.
              </p>
              <p>You remain solely responsible for any claims or representations made via a claimed profile.</p>
            </div>
          </section>

          <section id="content" className="space-y-4">
            <h3 className="text-2xl font-semibold">Content & Licenses</h3>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-[var(--text-secondary)] leading-relaxed space-y-4">
              <p>
                You retain ownership of Content you submit, but you grant Xpersona a worldwide, non-exclusive,
                royalty-free, transferable, sublicensable license to host, store, reproduce, modify, translate,
                adapt, publish, display, distribute, and create derivative works of such Content for the
                operation, improvement, marketing, and promotion of the Service.
              </p>
              <p>
                The Service may index, catalog, or reference publicly available data or information provided
                by third parties. We do not guarantee completeness, accuracy, or legal status of any
                third-party data.
              </p>
            </div>
          </section>

          <section id="availability" className="space-y-4">
            <h3 className="text-2xl font-semibold">Service Availability</h3>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-[var(--text-secondary)] leading-relaxed space-y-3">
              <p>
                The Service is provided on an &quot;as available&quot; basis. We may suspend, discontinue,
                or limit access to the Service or any feature without liability. Scheduled or emergency
                maintenance may result in interruptions.
              </p>
            </div>
          </section>

          <section id="fees" className="space-y-4">
            <h3 className="text-2xl font-semibold">Fees & Billing</h3>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-[var(--text-secondary)] leading-relaxed space-y-3">
              <p>
                Certain features may be paid, metered, or subscription-based. Fees are non-refundable unless
                required by law or expressly stated. You authorize us and our payment processors to charge your
                selected payment method.
              </p>
              <p>You are responsible for all applicable taxes, duties, and governmental assessments.</p>
            </div>
          </section>

          <section id="privacy" className="space-y-4">
            <h3 className="text-2xl font-semibold">Privacy</h3>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-[var(--text-secondary)] leading-relaxed space-y-3">
              <p>Your use of the Service is subject to our Privacy Policy and related disclosures.</p>
              <p>You consent to the collection and processing of information as described in those policies.</p>
            </div>
          </section>

          <section id="ip" className="space-y-4">
            <h3 className="text-2xl font-semibold">Intellectual Property</h3>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-[var(--text-secondary)] leading-relaxed space-y-3">
              <p>
                All rights, title, and interest in the Service, including software, design, trademarks, and
                proprietary information, are owned by Xpersona and its licensors. Except as expressly permitted,
                no rights are granted to you.
              </p>
            </div>
          </section>

          <section id="liability" className="space-y-4">
            <h3 className="text-2xl font-semibold">Disclaimers & Liability</h3>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-[var(--text-secondary)] leading-relaxed space-y-4">
              <p>
                THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY
                KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY,
                FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT.
              </p>
              <p>
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, XPERSONA WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL,
                SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES. OUR TOTAL LIABILITY FOR ANY CLAIMS RELATING TO
                THE SERVICE WILL NOT EXCEED THE AMOUNT PAID BY YOU TO XPERSONA IN THE 12 MONTHS PRECEDING THE
                EVENT GIVING RISE TO THE CLAIM, OR ONE HUNDRED U.S. DOLLARS (USD $100), WHICHEVER IS GREATER.
              </p>
            </div>
          </section>

          <section id="disputes" className="space-y-4">
            <h3 className="text-2xl font-semibold">Disputes & Arbitration</h3>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-[var(--text-secondary)] leading-relaxed space-y-4">
              <p>
                Before initiating any formal dispute, you agree to contact us and attempt to resolve the issue
                informally. If a dispute is not resolved within 30 days, either party may elect to resolve the
                dispute through binding arbitration rather than in court, except for injunctive relief for
                intellectual property matters.
              </p>
              <p>
                To the extent arbitration does not apply, you agree that any claim will be brought exclusively
                in the state or federal courts located in the jurisdiction where Xpersona is organized, and you
                consent to personal jurisdiction in those courts. YOU AND XPERSONA EACH WAIVE ANY RIGHT TO A
                TRIAL BY JURY.
              </p>
            </div>
          </section>

          <section id="annex" className="space-y-4">
            <h3 className="text-2xl font-semibold">Annexes</h3>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-[var(--text-secondary)] leading-relaxed space-y-5">
              <div>
                <p className="text-white font-semibold">AI Agent-Specific Terms</p>
                <p className="mt-2">
                  Automated agents may access the Service only within published rate limits, robots directives,
                  API terms, or other programmatic constraints. You remain responsible for the behavior, output,
                  and compliance of any agents you deploy or register through the Service.
                </p>
              </div>
              <div>
                <p className="text-white font-semibold">API and Automated Access Policy</p>
                <p className="mt-2">
                  You will not exceed documented quotas, will secure API keys, and will log and monitor automated
                  access for abuse. We may throttle or terminate API access for misuse or policy violations.
                </p>
              </div>
              <div>
                <p className="text-white font-semibold">Data Processing & Security</p>
                <p className="mt-2">
                  We implement safeguards reasonably designed to protect data under our control. You remain
                  responsible for evaluating regulatory requirements, including cross-border transfer obligations.
                </p>
              </div>
              <div>
                <p className="text-white font-semibold">DMCA / Rights Takedown</p>
                <p className="mt-2">
                  If you believe Content infringes your rights, submit a notice identifying the work, the
                  allegedly infringing material, your contact information, and a statement of good-faith belief
                  and accuracy under penalty of perjury. Counter-notices may be submitted where permitted by law.
                </p>
              </div>
              <div>
                <p className="text-white font-semibold">Model Training & Data Usage</p>
                <p className="mt-2">
                  We may use aggregated, de-identified usage data to improve the Service. We do not use private
                  Content for model training without a lawful basis and required permissions.
                </p>
              </div>
              <div>
                <p className="text-white font-semibold">Jurisdiction-Specific Addenda</p>
                <p className="mt-2">
                  If you are located in a jurisdiction with mandatory protections, those protections apply to the
                  minimum extent required by law.
                </p>
              </div>
            </div>
          </section>

          <section id="contact" className="space-y-4">
            <h3 className="text-2xl font-semibold">Contact</h3>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-[var(--text-secondary)] leading-relaxed">
              Questions or notices should be sent through our support channels listed at xpersona.co.
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
