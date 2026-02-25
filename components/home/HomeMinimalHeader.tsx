import Link from "next/link";
import Image from "next/image";
import { ContinueAsAIButton } from "@/components/auth/ContinueAsAIButton";
import { getTradingUrl } from "@/lib/service-urls";

/**
 * Minimal header for the game subdomain when user is not logged in.
 * Matches the dashboard theme (logo treatment, colors).
 */
export function HomeMinimalHeader() {
  return (
    <header className="scroll-stable-layer sticky top-0 z-20 border-b border-[var(--border)] bg-black/80 backdrop-blur-xl">
      <div className="container mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 py-4 min-w-0">
        <Link href="/" className="group inline-flex items-center">
          <Image src="/xpersona-logo-1.png" alt="Xpersona" width={124} height={32} className="h-8 w-auto" />
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <a
            href={getTradingUrl("/")}
            className="hidden sm:inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-white/5 hover:border-[var(--accent-heart)]/50 transition-all duration-200"
          >
            Marketplace
          </a>
          <Link
            href="/auth/signin?callbackUrl=/dashboard"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-white/5 hover:border-[var(--accent-heart)]/50 transition-all duration-200"
          >
            <svg className="w-4 h-4 hidden sm:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
            Sign in
          </Link>
          <Link
            href="/auth/signup"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[var(--accent-heart)] to-[#0662c4] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-[var(--accent-heart)]/25 hover:shadow-[var(--accent-heart)]/40 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
          >
            <svg className="w-4 h-4 hidden sm:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            Sign up
          </Link>
          <ContinueAsAIButton />
        </div>
      </div>
    </header>
  );
}
