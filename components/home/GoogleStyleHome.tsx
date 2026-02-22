"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { HomeThemePicker } from "@/components/home/HomeThemePicker";
import { applyPreset, HOME_ACCENT_STORAGE_KEY, type ThemePresetId } from "@/lib/theme-presets";

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

  useEffect(() => {
    try {
      const stored = localStorage.getItem(HOME_ACCENT_STORAGE_KEY) as ThemePresetId | null;
      if (stored) applyPreset(stored);
    } catch {
      // ignore
    }
  }, []);

  return (
    <div className="h-screen min-h-dvh flex flex-col overflow-hidden bg-[var(--bg-deep)]">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 neural-grid opacity-40" aria-hidden />
        <div className="absolute inset-0 bg-gradient-radial from-[var(--accent-heart)]/[0.18] via-transparent to-transparent" />
        <div className="absolute top-1/4 right-1/4 w-[32rem] h-[32rem] bg-[var(--accent-neural)]/[0.14] rounded-full blur-3xl home-bg-drift" />
        <div className="absolute bottom-1/4 left-1/4 w-[28rem] h-[28rem] bg-[var(--accent-heart)]/[0.12] rounded-full blur-3xl home-bg-drift" style={{ animationDelay: "-6s" }} />
      </div>

      <header className="relative flex justify-end items-center px-6 py-4 gap-4 shrink-0 z-10">
        <HomeThemePicker />
        {!isAuthenticated && (
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
        <Link href="/" className="mb-8 group block text-center" aria-label="Xpersona home">
          <span className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-heart)] via-[var(--accent-neural)] to-[var(--accent-heart)] select-none transition-all duration-500 group-hover:from-[var(--accent-neural)] group-hover:via-[var(--accent-heart)] group-hover:to-[var(--accent-neural)] drop-shadow-[0_0_40px_rgba(10,132,255,0.2)]">
            Xpersona
          </span>
          <p className="mt-3 text-sm text-[var(--text-tertiary)] font-medium">
            Search 5,000+ AI agents
          </p>
        </Link>

        <form onSubmit={handleSearch} className="w-full max-w-3xl mt-6">
          <div
            className={`relative flex items-center w-full rounded-2xl neural-glass neural-glass-hover border transition-all duration-300 ${
              isFocused
                ? "border-[var(--accent-heart)]/50 shadow-[0_0_24px_var(--border-glow)] ring-2 ring-[var(--accent-heart)]/25"
                : "border-white/[0.1] hover:border-white/[0.15] shadow-[0_4px_24px_rgba(0,0,0,0.3)]"
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

          <div className="flex justify-center gap-4 mt-6">
            <button
              type="submit"
              className="px-8 py-3.5 bg-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/90 active:scale-[0.98] active:bg-[var(--accent-heart)]/80 text-white text-sm font-semibold rounded-full shadow-lg shadow-[var(--accent-heart)]/25 hover:shadow-[var(--accent-heart)]/40 transition-all focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:ring-offset-2 focus:ring-offset-[var(--bg-deep)]"
            >
              Xpersona Search
            </button>
            <button
              type="button"
              onClick={handleLucky}
              className="px-8 py-3.5 neural-glass hover:border-white/[0.2] active:scale-[0.98] text-[var(--text-primary)] text-sm font-medium rounded-full border border-white/[0.1] transition-all focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:ring-offset-2 focus:ring-offset-[var(--bg-deep)]"
            >
              I&apos;m Feeling Lucky
            </button>
          </div>
        </form>
      </main>

      <footer className="relative shrink-0 py-4 px-6 sm:px-8 border-t border-white/[0.1] neural-glass z-10">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 max-w-6xl mx-auto">
          <Link href="/" className="text-sm font-bold text-[var(--text-primary)] hover:text-[var(--accent-heart)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/30 focus:ring-offset-2 focus:ring-offset-transparent rounded shrink-0">
            Xpersona
          </Link>
          <p className="text-xs text-[var(--text-tertiary)] text-center sm:text-left shrink-0">
            Search 5,000+ AI agents · A2A, MCP, OpenClaw
          </p>
          <nav className="flex gap-6 text-sm text-[var(--text-tertiary)] shrink-0">
            <Link href={privacyUrl} className="hover:text-[var(--text-secondary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/30 focus:ring-offset-2 focus:ring-offset-transparent rounded">
              Privacy
            </Link>
            <Link href={termsUrl} className="hover:text-[var(--text-secondary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/30 focus:ring-offset-2 focus:ring-offset-transparent rounded">
              Terms
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
