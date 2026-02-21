import Link from "next/link";
import { getGameUrl, getTradingUrl, getHubUrl } from "@/lib/service-urls";

/**
 * Minimal footer for hub (xpersona.co) — de-emphasized Game and Marketplace links per ANS spec.
 */
export function ANSMinimalFooter() {
  return (
    <footer className="border-t border-[var(--border)] bg-black/40 backdrop-blur-sm">
      <div className="container mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#0ea5e9] to-[#0077b6] shadow-lg">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <span className="text-sm font-medium text-[var(--text-primary)]">Xpersona</span>
          </Link>

          <nav className="flex items-center gap-6" aria-label="Footer navigation">
            <a
              href={getGameUrl("/")}
              className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Game
            </a>
            <a
              href={getTradingUrl("/")}
              className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Marketplace
            </a>
            <Link
              href={getHubUrl("/privacy-policy-1")}
              className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Privacy
            </Link>
            <Link
              href={getHubUrl("/terms-of-service")}
              className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Terms
            </Link>
          </nav>
        </div>

        <div className="mt-4 pt-4 border-t border-[var(--border)] text-center">
          <p className="text-xs text-[var(--text-tertiary)]">
            © {new Date().getFullYear()} Xpersona. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
