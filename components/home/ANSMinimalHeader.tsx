import Link from "next/link";

interface ANSMinimalHeaderProps {
  isAuthenticated?: boolean;
  variant?: "light" | "dark";
}

export function ANSMinimalHeader({ isAuthenticated = false, variant = "light" }: ANSMinimalHeaderProps) {
  const isDark = variant === "dark";

  const headerClasses = isDark
    ? "sticky top-0 z-20 bg-[#1e1e1e]/90 backdrop-blur-md border-b border-[var(--border)] shadow-sm shadow-black/20"
    : "sticky top-0 z-20 bg-white border-b border-[var(--light-border)]";

  const logoClasses = isDark
    ? "text-base font-extrabold tracking-tight text-[var(--text-primary)]"
    : "text-base font-extrabold tracking-tight text-[var(--light-text-primary)]";

  const navLinkClasses = isDark
    ? "text-sm text-[var(--text-tertiary)] hover:text-[var(--accent-heart)] transition-colors px-3 py-2"
    : "text-sm text-[var(--light-text-tertiary)] hover:text-[var(--light-accent)] transition-colors px-3 py-2";

  const signInClasses = isDark
    ? "text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors px-3 py-2"
    : "text-sm text-[var(--light-text-tertiary)] hover:text-[var(--light-text-primary)] transition-colors px-3 py-2";

  const signUpClasses = isDark
    ? "text-sm font-semibold text-white bg-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/90 px-4 py-2 rounded-xl transition-colors shadow-md shadow-[var(--accent-heart)]/20"
    : "text-sm font-semibold text-white bg-[var(--light-accent)] hover:bg-[var(--light-accent-hover)] px-4 py-2 rounded-xl transition-colors shadow-md shadow-blue-500/10";

  return (
    <header className={`${headerClasses} safe-area-inset-top`}>
      <div className="container mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 md:px-8 py-3 min-w-0 gap-2">
        <Link href="/" className="group shrink-0 min-h-[44px] flex items-center">
          <span className={logoClasses}>Xpersona</span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-4 flex-shrink-0" aria-label="Main navigation">
          {!isAuthenticated && (
            <>
              <Link href="/auth/signin?callbackUrl=/dashboard" className={`${signInClasses} min-h-[44px] flex items-center touch-manipulation rounded-lg`}>
                Sign in
              </Link>
              <Link href="/auth/signup" className={`${signUpClasses} min-h-[44px] flex items-center touch-manipulation`}>
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
