"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { HomeThemePicker } from "@/components/home/HomeThemePicker";
import { SearchSuggestions, type SearchSuggestionsHandle, type SuggestionAgent } from "@/components/search/SearchSuggestions";
import { applyPreset, HOME_ACCENT_STORAGE_KEY, type ThemePresetId } from "@/lib/theme-presets";
import { addRecentSearch } from "@/lib/search-history";
import { apiV1 } from "@/lib/api/url";

interface GoogleStyleHomeProps {
  isAuthenticated?: boolean;
  /** Pass from Server Component to avoid hydration mismatch (NEXTAUTH_URL is server-only) */
  privacyUrl?: string;
  termsUrl?: string;
}

const BLUR_DELAY_MS = 150;
const LUCKY_FALLBACK_QUERIES = [
  "python",
  "mcp",
  "openclaw",
  "voice",
  "browser",
  "agent",
  "automation",
  "developer tools",
  "research",
  "productivity",
] as const;

export function GoogleStyleHome({
  isAuthenticated = false,
  privacyUrl = "/privacy-policy-1",
  termsUrl = "/terms-of-service",
}: GoogleStyleHomeProps) {
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const searchAnchorRef = useRef<HTMLDivElement>(null);
  const suggestionsRef = useRef<SearchSuggestionsHandle>(null);
  const router = useRouter();
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [supportName, setSupportName] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  const supportRecipient = "Suat.Bastug@icloud.com";
  const [supportStatus, setSupportStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [supportError, setSupportError] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setShowSuggestions(false);
    if (query.trim()) {
      addRecentSearch(query.trim());
      router.push(`/?q=${encodeURIComponent(query.trim())}`);
      return;
    }
    router.push("/?browse=1");
  };

  const handleLucky = async () => {
    let luckyQuery = "";

    try {
      const res = await fetch("/api/v1/search/trending", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && Array.isArray(data?.trending)) {
        const trending = data.trending
          .filter((q: unknown): q is string => typeof q === "string")
          .map((q: string) => q.trim())
          .filter(Boolean);
        if (trending.length > 0) {
          luckyQuery = trending[Math.floor(Math.random() * trending.length)] ?? "";
        }
      }
    } catch {
      // fall through to local fallback list
    }

    if (!luckyQuery) {
      luckyQuery =
        LUCKY_FALLBACK_QUERIES[
          Math.floor(Math.random() * LUCKY_FALLBACK_QUERIES.length)
        ] ?? "agent";
    }

    addRecentSearch(luckyQuery);
    router.push(`/?q=${encodeURIComponent(luckyQuery)}`);
  };

  const handleSuggestionSelect = (agent: SuggestionAgent) => {
    router.push(`/agent/${agent.slug}`);
  };

  const handleQuerySelect = (text: string) => {
    setQuery(text);
    addRecentSearch(text.trim());
    router.push(`/?q=${encodeURIComponent(text.trim())}`);
  };

  const handleFocus = () => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = undefined;
    }
    setIsFocused(true);
    setShowSuggestions(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
    blurTimeoutRef.current = setTimeout(() => setShowSuggestions(false), BLUR_DELAY_MS);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(e.key)) {
      suggestionsRef.current?.handleKeyDown(e);
    }
  };

  const openSupport = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowSupportModal(true);
  };

  const closeSupport = () => {
    setShowSupportModal(false);
    setSupportStatus("idle");
    setSupportError("");
  };

  const submitSupport = async (e: React.FormEvent) => {
    e.preventDefault();
    setSupportStatus("sending");
    setSupportError("");
    try {
      const res = await fetch(apiV1("/support"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: supportName.trim(),
          email: supportEmail.trim(),
          message: supportMessage.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || "Failed to send email");
      }
      setSupportStatus("sent");
      setSupportName("");
      setSupportEmail("");
      setSupportMessage("");
    } catch (err) {
      setSupportStatus("error");
      setSupportError(err instanceof Error ? err.message : "Failed to send email");
    }
  };

  useEffect(() => {
    try {
      const stored = localStorage.getItem(HOME_ACCENT_STORAGE_KEY) as ThemePresetId | null;
      if (stored) applyPreset(stored);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => () => {
    if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
  }, []);

  const bgImage = typeof process.env.NEXT_PUBLIC_HOME_BG_IMAGE === "string"
    ? process.env.NEXT_PUBLIC_HOME_BG_IMAGE.trim()
    : null;

  return (
    <div className="min-h-dvh flex flex-col overflow-x-hidden bg-[var(--bg-deep)]">
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

      <header className="relative flex justify-end items-center px-4 sm:px-6 py-3 sm:py-4 gap-3 sm:gap-4 shrink-0 z-20 safe-area-inset-top">
        <div className="hidden sm:flex">
          <HomeThemePicker />
        </div>
        {!isAuthenticated && (
          <>
            <Link
              href="/auth/signin?callbackUrl=/dashboard"
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:ring-offset-2 focus:ring-offset-[var(--bg-deep)] rounded-full px-3 py-2.5 min-h-[44px] flex items-center touch-manipulation"
            >
              Sign in
            </Link>
            <Link
              href="/auth/signup"
              className="text-sm font-medium text-white bg-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/90 active:bg-[var(--accent-heart)]/80 px-5 py-2.5 rounded-full min-h-[44px] flex items-center transition-all hover:shadow-lg hover:shadow-[var(--accent-heart)]/20 focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:ring-offset-2 focus:ring-offset-[var(--bg-deep)] touch-manipulation"
            >
              Sign up
            </Link>
          </>
        )}
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-start px-4 py-5 sm:px-6 sm:py-0 sm:justify-center sm:-mt-24 md:-mt-28 overflow-y-auto overscroll-contain">
        <Link
          href="/"
          className="mb-6 sm:mb-8 group block text-center home-logo-link"
          aria-label="Xpersona home">
          <span className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight text-white select-none logo-glow home-logo-text inline-block animate-fade-in-up animate-delay-75">
            Xpersona
          </span>
        </Link>

        <form onSubmit={handleSearch} className="w-full max-w-2xl mt-4 sm:mt-6 animate-fade-in-up animate-delay-225">
          <div
            ref={searchAnchorRef}
            className={`relative z-30 flex items-center w-full rounded-xl sm:rounded-2xl neural-glass neural-glass-hover border transition-all duration-300 ${
              isFocused
                ? "border-[var(--accent-heart)]/50 shadow-[0_0_24px_var(--border-glow)] ring-2 ring-[var(--accent-heart)]/25"
                : "border-white/[0.1] hover:border-white/[0.15] shadow-[0_4px_24px_rgba(0,0,0,0.3)]"
            }`}
          >
            <div className="absolute left-3 sm:left-5 w-4 h-4 sm:w-5 sm:h-5 text-[var(--text-tertiary)] pointer-events-none" aria-hidden>
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
              onFocus={handleFocus}
              onBlur={handleBlur}
              onKeyDown={handleInputKeyDown}
              placeholder="Search AI agents..."
              aria-label="Search AI agents"
              aria-autocomplete="list"
              aria-controls="agent-suggestions"
              aria-expanded={showSuggestions}
              autoComplete="off"
              autoFocus
              className="w-full pl-10 sm:pl-12 pr-4 py-3 sm:py-3.5 bg-transparent text-[var(--text-primary)] placeholder-[var(--text-tertiary)] text-base sm:text-lg rounded-xl sm:rounded-2xl focus:outline-none min-h-[46px] touch-manipulation"
            />
            <SearchSuggestions
              ref={suggestionsRef}
              query={query}
              onSelect={handleSuggestionSelect}
              onQuerySelect={handleQuerySelect}
              onClose={() => setShowSuggestions(false)}
              anchorRef={searchAnchorRef}
              visible={showSuggestions}
              mobileInline
            />
          </div>

          <div className="relative z-10 flex flex-row justify-center gap-2 sm:gap-4 mt-4 sm:mt-6 w-full">
            <button
              type="submit"
              className="flex-1 sm:flex-none px-4 sm:px-8 py-3.5 min-h-[48px] bg-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/90 active:scale-[0.98] active:bg-[var(--accent-heart)]/80 text-white text-xs sm:text-sm font-semibold rounded-xl sm:rounded-2xl shadow-lg shadow-[var(--accent-heart)]/25 hover:shadow-[var(--accent-heart)]/40 transition-all focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:ring-offset-2 focus:ring-offset-[var(--bg-deep)] touch-manipulation whitespace-nowrap"
            >
              Xpersona Search
            </button>
            <Link
              href="/marketplace"
              className="flex-1 sm:flex-none px-4 sm:px-8 py-3.5 min-h-[48px] neural-glass hover:border-white/[0.2] active:scale-[0.98] text-[var(--text-primary)] text-xs sm:text-sm font-medium rounded-xl sm:rounded-2xl border border-white/[0.1] transition-all focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:ring-offset-2 focus:ring-offset-[var(--bg-deep)] touch-manipulation whitespace-nowrap inline-flex items-center justify-center"
            >
              Marketplace
            </Link>
            <Link
              href="/graph"
              className="flex-1 sm:flex-none px-4 sm:px-8 py-3.5 min-h-[48px] neural-glass hover:border-white/[0.2] active:scale-[0.98] text-[var(--text-primary)] text-xs sm:text-sm font-medium rounded-xl sm:rounded-2xl border border-white/[0.1] transition-all focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:ring-offset-2 focus:ring-offset-[var(--bg-deep)] touch-manipulation whitespace-nowrap inline-flex items-center justify-center"
            >
              Graph
            </Link>
            <Link
              href="/reliability"
              className="flex-1 sm:flex-none px-4 sm:px-8 py-3.5 min-h-[48px] neural-glass hover:border-white/[0.2] active:scale-[0.98] text-[var(--text-primary)] text-xs sm:text-sm font-medium rounded-xl sm:rounded-2xl border border-white/[0.1] transition-all focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:ring-offset-2 focus:ring-offset-[var(--bg-deep)] touch-manipulation whitespace-nowrap inline-flex items-center justify-center"
            >
              Reliability
            </Link>
            <button
              type="button"
              onClick={handleLucky}
              className="flex-1 sm:flex-none px-4 sm:px-8 py-3.5 min-h-[48px] neural-glass hover:border-white/[0.2] active:scale-[0.98] text-[var(--text-primary)] text-xs sm:text-sm font-medium rounded-xl sm:rounded-2xl border border-white/[0.1] transition-all focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:ring-offset-2 focus:ring-offset-[var(--bg-deep)] touch-manipulation whitespace-nowrap"
            >
              I'm Feeling Lucky
            </button>
          </div>
        </form>

        <div className="mt-6 sm:mt-8 animate-fade-in-up animate-delay-300 flex flex-col items-center gap-2">
          <Link
            href="/dashboard/claimed-agents"
            className="inline-flex items-center text-sm text-[var(--text-tertiary)] hover:text-[var(--accent-heart)] transition-colors group"
          >
            Are you a developer? Customize your agent page
          </Link>
        </div>
      </main>

      <footer className="relative shrink-0 w-full py-3 sm:py-3.5 px-6 sm:px-8 md:px-12 lg:px-16 bg-black/40 border-t border-white/[0.08] z-10 safe-area-bottom">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-6 w-full">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 sm:gap-6 text-xs sm:text-[13px] text-[var(--text-tertiary)]">
            <Link href="/" className="hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/30 focus:ring-offset-2 focus:ring-offset-transparent rounded py-1.5 min-h-[44px] flex items-center touch-manipulation">
              Xpersona
            </Link>
            <Link href="/dashboard/claimed-agents" className="hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/30 focus:ring-offset-2 focus:ring-offset-transparent rounded py-1.5 min-h-[44px] flex items-center touch-manipulation">
              Claim + Customize
            </Link>
            <Link href="/search-api" className="hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/30 focus:ring-offset-2 focus:ring-offset-transparent rounded py-1.5 min-h-[44px] flex items-center touch-manipulation">
              API
            </Link>
            <Link href="/domains" className="hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/30 focus:ring-offset-2 focus:ring-offset-transparent rounded py-1.5 min-h-[44px] flex items-center touch-manipulation">
              Domains
            </Link>
            <Link href="/marketplace" className="hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/30 focus:ring-offset-2 focus:ring-offset-transparent rounded py-1.5 min-h-[44px] flex items-center touch-manipulation">
              Marketplace
            </Link>
            <Link href="/graph" className="hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/30 focus:ring-offset-2 focus:ring-offset-transparent rounded py-1.5 min-h-[44px] flex items-center touch-manipulation">
              Graph
            </Link>
            <Link href="/reliability" className="hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/30 focus:ring-offset-2 focus:ring-offset-transparent rounded py-1.5 min-h-[44px] flex items-center touch-manipulation">
              Reliability
            </Link>
            <span className="hidden md:inline-flex items-center gap-1.5 text-[var(--text-quaternary)]">
              <svg className="w-3.5 h-3.5 text-emerald-400/80 shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path d="M12 2C8 8 6 12 6 16c0 3.3 2.7 6 6 6s6-2.7 6-6c0-4-2-8-6-14z" />
              </svg>
              Search AI agents, skills, and tools
            </span>
          </div>
          <nav className="flex flex-wrap items-center justify-center sm:justify-end gap-4 sm:gap-6 text-xs sm:text-[13px] text-[var(--text-tertiary)]">
            <button
              type="button"
              onClick={openSupport}
              className="hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/30 focus:ring-offset-2 focus:ring-offset-transparent rounded py-1.5 min-h-[44px] flex items-center touch-manipulation"
            >
              Support
            </button>
            <Link href={privacyUrl} className="hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/30 focus:ring-offset-2 focus:ring-offset-transparent rounded py-1.5 min-h-[44px] flex items-center touch-manipulation">
              Privacy
            </Link>
            <Link href={termsUrl} className="hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/30 focus:ring-offset-2 focus:ring-offset-transparent rounded py-1.5 min-h-[44px] flex items-center touch-manipulation">
              Terms
            </Link>
          </nav>
        </div>
      </footer>

      {showSupportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            onClick={closeSupport}
            aria-label="Close support form"
          />
          <div className="relative w-full max-w-md rounded-2xl border border-white/[0.1] bg-[#0b0b0f] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Contact Support</h2>
              <button
                type="button"
                onClick={closeSupport}
                className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="text-sm text-[var(--text-tertiary)] mb-4">
              Send a support message directly to {supportRecipient}.
            </p>
            <form onSubmit={submitSupport} className="space-y-3">
              <input
                type="text"
                placeholder="Your name (optional)"
                value={supportName}
                onChange={(e) => setSupportName(e.target.value)}
                className="w-full rounded-lg border border-white/[0.1] bg-white/5 px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/40"
              />
              <input
                type="email"
                placeholder="Your email (optional)"
                value={supportEmail}
                onChange={(e) => setSupportEmail(e.target.value)}
                className="w-full rounded-lg border border-white/[0.1] bg-white/5 px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/40"
              />
              <textarea
                placeholder="How can we help?"
                value={supportMessage}
                onChange={(e) => setSupportMessage(e.target.value)}
                rows={5}
                className="w-full rounded-lg border border-white/[0.1] bg-white/5 px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/40"
              />
              {supportStatus === "sent" && (
                <div className="text-sm text-emerald-400">Message sent. We will get back to you soon.</div>
              )}
              {supportStatus === "error" && (
                <div className="text-sm text-rose-400">{supportError || "Failed to send email"}</div>
              )}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeSupport}
                  className="px-4 py-2 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={supportStatus === "sending"}
                  className="px-4 py-2 text-sm font-semibold text-white bg-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/90 rounded-lg transition-colors"
                >
                  {supportStatus === "sending" ? "Sending..." : "Send Email"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}




