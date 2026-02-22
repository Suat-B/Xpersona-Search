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

  const bgImage = typeof process.env.NEXT_PUBLIC_HOME_BG_IMAGE === "string"
    ? process.env.NEXT_PUBLIC_HOME_BG_IMAGE.trim()
    : null;

  return (
    <div className="h-screen min-h-dvh flex flex-col overflow-hidden bg-[var(--bg-deep)]">
      <div className="fixed inset-0 pointer-events-none">
        {bgImage && (
          <>
            <div
              className="absolute inset-0 bg-cover bg-center bg-no-repeat"
              style={{ backgroundImage: `url(${bgImage})` }}
              aria-hidden
            />
            <div className="absolute inset-0 bg-black/60" aria-hidden />
          </>
        )}
        <div className="absolute inset-0 bg-gradient-radial from-[var(--accent-heart)]/[0.18] via-transparent to-transparent" />
        <div className="absolute top-1/4 right-1/4 w-[32rem] h-[32rem] bg-[var(--accent-neural)]/[0.14] rounded-full blur-3xl home-bg-drift" />
        <div className="absolute bottom-1/4 left-1/4 w-[28rem] h-[28rem] bg-[var(--accent-heart)]/[0.12] rounded-full blur-3xl home-bg-drift" style={{ animationDelay: "-6s" }} />
      </div>

      <header className="relative flex justify-end items-center px-6 py-4 gap-4 shrink-0 z-20">
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

      <main className="relative flex-1 flex flex-col items-center justify-center px-4 -mt-16 z-10 overflow-y-auto">
        <Link
          href="/"
          className="mb-8 group block text-center home-logo-link"
          aria-label="Xpersona home">
          <span className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-[var(--text-primary)] select-none logo-glow home-logo-text inline-block animate-fade-in-up animate-delay-75">
            Xpersona
          </span>
        </Link>

        <form onSubmit={handleSearch} className="w-full max-w-3xl mt-6 animate-fade-in-up animate-delay-225">
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
              autoFocus
              className="w-full pl-14 pr-24 py-3 sm:py-4 bg-transparent text-[var(--text-primary)] placeholder-[var(--text-tertiary)] text-base sm:text-lg rounded-2xl focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
                params.set("browse", "1");
                params.delete("q");
                router.push(`/?${params.toString()}`);
              }}
              className="absolute right-2 px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--accent-heart)] rounded-lg hover:bg-white/5 transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:ring-offset-2 focus:ring-offset-[var(--bg-deep)]"
              aria-label="Browse all agents"
            >
              Browse
            </button>
          </div>

          <div className="flex justify-center gap-4 mt-6">
            <button
              type="submit"
              className="px-8 py-3.5 bg-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/90 active:scale-[0.98] active:bg-[var(--accent-heart)]/80 text-white text-sm font-semibold rounded-2xl shadow-lg shadow-[var(--accent-heart)]/25 hover:shadow-[var(--accent-heart)]/40 transition-all focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:ring-offset-2 focus:ring-offset-[var(--bg-deep)]"
            >
              Xpersona Search
            </button>
            <button
              type="button"
              onClick={handleLucky}
              className="px-8 py-3.5 neural-glass hover:border-white/[0.2] active:scale-[0.98] text-[var(--text-primary)] text-sm font-medium rounded-2xl border border-white/[0.1] transition-all focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:ring-offset-2 focus:ring-offset-[var(--bg-deep)]"
            >
              New Agent
            </button>
          </div>
        </form>
      </main>

      <footer className="relative shrink-0 py-4 px-6 sm:px-8 border-t border-white/[0.1] neural-glass z-10">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 max-w-6xl mx-auto">
          <Link href="/" className="text-sm font-bold text-[var(--text-primary)] hover:text-[var(--accent-heart)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/30 focus:ring-offset-2 focus:ring-offset-transparent rounded shrink-0">
            Xpersona
          </Link>
          <nav className="flex gap-4 sm:gap-6 text-sm text-[var(--text-tertiary)] shrink-0">
            <Link href="/docs" className="hover:text-[var(--text-secondary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/30 focus:ring-offset-2 focus:ring-offset-transparent rounded">
              Docs
            </Link>
            <Link href="/search-api" className="hover:text-[var(--text-secondary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/30 focus:ring-offset-2 focus:ring-offset-transparent rounded">
              API
            </Link>
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
