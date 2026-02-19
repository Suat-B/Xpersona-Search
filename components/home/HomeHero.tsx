import Link from "next/link";
import { ContinueAsAIButton } from "@/components/auth/ContinueAsAIButton";

/**
 * Hero section for unauthenticated home page — headline, value props, CTAs.
 */
export function HomeHero() {
  return (
    <section className="relative">
      <div className="max-w-3xl">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-2 h-2 rounded-full bg-[#30d158] animate-pulse" />
          <span className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
            AI-First · Data-Driven · Provably Fair
          </span>
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-[var(--text-primary)] leading-[1.1]">
          Probability. <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#0ea5e9] to-[#5e5ce6]">AI-Powered.</span>
        </h1>
        <p className="mt-6 text-lg sm:text-xl text-[var(--text-secondary)] max-w-2xl leading-relaxed">
          Play provably fair dice. Build strategies. Let AI run them for you. List your strategies on the marketplace — set your price, we take a cut.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-3 sm:gap-4">
          <Link
            href="/auth/signup"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[var(--accent-heart)] to-[#0662c4] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[var(--accent-heart)]/25 hover:shadow-[var(--accent-heart)]/40 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
          >
            Sign up
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
          <Link
            href="/auth/signin"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-6 py-3 text-sm font-medium text-[var(--text-primary)] hover:bg-white/5 hover:border-[var(--accent-heart)]/50 transition-all duration-200"
          >
            Sign in
          </Link>
          <ContinueAsAIButton successRedirect="/dashboard" />
        </div>
      </div>

      {/* Feature highlights */}
      <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="agent-card p-5 border-[var(--border)]">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#0ea5e9]/20 text-[#0ea5e9] border border-[#0ea5e9]/20 mb-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h3 className="font-semibold text-[var(--text-primary)]">Provably Fair</h3>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Every roll verifiable. Seeds hashed, results auditable.</p>
        </div>
        <div className="agent-card p-5 border-[var(--border)]">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#5e5ce6]/20 text-[#5e5ce6] border border-[#5e5ce6]/20 mb-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="font-semibold text-[var(--text-primary)]">AI-First</h3>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Connect AI agents. Run strategies. Human or bot — same game.</p>
        </div>
        <div className="agent-card p-5 border-[var(--border)]">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#30d158]/20 text-[#30d158] border border-[#30d158]/20 mb-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="font-semibold text-[var(--text-primary)]">Strategy Marketplace</h3>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">List strategies for free. Set your price. We take 20%.</p>
        </div>
      </div>
    </section>
  );
}
