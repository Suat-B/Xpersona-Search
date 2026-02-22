"use client";

import { useState } from "react";

interface SearchHeroProps {
  query: string;
  setQuery: (q: string) => void;
  onSearch: () => void;
  loading: boolean;
}

const VALUE_PROPS = [
  { label: "AgentRank", icon: "📊" },
  { label: "Safety checked", icon: "✓" },
  { label: "5,000+ agents", icon: "🔍" },
  { label: "OpenClaw · A2A · MCP", icon: "⚡" },
];

export function SearchHero({ query, setQuery, onSearch, loading }: SearchHeroProps) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <section
      className="relative min-h-[40vh] md:min-h-[45vh] flex flex-col items-center justify-center px-4 py-12 md:py-20 bg-[var(--bg-deep)] overflow-hidden"
      role="search"
      aria-label="Search AI agents"
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-radial from-[var(--accent-heart)]/[0.03] via-transparent to-transparent" />
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-[var(--accent-neural)]/[0.02] rounded-full blur-3xl" />
      </div>
      <div className="relative max-w-3xl w-full mx-auto text-center">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-[var(--text-primary)] leading-tight mb-2">
          Discover{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-heart)] via-[var(--accent-neural)] to-[var(--accent-heart)]">
            AI Agents
          </span>
        </h1>
        <p className="text-base sm:text-lg text-[var(--text-secondary)] mb-8 max-w-2xl mx-auto">
          Search 5,000+ OpenClaw skills, A2A agents, MCP servers. Ranked by safety, popularity, freshness.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 max-w-2xl mx-auto mb-8">
          <div
            className={`relative flex-1 flex items-center rounded-2xl bg-[rgba(255,255,255,0.03)] border transition-all duration-200 ${
              isFocused
                ? "border-[var(--accent-heart)]/50 shadow-lg shadow-[var(--accent-heart)]/10 ring-2 ring-[var(--accent-heart)]/20"
                : "border-[var(--border)] hover:border-[var(--border-strong)]"
            }`}
          >
            <div className="absolute left-4 w-5 h-5 text-[var(--text-tertiary)] pointer-events-none" aria-hidden>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSearch()}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="Search agents (e.g., 'crypto trading', 'code review')..."
              aria-label="Search AI agents"
              className="w-full pl-12 pr-6 py-4 md:py-5 rounded-2xl bg-transparent text-[var(--text-primary)] placeholder-[var(--text-tertiary)] text-base md:text-lg focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={onSearch}
            disabled={loading}
            aria-busy={loading}
            aria-label={loading ? "Searching" : "Search"}
            className="px-6 py-4 md:px-8 md:py-5 bg-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl font-semibold text-white transition-colors whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:ring-offset-2 focus:ring-offset-[var(--bg-deep)]"
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6">
          {VALUE_PROPS.map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]"
            >
              <span className="opacity-80">{item.icon}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
