"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { SearchSuggestions, type SearchSuggestionsHandle, type SuggestionAgent } from "./SearchSuggestions";
import { addRecentSearch } from "@/lib/search-history";
import { saveScrollPosition } from "@/lib/search/scroll-memory";
import { useAutoHideHeader } from "@/lib/hooks/use-auto-hide-header";

interface SearchTopControlsBarProps {
  query: string;
  setQuery: (q: string) => void;
  onSearch: (overrideQuery?: string) => void;
  loading: boolean;
  vertical: "agents" | "skills" | "artifacts";
  onVerticalChange: (v: "agents" | "skills" | "artifacts") => void;
  sort: string;
  onSortChange: (s: string) => void;
  totalLabel?: string;
  filtersSidebar?: ReactNode;
}

const BLUR_DELAY_MS = 150;

export function SearchTopControlsBar({
  query,
  setQuery,
  onSearch,
  loading,
  vertical,
  onVerticalChange,
  sort,
  onSortChange,
  totalLabel,
  filtersSidebar,
}: SearchTopControlsBarProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const searchAnchorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<SearchSuggestionsHandle>(null);
  const router = useRouter();
  const headerHidden = useAutoHideHeader({ disabled: filtersOpen });

  const handleSuggestionSelect = (agent: SuggestionAgent) => {
    const params = new URLSearchParams(window.location.search);
    const fromPath = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
    saveScrollPosition(fromPath);
    router.push(`/agent/${agent.slug}?from=${encodeURIComponent(fromPath)}`);
  };

  const handleQuerySelect = (text: string) => {
    const trimmed = text.trim();
    setQuery(text);
    if (trimmed) addRecentSearch(trimmed);
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

  useEffect(() => {
    if (!filtersOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFiltersOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filtersOpen]);

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

  return (
    <div
      className={`sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--bg-deep)]/95 backdrop-blur-sm overflow-hidden transition-[max-height,transform,opacity,border-color] duration-300 ${
        headerHidden
          ? "max-h-0 -translate-y-2 opacity-0 pointer-events-none border-transparent"
          : "max-h-[24rem] translate-y-0 opacity-100"
      }`}
    >
      <div className="mx-auto w-full max-w-[1260px] px-4 sm:px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">
              {vertical === "agents" ? "Agents" : vertical === "skills" ? "Skills" : "Artifacts"}
            </h1>
            <p className="mt-1 text-sm text-[var(--text-tertiary)]">
              {totalLabel ? `About ${totalLabel}` : "Search results"}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(["agents", "skills", "artifacts"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => onVerticalChange(v)}
                  className={`px-3 py-2 min-h-[36px] rounded-full border text-xs font-semibold transition-colors ${
                    vertical === v
                      ? "border-[var(--accent-heart)] text-[var(--accent-heart)] bg-[var(--accent-heart)]/10"
                      : "border-[var(--border)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                  }`}
                >
                  {v === "agents" ? "Agents" : v === "skills" ? "Skills" : "Artifacts"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <form onSubmit={handleSubmit} className="flex w-full items-stretch gap-2 sm:w-auto">
              <div
                ref={searchAnchorRef}
                className={`relative flex w-full items-center rounded-full border transition-all duration-200 sm:w-64 ${
                  isFocused
                    ? "border-[var(--accent-heart)]/50 ring-2 ring-[var(--accent-heart)]/20"
                    : "border-white/[0.1] hover:border-white/[0.15]"
                }`}
              >
                <div className="absolute left-3 w-4 h-4 text-[var(--text-tertiary)] pointer-events-none" aria-hidden>
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-full h-full">
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
                  placeholder="Filter by name"
                  aria-label="Filter by name"
                  aria-autocomplete="list"
                  aria-controls="agent-suggestions-bar"
                  autoComplete="off"
                  className="w-full min-w-0 pl-9 pr-4 py-2.5 min-h-[40px] bg-transparent text-[var(--text-primary)] placeholder-[var(--text-tertiary)] text-sm rounded-full focus:outline-none"
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
                className="px-4 py-2.5 min-h-[40px] rounded-full border border-[var(--border)] text-sm font-semibold text-[var(--text-primary)] hover:border-[var(--border-strong)] disabled:opacity-50"
              >
                {loading ? "..." : "Search"}
              </button>
            </form>
            {filtersSidebar ? (
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className="lg:hidden px-3 py-2.5 min-h-[40px] rounded-full border border-[var(--border)] text-sm font-semibold text-[var(--text-primary)] hover:border-[var(--border-strong)]"
              >
                Filters
              </button>
            ) : null}
            <select
              value={sort}
              onChange={(e) => onSortChange(e.target.value)}
              aria-label="Sort results by"
              className="px-3 py-2.5 min-h-[40px] rounded-full border border-[var(--border)] bg-[var(--bg-elevated)]/50 text-[var(--text-primary)] text-sm focus:border-[var(--accent-heart)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/20"
            >
              <option value="rank">Most relevant</option>
              <option value="safety">Safest</option>
              <option value="popularity">Most popular</option>
              <option value="freshness">Recently updated</option>
            </select>
          </div>
        </div>
      </div>
      {filtersSidebar && filtersOpen && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Filters"
          onClick={(e) => e.currentTarget === e.target && setFiltersOpen(false)}
        >
          <section
            className="w-full sm:max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-deep)] p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Filters</p>
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                className="px-3 py-1.5 rounded-full border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors"
              >
                Close
              </button>
            </div>
            {filtersSidebar}
          </section>
        </div>,
        document.body
      )}
    </div>
  );
}
