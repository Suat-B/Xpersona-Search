import Link from "next/link";

interface ANSMinimalHeaderProps {
  isAuthenticated?: boolean;
  variant?: "light" | "dark";
}

export function ANSMinimalHeader({ isAuthenticated = false, variant = "light" }: ANSMinimalHeaderProps) {
  const isDark = variant === "dark";

  const headerClasses = isDark
    ? "sticky top-0 z-20 bg-[var(--bg-card)]/90 backdrop-blur-md border-b border-[var(--border)] shadow-sm shadow-black/20"
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
    <header className={headerClasses}>
      <div className="container mx-auto flex max-w-7xl items-center justify-between px-5 sm:px-8 py-3 min-w-0">
        <Link href="/" className="group">
          <span className={logoClasses}>Xpersona</span>
        </Link>
        <nav className="flex items-center gap-2 sm:gap-4" aria-label="Main navigation">
          {!isAuthenticated && (
            <>
              <Link href="/auth/signin?callbackUrl=/dashboard" className={signInClasses}>
                Sign in
              </Link>
              <Link href="/auth/signup" className={signUpClasses}>
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
