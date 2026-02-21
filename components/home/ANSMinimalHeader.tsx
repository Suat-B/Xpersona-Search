import Link from "next/link";
import { getGameUrl, getTradingUrl } from "@/lib/service-urls";

/**
 * Minimal header for hub (xpersona.co) — Google-like chrome.
 * Logo left, secondary links right: Game | Marketplace | Sign in | Sign up
 */
export function ANSMinimalHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-black/80 backdrop-blur-xl">
      <div className="container mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 py-3 min-w-0">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#0ea5e9] to-[#0077b6] shadow-lg shadow-[#0ea5e9]/20 group-hover:shadow-[#0ea5e9]/40 transition-shadow">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <span className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
            Xpersona
          </span>
        </Link>
        <nav className="flex items-center gap-2 sm:gap-4" aria-label="Main navigation">
          <Link
            href={getGameUrl("/")}
            className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          >
            Game
          </Link>
          <Link
            href={getTradingUrl("/")}
            className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          >
            Marketplace
          </Link>
          <Link
            href="/auth/signin"
            className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/auth/signup"
            className="text-sm font-medium text-[var(--accent-heart)] hover:underline"
          >
            Sign up
          </Link>
        </nav>
      </div>
    </header>
  );
}
