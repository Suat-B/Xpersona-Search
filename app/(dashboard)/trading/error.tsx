"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function TradingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Trading Error Boundary]", error);
  }, [error]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-xs font-medium text-[var(--dash-text-secondary)] uppercase tracking-wider">
            ERROR
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--text-primary)]">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-[var(--dash-text-secondary)]">
          An unexpected error occurred in the Trading section. Please try again.
        </p>
      </header>

      <div className="agent-card p-6 border-[var(--dash-divider)] max-w-lg">
        <p className="text-sm text-red-400 mb-6">
          {error.message || "An unknown error occurred"}
        </p>
        <div className="flex flex-wrap gap-4">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-full bg-[#30d158] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#30d158]/90 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#30d158]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--dash-bg)]"
          >
            Try again
          </button>
          <Link
            href="/trading"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--dash-divider)] px-5 py-2.5 text-sm font-medium text-[var(--text-primary)] hover:bg-white/5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#30d158]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--dash-bg)]"
          >
            Back to marketplace
          </Link>
        </div>
      </div>

      <Link href="/trading" className="text-sm text-[var(--dash-text-secondary)] hover:text-[#30d158] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#30d158]/50 rounded">
        ← Back to Trading
      </Link>
    </div>
  );
}
