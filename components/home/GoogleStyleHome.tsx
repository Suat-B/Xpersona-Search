"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface GoogleStyleHomeProps {
  isAuthenticated?: boolean;
  /** Pass from Server Component to avoid hydration mismatch (NEXTAUTH_URL is server-only) */
  privacyUrl?: string;
  termsUrl?: string;
}

export function GoogleStyleHome({
  isAuthenticated = false,
  privacyUrl = "/privacy-policy-1",
  termsUrl = "/terms-of-service",
}: GoogleStyleHomeProps) {
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/?q=${encodeURIComponent(query.trim())}`);
    }
  };

  const handleLucky = () => {
    router.push("/?q=discover");
  };

  return (
    <div className="h-screen min-h-dvh flex flex-col overflow-hidden bg-[var(--bg-deep)]">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-radial from-[var(--accent-heart)]/[0.03] via-transparent to-transparent" />
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-[var(--accent-neural)]/[0.02] rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-[var(--accent-heart)]/[0.02] rounded-full blur-3xl" />
      </div>

      <header className="relative flex justify-end items-center px-6 py-4 gap-4 shrink-0 z-10">
        {isAuthenticated ? (
          <Link
            href="/dashboard"
            className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:ring-offset-2 focus:ring-offset-[var(--bg-deep)] rounded-full px-3 py-1.5"
          >
            Dashboard
          </Link>
        ) : (
          <>
            <Link
              href="/auth/signin?callbackUrl=/dashboard"
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:ring-offset-2 focus:ring-offset-[var(--bg-deep)] rounded-full px-3 py-1.5"
            >
              Sign in
            </Link>
            <Link
              href="/auth/signup"
              className="text-sm font-medium text-white bg-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/90 active:bg-[var(--accent-heart)]/80 px-5 py-2.5 rounded-full transition-all hover:shadow-lg hover:shadow-[var(--accent-heart)]/20 focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:ring-offset-2 focus:ring-offset-[var(--bg-deep)]"
            >
              Sign up
            </Link>
          </>
        )}
      </header>

      <main className="relative flex-1 flex flex-col items-center justify-center px-4 -mt-16 z-10">
        <Link href="/" className="mb-10 group block" aria-label="Xpersona home">
          <span className="text-6xl sm:text-7xl md:text-8xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-heart)] via-[var(--accent-neural)] to-[var(--accent-heart)] select-none transition-all duration-500 group-hover:from-[var(--accent-neural)] group-hover:via-[var(--accent-heart)] group-hover:to-[var(--accent-neural)]">
            Xpersona
          </span>
        </Link>

        <form onSubmit={handleSearch} className="w-full max-w-2xl">
          <div
            className={`relative flex items-center w-full rounded-2xl bg-[rgba(255,255,255,0.03)] border transition-all duration-300 ${
              isFocused
                ? "border-[var(--accent-heart)]/50 shadow-lg shadow-[var(--accent-heart)]/10 ring-2 ring-[var(--accent-heart)]/20"
                : "border-[var(--border)] hover:border-[var(--border-strong)]"
            }`}
          >
            <div className="absolute left-5 w-5 h-5 text-[var(--text-tertiary)] pointer-events-none" aria-hidden>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="Search AI agents..."
              aria-label="Search AI agents"
              autoComplete="off"
              className="w-full pl-14 pr-5 py-4 sm:py-5 bg-transparent text-[var(--text-primary)] placeholder-[var(--text-tertiary)] text-base sm:text-lg rounded-2xl focus:outline-none"
            />
          </div>

          <div className="flex justify-center gap-4 mt-8">
            <button
              type="submit"
              className="px-8 py-3 bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.08)] active:bg-[rgba(255,255,255,0.06)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm font-medium rounded-full border border-[var(--border)] hover:border-[var(--border-strong)] transition-all focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:ring-offset-2 focus:ring-offset-[var(--bg-deep)]"
            >
              Xpersona Search
            </button>
            <button
              type="button"
              onClick={handleLucky}
              className="px-8 py-3 bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.08)] active:bg-[rgba(255,255,255,0.06)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm font-medium rounded-full border border-[var(--border)] hover:border-[var(--border-strong)] transition-all focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:ring-offset-2 focus:ring-offset-[var(--bg-deep)]"
            >
              I&apos;m Feeling Lucky
            </button>
          </div>
        </form>
      </main>

      <footer className="relative shrink-0 py-4 px-6 border-t border-[var(--border)] bg-[var(--bg-deep)]/80 backdrop-blur-md z-10">
        <div className="flex flex-wrap justify-center gap-8 text-sm text-[var(--text-tertiary)]">
          <Link href={privacyUrl} className="hover:text-[var(--text-secondary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/30 focus:ring-offset-2 focus:ring-offset-transparent rounded">
            Privacy
          </Link>
          <Link href={termsUrl} className="hover:text-[var(--text-secondary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/30 focus:ring-offset-2 focus:ring-offset-transparent rounded">
            Terms
          </Link>
        </div>
      </footer>
    </div>
  );
}
