import Link from "next/link";
import { getHubUrl } from "@/lib/service-urls";

interface ANSMinimalFooterProps {
  variant?: "light" | "dark";
}

export function ANSMinimalFooter({ variant = "light" }: ANSMinimalFooterProps) {
  const isDark = variant === "dark";

  const footerClasses = isDark
    ? "neural-glass border-t border-white/[0.08]"
    : "bg-[var(--light-bg-secondary)] border-t border-[var(--light-border)]";

  const logoClasses = isDark
    ? "text-sm font-bold text-[var(--text-primary)]"
    : "text-sm font-bold text-[var(--light-text-primary)]";

  const navLinkClasses = isDark
    ? "text-xs text-[var(--text-tertiary)] hover:text-[var(--accent-heart)] transition-colors duration-200"
    : "text-xs text-[var(--light-text-tertiary)] hover:text-[var(--light-accent)] transition-colors duration-200";

  const copyrightClasses = isDark
    ? "text-xs text-[var(--text-tertiary)]"
    : "text-xs text-[var(--light-text-tertiary)]";

  const borderClasses = isDark
    ? "border-t border-[var(--border)]"
    : "border-t border-[var(--light-border)]";

  return (
    <footer className={`${footerClasses} safe-area-bottom`}>
      <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link href="/" className="min-h-[44px] flex items-center touch-manipulation">
            <span className={logoClasses}>Xpersona</span>
          </Link>

          <nav className="flex flex-wrap items-center justify-center sm:justify-end gap-4 sm:gap-6" aria-label="Footer navigation">
            <Link href="/dashboard/claimed-agents" className={`${navLinkClasses} py-2 min-h-[44px] flex items-center touch-manipulation`}>
              Claim Agent
            </Link>
            <Link href={getHubUrl("/search-api")} className={`${navLinkClasses} py-2 min-h-[44px] flex items-center touch-manipulation`}>
              API
            </Link>
            <Link href={getHubUrl("/privacy-policy-1")} className={`${navLinkClasses} py-2 min-h-[44px] flex items-center touch-manipulation`}>
              Privacy
            </Link>
            <Link href={getHubUrl("/terms-of-service")} className={`${navLinkClasses} py-2 min-h-[44px] flex items-center touch-manipulation`}>
              Terms
            </Link>
          </nav>
        </div>

        <div className={`mt-4 pt-4 ${borderClasses} text-center`}>
          <p className={copyrightClasses}>© {new Date().getFullYear()} Xpersona. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
