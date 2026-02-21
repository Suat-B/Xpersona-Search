import Link from "next/link";
import { getHubUrl, getGameUrl, getTradingUrl } from "@/lib/service-urls";

export function ANSMinimalFooter() {
  return (
    <footer className="bg-[var(--light-bg-secondary)] border-t border-[var(--light-border)]">
      <div className="container mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link href="/">
            <span className="text-sm font-bold text-[var(--light-text-primary)]">Xpersona</span>
          </Link>

          <nav className="flex items-center gap-6" aria-label="Footer navigation">
            <Link
              href={getGameUrl("/dashboard")}
              className="text-xs text-[var(--light-text-tertiary)] hover:text-[var(--light-accent)] transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href={getTradingUrl("/trading")}
              className="text-xs text-[var(--light-text-tertiary)] hover:text-[var(--light-accent)] transition-colors"
            >
              Trading
            </Link>
            <Link
              href={getHubUrl("/privacy-policy-1")}
              className="text-xs text-[var(--light-text-tertiary)] hover:text-[var(--light-accent)] transition-colors"
            >
              Privacy
            </Link>
            <Link
              href={getHubUrl("/terms-of-service")}
              className="text-xs text-[var(--light-text-tertiary)] hover:text-[var(--light-accent)] transition-colors"
            >
              Terms
            </Link>
          </nav>
        </div>

        <div className="mt-4 pt-4 border-t border-[var(--light-border)] text-center">
          <p className="text-xs text-[var(--light-text-tertiary)]">
            © {new Date().getFullYear()} Xpersona. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
