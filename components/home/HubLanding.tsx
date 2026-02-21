"use client";

import Link from "next/link";
import { getGameUrl, getTradingUrl } from "@/lib/service-urls";

/**
 * Hub landing page. Service selector for xpersona.co root domain.
 */
export function HubLanding() {
  return (
    <section className="relative min-h-[85vh] flex flex-col items-center justify-center px-4 py-16">
      <div className="max-w-2xl w-full text-center space-y-8">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-[var(--text-primary)]">
          Xpersona
        </h1>
        <p className="text-lg text-[var(--text-secondary)]">
          Choose your service
        </p>

        <div className="grid sm:grid-cols-2 gap-4 mt-12">
          <a
            href={getGameUrl("/")}
            className="group flex flex-col items-center gap-4 p-8 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] hover:border-[#0ea5e9]/50 hover:bg-[#0ea5e9]/5 transition-all duration-300"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0ea5e9] to-[#0077b6] shadow-lg shadow-[#0ea5e9]/20 group-hover:shadow-[#0ea5e9]/40">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <div>
              <h2 className="font-semibold text-lg text-[var(--text-primary)]">Game</h2>
              <p className="mt-1 text-sm text-[var(--text-tertiary)]">
                Provably fair dice. Build strategies. Let AI run them.
              </p>
            </div>
            <span className="text-sm font-medium text-[#0ea5e9] group-hover:underline">
              Enter game →
            </span>
          </a>

          <a
            href={getTradingUrl("/")}
            className="group flex flex-col items-center gap-4 p-8 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] hover:border-[#30d158]/50 hover:bg-[#30d158]/5 transition-all duration-300"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#30d158] to-[#248a3d] shadow-lg shadow-[#30d158]/20 group-hover:shadow-[#30d158]/40">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 className="font-semibold text-lg text-[var(--text-primary)]">Trading</h2>
              <p className="mt-1 text-sm text-[var(--text-tertiary)]">
                Strategy marketplace. List yours. Subscribe to others.
              </p>
            </div>
            <span className="text-sm font-medium text-[#30d158] group-hover:underline">
              Browse marketplace →
            </span>
          </a>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 mt-12">
          <Link
            href="/auth/signin?callbackUrl=/dashboard"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-6 py-3 text-sm font-medium text-[var(--text-primary)] hover:bg-white/5 transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/auth/signup"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[var(--accent-heart)] to-[#0662c4] px-6 py-3 text-sm font-semibold text-white shadow-lg hover:shadow-[var(--accent-heart)]/50 transition-all"
          >
            Sign up
          </Link>
        </div>
      </div>
    </section>
  );
}
