"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { applyPreset, HOME_ACCENT_STORAGE_KEY } from "@/lib/theme-presets";
import type { ThemePresetId } from "@/lib/theme-presets";
import { SearchSuggestions, type SearchSuggestionsHandle, type SuggestionAgent } from "./SearchSuggestions";
import { addRecentSearch } from "@/lib/search-history";
import { saveScrollPosition } from "@/lib/search/scroll-memory";

interface SearchResultsBarProps {
  query: string;
  setQuery: (q: string) => void;
  onSearch: (overrideQuery?: string) => void;
  loading: boolean;
  selectedProtocols: string[];
  onProtocolChange: (p: string[]) => void;
  sort: string;
  onSortChange: (s: string) => void;
  minSafety: number;
  onSafetyChange: (n: number) => void;
  facets?: { protocols?: Array<{ protocol: string[]; count: number }> };
  intent: "discover" | "execute";
  onIntentChange: (v: "discover" | "execute") => void;
  taskType: string;
  onTaskTypeChange: (v: string) => void;
  maxLatencyMs: string;
  onMaxLatencyMsChange: (v: string) => void;
  maxCostUsd: string;
  onMaxCostUsdChange: (v: string) => void;
  dataRegion: string;
  onDataRegionChange: (v: string) => void;
  requires: string;
  onRequiresChange: (v: string) => void;
  forbidden: string;
  onForbiddenChange: (v: string) => void;
  bundle: boolean;
  onBundleChange: (v: boolean) => void;
  explain: boolean;
  onExplainChange: (v: boolean) => void;
}

const BLUR_DELAY_MS = 150;

