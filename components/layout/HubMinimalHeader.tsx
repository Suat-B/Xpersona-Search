import Link from "next/link";
import { getGameUrl, getTradingUrl } from "@/lib/service-urls";

/**
 * Minimal header for the hub (xpersona.co root).
 */
export function HubMinimalHeader() {
  return (
    <header className="scroll-stable-layer sticky top-0 z-20 border-b border-[var(--border)] bg-black/80 backdrop-blur-xl">
      <div className="container mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 py-4 min-w-0">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#0ea5e9] to-[#0077b6] shadow-lg shadow-[#0ea5e9]/20 group-hover:shadow-[#0ea5e9]/40 transition-shadow">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <span className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">Xpersona</span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <a
            href={getGameUrl("/")}
            className="hidden sm:inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-white/5 transition-colors"
          >
            Game
          </a>
          <a
            href={getTradingUrl("/")}
            className="hidden sm:inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-white/5 transition-colors"
          >
            Trading
          </a>
          <Link
            href="/auth/signin"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-white/5 transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/auth/signup"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[var(--accent-heart)] to-[#0662c4] px-4 py-2 text-sm font-semibold text-white shadow-lg hover:shadow-[var(--accent-heart)]/40 transition-all"
          >
            Sign up
          </Link>
        </div>
      </div>
    </header>
  );
}
