"use client";

import { useState, useEffect } from "react";
import { HomeThemePicker } from "@/components/home/HomeThemePicker";
import { applyPreset, HOME_ACCENT_STORAGE_KEY } from "@/lib/theme-presets";
import type { ThemePresetId } from "@/lib/theme-presets";

interface SearchResultsBarProps {
  query: string;
  setQuery: (q: string) => void;
  onSearch: () => void;
  loading: boolean;
  selectedProtocols: string[];
  onProtocolChange: (p: string[]) => void;
  sort: string;
  onSortChange: (s: string) => void;
  minSafety: number;
  onSafetyChange: (n: number) => void;
  facets?: { protocols?: Array<{ protocol: string[]; count: number }> };
}

const PROTOCOL_LIST = ["A2A", "MCP", "ANP", "OPENCLEW"];

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
}: SearchResultsBarProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [showTools, setShowTools] = useState(false);

  const protocolCounts = new Map<string, number>(
    (facets?.protocols ?? []).flatMap((f) =>
      (f.protocol ?? []).map((p) => [p, f.count] as const)
    )
  );

  const toggleProtocol = (p: string) => {
    if (selectedProtocols.includes(p)) {
      onProtocolChange(selectedProtocols.filter((x) => x !== p));
    } else {
      onProtocolChange([...selectedProtocols, p]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
      <div className="max-w-4xl mx-auto px-4 py-3">
        {/* Top row: search */}
        <div className="flex items-center gap-4 mb-3">
          <form onSubmit={handleSubmit} className="flex-1 flex items-center gap-2">
            <div
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
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="Search AI agents..."
                aria-label="Search AI agents"
                autoComplete="off"
                autoFocus
                className="w-full pl-9 pr-4 py-2.5 bg-transparent text-[var(--text-primary)] placeholder-[var(--text-tertiary)] text-sm rounded-xl focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              aria-label={loading ? "Searching" : "Search"}
              className="px-4 py-2.5 bg-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/90 disabled:opacity-50 rounded-xl text-sm font-semibold text-white transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:ring-offset-2 focus:ring-offset-[var(--bg-deep)]"
            >
              {loading ? "..." : "Search"}
            </button>
          </form>

          <HomeThemePicker />

          {/* Tools dropdown */}
          <div className="relative flex-shrink-0">
            <button
              type="button"
              onClick={() => setShowTools(!showTools)}
              aria-expanded={showTools}
              aria-haspopup="true"
              aria-label="Search tools"
              className="px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/50 text-[var(--text-secondary)] text-sm font-medium hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/30 focus:ring-offset-2 focus:ring-offset-[var(--bg-deep)]"
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
                  className="absolute right-0 top-full mt-1 w-64 p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-xl z-20 space-y-4"
                  role="menu"
                >
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
                </div>
              </>
            )}
          </div>
        </div>

        {/* Protocol filter pills */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onProtocolChange([])}
            aria-pressed={selectedProtocols.length === 0}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:ring-offset-2 focus:ring-offset-[var(--bg-deep)] ${
              selectedProtocols.length === 0
                ? "bg-[var(--accent-heart)] text-white border-[var(--accent-heart)]"
                : "bg-transparent text-[var(--text-tertiary)] border-[var(--border)] hover:border-[var(--accent-heart)]/40 hover:text-[var(--text-secondary)]"
            }`}
          >
            All
          </button>
          {PROTOCOL_LIST.map((p) => {
            const count = protocolCounts.get(p);
            const isSelected = selectedProtocols.includes(p);
            return (
              <button
                key={p}
                type="button"
                onClick={() => toggleProtocol(p)}
                aria-pressed={isSelected}
                aria-label={`Filter by ${p}${count != null ? `, ${count} results` : ""}`}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:ring-offset-2 focus:ring-offset-[var(--bg-deep)] ${
                  isSelected
                    ? "bg-[var(--accent-heart)] text-white border-[var(--accent-heart)]"
                    : "bg-transparent text-[var(--text-tertiary)] border-[var(--border)] hover:border-[var(--accent-heart)]/40 hover:text-[var(--text-secondary)]"
                }`}
              >
                {p}
                {count != null ? ` (${count})` : ""}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
