import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { getAuthUserFromCookie } from "@/lib/auth-utils";
import { ANSMinimalHeader } from "@/components/home/ANSMinimalHeader";
import { ANSMinimalFooter } from "@/components/home/ANSMinimalFooter";

const INFORMATIONALS = [
  {
    title: "Human-readable identity",
    description:
      "Give every agent a clean, memorable address like atlas.xpersona.agt for easier discovery and trust.",
  },
  {
    title: "Cryptographic proof",
    description:
      "Each registration maps to a verifiable cryptographic identity so ownership and integrity can be validated.",
  },
  {
    title: "DNS-based verification",
    description:
      "Domain verification is designed around DNS TXT proof so agents can confirm control in a tamper-resistant way.",
  },
  {
    title: "Protocol compatibility",
    description:
      "Built to fit A2A, MCP, ANP, and OpenClaw workflows with one domain identity across integrations.",
  },
  {
    title: "Agent card metadata",
    description:
      "Attach display name, endpoint, capabilities, and protocol data so your .agt domain is machine and human readable.",
  },
  {
    title: "Lifecycle management",
    description:
      "Planned lifecycle includes registration, active state, renewal handling, and verification status transitions.",
  },
];

export const dynamic = "force-dynamic";

export default async function DomainsPage() {
  let session = null;
  try {
    session = await auth();
  } catch {
    // Ignore auth source errors for public page rendering.
  }
  const cookieStore = await cookies();
  const userIdFromCookie = getAuthUserFromCookie(cookieStore);
  const isAuthenticated = !!(session?.user || userIdFromCookie);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <ANSMinimalHeader isAuthenticated={isAuthenticated} />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="rounded-3xl border border-[var(--light-border)] bg-[var(--light-bg-card)] p-6 sm:p-10 shadow-[var(--light-shadow-lg)]">
            <div className="inline-flex items-center rounded-full border border-[var(--light-border)] bg-[var(--light-bg-secondary)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--light-text-secondary)]">
              ANS Domains
            </div>

            <h1 className="mt-5 text-3xl font-bold tracking-tight text-[var(--light-text-primary)] sm:text-5xl">
              Secure AI identity with <span className="text-[var(--light-accent)]">.agt</span> domains
            </h1>

            <p className="mt-4 max-w-3xl text-base leading-relaxed text-[var(--light-text-secondary)] sm:text-lg">
              This page outlines the ANS domain system being built for Xpersona. The goal is simple: a trusted, verifiable
              naming layer where agents can be discovered and validated with clean <strong>.agt</strong> identities.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <span className="rounded-full border border-[var(--light-border)] bg-[var(--light-bg-secondary)] px-4 py-2 text-sm text-[var(--light-text-secondary)]">
                atlas.xpersona.agt
              </span>
              <span className="rounded-full border border-[var(--light-border)] bg-[var(--light-bg-secondary)] px-4 py-2 text-sm text-[var(--light-text-secondary)]">
                quantai.xpersona.agt
              </span>
              <span className="rounded-full border border-[var(--light-border)] bg-[var(--light-bg-secondary)] px-4 py-2 text-sm text-[var(--light-text-secondary)]">
                signalbot.xpersona.agt
              </span>
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {INFORMATIONALS.map((item) => (
              <article
                key={item.title}
                className="rounded-2xl border border-[var(--light-border)] bg-white p-5 shadow-[var(--light-shadow-card)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--light-shadow-card-hover)]"
              >
                <h2 className="text-base font-semibold text-[var(--light-text-primary)]">{item.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--light-text-secondary)]">{item.description}</p>
              </article>
            ))}
          </div>

          <div className="mt-8 rounded-3xl border border-[var(--light-accent-light)] bg-[var(--light-accent-subtle)] p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--light-accent-text)]">Launch Status</p>
            <h2 className="mt-3 text-2xl font-bold text-[var(--light-text-primary)] sm:text-3xl">Coming Soon</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--light-text-secondary)] sm:text-base">
              ANS Domains for <strong>.agt</strong> are in active implementation. Public registration is not open yet.
              We are finalizing launch details and rollout steps.
            </p>
          </div>
        </section>
      </main>

      <ANSMinimalFooter />
    </div>
  );
}
