import Link from "next/link";
import { getGameUrl, getTradingUrl } from "@/lib/service-urls";

interface ANSMinimalHeaderProps {
  isAuthenticated?: boolean;
}

export function ANSMinimalHeader({ isAuthenticated = false }: ANSMinimalHeaderProps) {
  return (
    <header className="sticky top-0 z-20 bg-white border-b border-[var(--light-border)]">
      <div className="container mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 py-3 min-w-0">
        <Link href="/" className="group">
          <span className="text-lg font-bold tracking-tight text-[var(--light-text-primary)]">
            Xpersona
          </span>
        </Link>
        <nav className="flex items-center gap-2 sm:gap-4" aria-label="Main navigation">
          {isAuthenticated ? (
            <>
              <Link
                href={getGameUrl("/dashboard")}
                className="text-sm text-[var(--light-text-tertiary)] hover:text-[var(--light-accent)] transition-colors px-3 py-2"
              >
                Dashboard
              </Link>
              <Link
                href={getTradingUrl("/trading")}
                className="text-sm text-[var(--light-text-tertiary)] hover:text-[var(--light-accent)] transition-colors px-3 py-2"
              >
                Trading
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/auth/signin?callbackUrl=/dashboard"
                className="text-sm text-[var(--light-text-tertiary)] hover:text-[var(--light-text-primary)] transition-colors px-3 py-2"
              >
                Sign in
              </Link>
              <Link
                href="/auth/signup"
                className="text-sm font-semibold text-white bg-[var(--light-accent)] hover:bg-[var(--light-accent-hover)] px-4 py-2 rounded-xl transition-colors shadow-md shadow-blue-500/10"
              >
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
