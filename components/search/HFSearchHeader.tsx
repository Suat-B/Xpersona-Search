"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

// Xpersona Logo Component
function XpersonaLogo() {
  return (
    <Link href="/" className="flex items-center gap-2 group">
      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--accent-heart)] to-[var(--accent-neural)] flex items-center justify-center shadow-lg group-hover:shadow-[var(--glow-blue)] transition-shadow">
        <span className="text-white font-bold text-lg">X</span>
      </div>
      <span className="text-lg font-semibold text-[var(--text-primary)] hidden sm:block">
        Xpersona
      </span>
    </Link>
  );
}

// Search Icon
const SearchIcon = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

// Sparkle Icon for AI
const SparkleIcon = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
  </svg>
);

// Sort Icon
const SortIcon = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m3 16 4 4 4-4" />
    <path d="M7 20V4" />
    <path d="m21 8-4-4-4 4" />
    <path d="M17 4v16" />
  </svg>
);

interface HFSearchHeaderProps {
  query: string;
  onQueryChange: (q: string) => void;
  onSearch: () => void;
  totalAgents: number;
  sortBy: string;
  onSortChange: (sort: string) => void;
  showFullTextSearch?: boolean;
  onFullTextSearchToggle?: () => void;
  showInference?: boolean;
  onInferenceToggle?: () => void;
}

const SORT_OPTIONS = [
  { value: "trending", label: "Trending" },
  { value: "rank", label: "Rank" },
  { value: "safety", label: "Safety" },
  { value: "popularity", label: "Popularity" },
  { value: "freshness", label: "Freshness" },
];

export function HFSearchHeader({
  query,
  onQueryChange,
  onSearch,
  totalAgents,
  sortBy,
  onSortChange,
  showFullTextSearch = false,
  onFullTextSearchToggle,
  showInference = false,
  onInferenceToggle,
}: HFSearchHeaderProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
      {/* Main Header */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-[var(--bg-matte)]/95 backdrop-blur-xl border-b border-[var(--border)] shadow-lg"
            : "bg-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            {/* Logo */}
            <XpersonaLogo />

            {/* Search Bar */}
            <div className="flex-1 max-w-2xl">
              <div
                className={`relative flex items-center transition-all duration-200 ${
                  isFocused ? "scale-[1.02]" : ""
                }`}
              >
                <SearchIcon className="absolute left-4 w-5 h-5 text-[var(--text-tertiary)]" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onSearch();
                  }}
                  placeholder="Search agents, skills, capabilities..."
                  className="w-full pl-11 pr-24 py-2.5 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl text-sm text-[var(--text-primary)] placeholder:text-[var(--text-quaternary)] focus:border-[var(--accent-heart)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/20 transition-all"
                />
                {/* AI Badge */}
                <div className="absolute right-3 flex items-center gap-1.5 px-2 py-1 rounded-md bg-gradient-to-r from-[var(--accent-heart)]/10 to-[var(--accent-neural)]/10 border border-[var(--accent-heart)]/20">
                  <SparkleIcon className="w-3.5 h-3.5 text-[var(--accent-heart)]" />
                  <span className="text-xs font-medium text-[var(--accent-heart)]">AI</span>
                </div>
              </div>
            </div>

            {/* Right Side Actions */}
            <div className="flex items-center gap-3">
              {/* Theme Toggle */}
              <ThemeToggle />

              {/* Log In */}
              <Link
                href="/login"
                className="hidden sm:block px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                Log In
              </Link>

              {/* Sign Up */}
              <Link
                href="/signup"
                className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-[var(--accent-heart)] to-[var(--accent-neural)] rounded-lg hover:opacity-90 transition-opacity shadow-lg shadow-[var(--accent-heart)]/25"
              >
                Sign Up
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Spacer for fixed header */}
      <div className="h-16" />

      {/* Sub Header with Results Count */}
      <div className="border-b border-[var(--border)] bg-[var(--bg-matte)]/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            {/* Left: Results Count */}
            <div className="flex items-baseline gap-2">
              <h1 className="text-2xl font-bold text-[var(--text-primary)]">Agents</h1>
              <span className="text-lg text-[var(--text-tertiary)]">
                {totalAgents.toLocaleString()}
              </span>
            </div>

            {/* Right: Filters */}
            <div className="flex items-center gap-3">
              {/* Full-text search toggle */}
              {onFullTextSearchToggle && (
                <button
                  onClick={onFullTextSearchToggle}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    showFullTextSearch
                      ? "bg-[var(--accent-heart)]/10 text-[var(--accent-heart)] border border-[var(--accent-heart)]/30"
                      : "text-[var(--text-secondary)] border border-[var(--border)] hover:border-[var(--text-tertiary)]"
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Full-text search
                </button>
              )}

              {/* Inference toggle */}
              {onInferenceToggle && (
                <button
                  onClick={onInferenceToggle}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    showInference
                      ? "bg-[var(--accent-heart)]/10 text-[var(--accent-heart)] border border-[var(--accent-heart)]/30"
                      : "text-[var(--text-secondary)] border border-[var(--border)] hover:border-[var(--text-tertiary)]"
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Inference Ready
                </button>
              )}

              {/* Sort Dropdown */}
              <div className="relative">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border)] text-sm">
                  <SortIcon className="w-4 h-4 text-[var(--text-tertiary)]" />
                  <span className="text-[var(--text-secondary)]">Sort:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => onSortChange(e.target.value)}
                    className="bg-transparent text-[var(--text-primary)] font-medium focus:outline-none cursor-pointer"
                  >
                    {SORT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value} className="bg-[var(--bg-card)] text-[var(--text-primary)]">
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
