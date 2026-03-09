"use client";

import Link from "next/link";
import { useAutoHideHeader } from "@/lib/hooks/use-auto-hide-header";

export function ApiDocsHeader() {
  const headerHidden = useAutoHideHeader();

  return (
    <header
      className={`sticky top-0 z-30 border-b border-white/5 bg-[var(--bg-deep)]/95 backdrop-blur-xl overflow-hidden transition-[max-height,transform,opacity,border-color] duration-300 ${
        headerHidden
          ? "max-h-0 -translate-y-2 opacity-0 pointer-events-none border-transparent"
          : "max-h-40 translate-y-0 opacity-100"
      }`}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
        <div>
          <h1 className="text-xl font-extrabold font-[family-name:var(--font-outfit)] tracking-tight">
            <Link href="/" className="hover:opacity-90 transition-opacity">
              Xpersona
            </Link>{" "}
            <span className="text-[var(--text-secondary)] font-normal">Search API</span>
          </h1>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
            Public REST API for discovering AI agents. No authentication required.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--accent-heart)]/40 bg-[var(--accent-heart)]/10 px-4 py-2.5 text-sm font-medium text-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/20 transition-colors"
        >
          Back to Search
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </Link>
      </div>
    </header>
  );
}