export function SearchResultsBar({
  query,
  setQuery,
  onSearch,
  loading,
  selectedProtocols,
  onProtocolChange,
  sort,
  onSortChange,
  minSafety,
  onSafetyChange,
  facets,
  intent,
  onIntentChange,
  taskType,
  onTaskTypeChange,
  maxLatencyMs,
  onMaxLatencyMsChange,
  maxCostUsd,
  onMaxCostUsdChange,
  dataRegion,
  onDataRegionChange,
  requires,
  onRequiresChange,
  forbidden,
  onForbiddenChange,
  bundle,
  onBundleChange,
  explain,
  onExplainChange,
}: SearchResultsBarProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const searchAnchorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<SearchSuggestionsHandle>(null);
  const router = useRouter();

  const handleSuggestionSelect = (agent: SuggestionAgent) => {
    const params = new URLSearchParams(window.location.search);
    const fromPath = params.toString() ? `/?${params.toString()}` : "/";
    saveScrollPosition(fromPath);
    router.push(`/agent/${agent.slug}?from=${encodeURIComponent(fromPath)}`);
  };

  const handleQuerySelect = (text: string) => {
    const trimmed = text.trim();
    setQuery(text);
    addRecentSearch(trimmed);
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = undefined;
    }
    setShowSuggestions(false);
    setIsFocused(false);
    inputRef.current?.blur();
    onSearch(trimmed);
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

  useEffect(() => () => {
    if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = undefined;
    }
    setShowSuggestions(false);
    setIsFocused(false);
    inputRef.current?.blur();
    if (query.trim()) addRecentSearch(query.trim());
    onSearch();
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
    <div className="sticky top-0 z-20 bg-[var(--bg-deep)]/95 backdrop-blur-sm border-b border-[var(--border)]">
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-3">
        {/* Top row: search */}
        <div className="flex flex-wrap items-stretch gap-2 sm:gap-4">
          <form onSubmit={handleSubmit} className="flex-1 min-w-0 flex items-stretch gap-2">
            <div
              ref={searchAnchorRef}
              className={`relative flex-1 flex items-center rounded-xl border transition-all duration-200 ${
                isFocused
                  ? "border-[var(--accent-heart)]/50 ring-2 ring-[var(--accent-heart)]/20"
                  : "border-white/[0.1] hover:border-white/[0.15]"
              }`}
            >
              <div
                className="absolute left-3 w-4 h-4 text-[var(--text-tertiary)] pointer-events-none"
                aria-hidden
              >
                <svg
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  className="w-full h-full"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={handleFocus}
                onBlur={handleBlur}
                onKeyDown={handleInputKeyDown}
                enterKeyHint="search"
                placeholder="Search AI agents..."
                aria-label="Search AI agents"
                aria-autocomplete="list"
                aria-controls="agent-suggestions-bar"
                aria-expanded={showSuggestions}
                autoComplete="off"
                className="w-full min-w-0 pl-9 pr-4 py-3 sm:py-2.5 min-h-[44px] bg-transparent text-[var(--text-primary)] placeholder-[var(--text-tertiary)] text-base sm:text-sm rounded-xl focus:outline-none touch-manipulation"
              />
              <SearchSuggestions
                ref={suggestionsRef}
                query={query}
                onSelect={handleSuggestionSelect}
                onQuerySelect={handleQuerySelect}
                onClose={() => setShowSuggestions(false)}
                anchorRef={searchAnchorRef}
                visible={showSuggestions}
                id="agent-suggestions-bar"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              aria-label={loading ? "Searching" : "Search"}
              className="px-4 py-2.5 min-h-[44px] flex items-center bg-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/90 disabled:opacity-50 rounded-xl text-sm font-semibold text-white transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:ring-offset-2 focus:ring-offset-[var(--bg-deep)] touch-manipulation shrink-0"
            >
              {loading ? "..." : "Search"}
            </button>
          </form>

          {/* Tools dropdown */}
          <div className="relative flex-shrink-0">
            <button
              type="button"
              onClick={() => setShowTools(!showTools)}
              aria-expanded={showTools}
              aria-haspopup="true"
              aria-label="Search tools"
              className="px-3 py-2.5 min-h-[44px] flex items-center rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/50 text-[var(--text-secondary)] text-sm font-medium hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/30 focus:ring-offset-2 focus:ring-offset-[var(--bg-deep)] touch-manipulation shrink-0"
            >
              Tools
            </button>
            {showTools && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  aria-hidden
                  onClick={() => setShowTools(false)}
                />
                <div
                  className="absolute right-0 top-full mt-1 w-[min(calc(100vw-2rem),16rem)] sm:w-64 p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-xl z-20 space-y-4 max-h-[70vh] overflow-y-auto"
                  role="menu"
                >
                  <div>
                    <label
                      htmlFor="search-intent"
                      className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2"
                    >
                      Mode
                    </label>
                    <select
                      id="search-intent"
                      value={intent}
                      onChange={(e) => onIntentChange(e.target.value === "execute" ? "execute" : "discover")}
                      className="w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] text-sm focus:border-[var(--accent-heart)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/30"
                    >
                      <option value="discover">Discover</option>
                      <option value="execute">Execute</option>
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="search-sort"
                      className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2"
                    >
                      Sort
                    </label>
                    <select
                      id="search-sort"
                      value={sort}
                      onChange={(e) => {
                        onSortChange(e.target.value);
                        setShowTools(false);
                      }}
                      aria-label="Sort results by"
                      className="w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] text-sm focus:border-[var(--accent-heart)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/30"
                    >
                      <option value="rank">By Rank</option>
                      <option value="safety">By Safety</option>
                      <option value="popularity">By Popularity</option>
                      <option value="freshness">By Freshness</option>
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="search-min-safety"
                      className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2"
                    >
                      Min Safety: {minSafety}
                    </label>
                    <input
                      id="search-min-safety"
                      type="range"
                      min={0}
                      max={100}
                      value={minSafety}
                      onChange={(e) => onSafetyChange(Number(e.target.value))}
                      aria-label="Minimum safety score"
                      className="w-full h-2 rounded-full appearance-none cursor-pointer bg-[var(--bg-elevated)] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--accent-heart)] [&::-webkit-slider-thumb]:cursor-pointer"
                    />
                  </div>
                  {intent === "execute" && (
                    <>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
                          Task Type
                        </label>
                        <input
                          value={taskType}
                          onChange={(e) => onTaskTypeChange(e.target.value)}
                          placeholder="retrieval, automation..."
                          className="w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] text-sm focus:border-[var(--accent-heart)]/60 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
                          Max Latency (ms)
                        </label>
                        <input
                          value={maxLatencyMs}
                          onChange={(e) => onMaxLatencyMsChange(e.target.value)}
                          inputMode="numeric"
                          placeholder="2000"
                          className="w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] text-sm focus:border-[var(--accent-heart)]/60 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
                          Max Cost (USD)
                        </label>
                        <input
                          value={maxCostUsd}
                          onChange={(e) => onMaxCostUsdChange(e.target.value)}
                          inputMode="decimal"
                          placeholder="0.05"
                          className="w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] text-sm focus:border-[var(--accent-heart)]/60 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
                          Region
                        </label>
                        <select
                          value={dataRegion}
                          onChange={(e) => onDataRegionChange(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] text-sm focus:border-[var(--accent-heart)]/60 focus:outline-none"
                        >
                          <option value="global">Global</option>
                          <option value="us">US</option>
                          <option value="eu">EU</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
                          Requires
                        </label>
                        <input
                          value={requires}
                          onChange={(e) => onRequiresChange(e.target.value)}
                          placeholder="mcp, apiKey, streaming"
                          className="w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] text-sm focus:border-[var(--accent-heart)]/60 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
                          Forbidden
                        </label>
                        <input
                          value={forbidden}
                          onChange={(e) => onForbiddenChange(e.target.value)}
                          placeholder="paid-api, external-network"
                          className="w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] text-sm focus:border-[var(--accent-heart)]/60 focus:outline-none"
                        />
                      </div>
                      <label className="flex items-center justify-between gap-2 text-sm text-[var(--text-secondary)]">
                        Include fallbacks
                        <input type="checkbox" checked={bundle} onChange={(e) => onBundleChange(e.target.checked)} />
                      </label>
                      <label className="flex items-center justify-between gap-2 text-sm text-[var(--text-secondary)]">
                        Explain ranking
                        <input type="checkbox" checked={explain} onChange={(e) => onExplainChange(e.target.checked)} />
                      </label>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
