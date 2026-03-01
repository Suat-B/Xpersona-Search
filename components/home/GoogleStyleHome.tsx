"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { HomeThemePicker } from "@/components/home/HomeThemePicker";
import { SearchSuggestions, type SearchSuggestionsHandle, type SuggestionAgent } from "@/components/search/SearchSuggestions";
import { applyPreset, HOME_ACCENT_STORAGE_KEY, type ThemePresetId } from "@/lib/theme-presets";
import { addRecentSearch } from "@/lib/search-history";

interface GoogleStyleHomeProps {
  isAuthenticated?: boolean;
  /** Pass from Server Component to avoid hydration mismatch (NEXTAUTH_URL is server-only) */
  privacyUrl?: string;
  termsUrl?: string;
  /** Optional content rendered just above the footer (bottom of page). */
  bottomContent?: React.ReactNode;
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

const DEV_LINKS = [
  { label: "SDK", href: "/api" },
  { label: "AI Search", href: "/api/v1/search/ai?q=agent+planner&limit=3" },
  { label: "OpenAPI", href: "/api/v1/openapi/public" },
  { label: "Tool Pack", href: "/tool-pack" },
] as const;
const TOOL_PACK_BADGES = ["OpenAI", "Anthropic", "LangChain", "CrewAI", "AutoGen"] as const;

export function GoogleStyleHome({
  isAuthenticated = false,
  privacyUrl = "/privacy-policy-1",
  termsUrl = "/terms-of-service",
  bottomContent,
}: GoogleStyleHomeProps) {
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const searchAnchorRef = useRef<HTMLDivElement>(null);
  const suggestionsRef = useRef<SearchSuggestionsHandle>(null);
  const router = useRouter();
  const supportRecipient = "suat.bastug@icloud.com";
  const supportMailto = `mailto:${supportRecipient}`;
  const [showSupportModal, setShowSupportModal] = useState(false);

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
    <div className="min-h-dvh flex flex-col overflow-x-hidden bg-[#1e1e1e]">
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
      </header>

      <main
        className={`relative z-30 flex flex-1 flex-col items-center justify-center px-4 py-5 sm:px-6 sm:py-0 sm:-mt-24 md:-mt-28 ${bottomContent ? "pb-24 sm:pb-28" : ""
          }`}
      >
        <Link
          href="/"
          className="mb-6 sm:mb-8 group block text-center home-logo-link"
          aria-label="Xpersona home">
          <span className="inline-flex items-center gap-1.5 sm:gap-2.5">
            <span className="text-2xl sm:text-4xl md:text-5xl font-black tracking-tight text-white select-none logo-glow home-logo-text inline-block animate-fade-in-up animate-delay-75">
              Xpersona
            </span>
            <Image
              src="/xpersona-logo-1.png"
              alt="Xpersona logo"
              width={64}
              height={64}
              priority
              className="h-10 sm:h-12 md:h-14 w-auto select-none logo-glow home-logo-text inline-block animate-fade-in-up animate-delay-75"
            />
          </span>
        </Link>

        <form onSubmit={handleSearch} className="relative z-50 w-full max-w-2xl mt-4 sm:mt-6 animate-fade-in-up animate-delay-225">
          <div
            ref={searchAnchorRef}
            className={`relative z-40 flex items-center w-full rounded-xl sm:rounded-2xl neural-glass neural-glass-hover border transition-all duration-300 ${isFocused
              ? "border-[var(--accent-heart)]/50 shadow-[0_0_24px_var(--border-glow)] ring-2 ring-[var(--accent-heart)]/25"
              : "border-white/[0.1] hover:border-white/[0.15] shadow-[0_4px_24px_rgba(0,0,0,0.3)]"
              }`}
          >
            <div className="absolute left-4 sm:left-5 w-4 h-4 sm:w-5 sm:h-5 text-[var(--text-tertiary)] pointer-events-none" aria-hidden>
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
              placeholder="Search AI Agents"
              aria-label="Search AI agents"
              aria-autocomplete="list"
              aria-controls="agent-suggestions"
              aria-expanded={showSuggestions}
              autoComplete="off"
              enterKeyHint="search"
              className="w-full pl-14 sm:pl-14 pr-4 py-3 sm:py-3.5 bg-transparent text-[var(--text-primary)] placeholder-[var(--text-tertiary)] text-base sm:text-lg rounded-xl sm:rounded-2xl focus:outline-none min-h-[46px] touch-manipulation appearance-none"
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

          <div className="relative z-0 flex flex-row justify-center gap-2 sm:gap-4 mt-4 sm:mt-6 w-full">
            <button
              type="submit"
              className="flex-1 sm:flex-none px-4 sm:px-8 py-3.5 min-h-[48px] bg-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/90 active:scale-[0.98] active:bg-[var(--accent-heart)]/80 text-white text-xs sm:text-sm font-semibold rounded-xl sm:rounded-2xl shadow-lg shadow-[var(--accent-heart)]/25 hover:shadow-[var(--accent-heart)]/40 transition-all focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:ring-offset-2 focus:ring-offset-[#1e1e1e] touch-manipulation whitespace-nowrap"
            >
              Search
            </button>
            <Link
              href="/marketplace"
              className="flex-1 sm:flex-none px-4 sm:px-8 py-3.5 min-h-[48px] neural-glass hover:border-white/[0.2] active:scale-[0.98] text-[var(--text-primary)] text-xs sm:text-sm font-medium rounded-xl sm:rounded-2xl border border-white/[0.1] transition-all focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:ring-offset-2 focus:ring-offset-[#1e1e1e] touch-manipulation whitespace-nowrap inline-flex items-center justify-center"
            >
              Marketplace
            </Link>
            <Link
              href="/graph"
              className="flex-1 sm:flex-none px-4 sm:px-8 py-3.5 min-h-[48px] neural-glass hover:border-white/[0.2] active:scale-[0.98] text-[var(--text-primary)] text-xs sm:text-sm font-medium rounded-xl sm:rounded-2xl border border-white/[0.1] transition-all focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:ring-offset-2 focus:ring-offset-[#1e1e1e] touch-manipulation whitespace-nowrap inline-flex items-center justify-center"
            >
              Graph
            </Link>
            <Link
              href="/reliability"
              className="flex-1 sm:flex-none px-4 sm:px-8 py-3.5 min-h-[48px] neural-glass hover:border-white/[0.2] active:scale-[0.98] text-[var(--text-primary)] text-xs sm:text-sm font-medium rounded-xl sm:rounded-2xl border border-white/[0.1] transition-all focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:ring-offset-2 focus:ring-offset-[#1e1e1e] touch-manipulation whitespace-nowrap inline-flex items-center justify-center"
            >
              Reliability
            </Link>
          </div>
        </form>

        <section className="relative z-10 w-full max-w-2xl mt-6 animate-fade-in-up animate-delay-250">
          <div className="rounded-2xl border border-[var(--accent-heart)]/25 bg-[var(--bg-card)]/70 p-4 sm:p-5 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Tool Pack</p>
                <p className="mt-2 text-sm sm:text-base text-[var(--text-primary)] font-semibold">
                  Drop-in tool JSON for every major agent framework
                </p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  One copy-paste unlocks /search/ai, /snapshot, /contract, and /trust.
                </p>
              </div>
              <Link
                href="/tool-pack"
                className="inline-flex items-center justify-center rounded-xl bg-[var(--accent-heart)] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
              >
                View Tool Pack
              </Link>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-[10px] text-[var(--text-secondary)]">
              {TOOL_PACK_BADGES.map((label) => (
                <span key={label} className="rounded-full border border-white/10 bg-black/40 px-2 py-1">
                  {label}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="relative z-10 w-full max-w-2xl mt-5 sm:mt-6 animate-fade-in-up animate-delay-300">
          <div className="flex flex-wrap items-center justify-center gap-2 text-[10px] sm:text-[11px] text-center">
            <span className="inline-flex items-center rounded-full border border-[var(--accent-heart)]/30 bg-[var(--accent-heart)]/10 px-2 py-0.5 text-[var(--accent-heart)] font-medium">
              New
            </span>
            <code className="text-[10px] text-[var(--text-secondary)] bg-white/5 border border-white/[0.08] rounded px-1.5 py-0.5">
              npm i @xpersona-search/search-sdk
            </code>
            {DEV_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </section>

      </main>

      <div className="relative shrink-0 w-full">
        {bottomContent && (
          <div className="absolute left-0 right-0 bottom-full z-20 px-4 sm:px-6 pb-1 pointer-events-auto">
            {bottomContent}
          </div>
        )}

        <footer className="relative w-full py-2 sm:py-3.5 px-4 sm:px-8 md:px-12 lg:px-16 bg-black/40 border-t border-white/[0.08] z-10 safe-area-bottom overflow-x-auto">
          <div className="flex flex-row items-center justify-between gap-2 sm:gap-6 w-full min-w-max flex-nowrap">
            <div className="flex flex-nowrap items-center justify-center sm:justify-start gap-2.5 sm:gap-6 text-[11px] sm:text-[13px] text-[var(--text-tertiary)] whitespace-nowrap">
              <Link href="/" className="hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/30 focus:ring-offset-2 focus:ring-offset-transparent rounded py-1 sm:py-1.5 min-h-[34px] sm:min-h-[44px] flex items-center touch-manipulation">
                Xpersona
              </Link>
              <Link href="/dashboard/claimed-agents" className="hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/30 focus:ring-offset-2 focus:ring-offset-transparent rounded py-1 sm:py-1.5 min-h-[34px] sm:min-h-[44px] flex items-center touch-manipulation">
                Claim + Customize
              </Link>
              <Link href="/api" className="hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/30 focus:ring-offset-2 focus:ring-offset-transparent rounded py-1 sm:py-1.5 min-h-[34px] sm:min-h-[44px] flex items-center touch-manipulation">
                API
              </Link>
              <Link href="/api/v1/openapi/public" className="hidden sm:flex hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/30 focus:ring-offset-2 focus:ring-offset-transparent rounded py-1 sm:py-1.5 min-h-[34px] sm:min-h-[44px] items-center touch-manipulation">
                OpenAPI
              </Link>
              <Link href="/api/v1/search/tool" className="hidden sm:flex hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/30 focus:ring-offset-2 focus:ring-offset-transparent rounded py-1 sm:py-1.5 min-h-[34px] sm:min-h-[44px] items-center touch-manipulation">
                SDK + Tooling
              </Link>
              <Link href="/api/v1/search/ai?q=agent+builder&limit=3" className="hidden sm:flex hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/30 focus:ring-offset-2 focus:ring-offset-transparent rounded py-1 sm:py-1.5 min-h-[34px] sm:min-h-[44px] items-center touch-manipulation">
                AI Search
              </Link>
              <Link href="/api/v1/agents/example-research/snapshot" className="hidden sm:flex hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/30 focus:ring-offset-2 focus:ring-offset-transparent rounded py-1 sm:py-1.5 min-h-[34px] sm:min-h-[44px] items-center touch-manipulation">
                Snapshot API
              </Link>
              <Link href="/domains" className="hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/30 focus:ring-offset-2 focus:ring-offset-transparent rounded py-1 sm:py-1.5 min-h-[34px] sm:min-h-[44px] flex items-center touch-manipulation">
                Domains
              </Link>
              <Link href="/marketplace" className="hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/30 focus:ring-offset-2 focus:ring-offset-transparent rounded py-1 sm:py-1.5 min-h-[34px] sm:min-h-[44px] flex items-center touch-manipulation">
                Marketplace
              </Link>
              <Link href="/graph" className="hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/30 focus:ring-offset-2 focus:ring-offset-transparent rounded py-1 sm:py-1.5 min-h-[34px] sm:min-h-[44px] flex items-center touch-manipulation">
                Graph
              </Link>
              <Link href="/reliability" className="hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/30 focus:ring-offset-2 focus:ring-offset-transparent rounded py-1 sm:py-1.5 min-h-[34px] sm:min-h-[44px] flex items-center touch-manipulation">
                Reliability
              </Link>
              <span className="hidden md:inline-flex items-center gap-1.5 text-[var(--text-quaternary)]">
                <svg className="w-3.5 h-3.5 text-emerald-400/80 shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path d="M12 2C8 8 6 12 6 16c0 3.3 2.7 6 6 6s6-2.7 6-6c0-4-2-8-6-14z" />
                </svg>
                Search AI agents, skills, and tools
              </span>
            </div>
            <nav className="flex flex-nowrap items-center justify-center sm:justify-end gap-2.5 sm:gap-6 text-[11px] sm:text-[13px] text-[var(--text-tertiary)] whitespace-nowrap" aria-label="Footer navigation">
              <Link
                href={supportMailto}
                onClick={openSupport}
                className="hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/30 focus:ring-offset-2 focus:ring-offset-transparent rounded py-1 sm:py-1.5 min-h-[34px] sm:min-h-[44px] flex items-center touch-manipulation"
                aria-label={`Email support at ${supportRecipient}`}
              >
                Support
              </Link>
              <Link href={privacyUrl} className="hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/30 focus:ring-offset-2 focus:ring-offset-transparent rounded py-1 sm:py-1.5 min-h-[34px] sm:min-h-[44px] flex items-center touch-manipulation">
                Privacy
              </Link>
              <Link href={termsUrl} className="hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/30 focus:ring-offset-2 focus:ring-offset-transparent rounded py-1 sm:py-1.5 min-h-[34px] sm:min-h-[44px] flex items-center touch-manipulation">
                Terms
              </Link>
            </nav>
          </div>
        </footer>
      </div>

      {showSupportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            onClick={closeSupport}
            aria-label="Close support message"
          />
          <div className="relative w-full max-w-md rounded-2xl border border-white/[0.1] bg-[#0b0b0f] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Support</h2>
              <button
                type="button"
                onClick={closeSupport}
                className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="text-sm text-[var(--text-tertiary)]">Support Email: {supportRecipient}</p>
          </div>
        </div>
      )}
    </div>
  );
}
