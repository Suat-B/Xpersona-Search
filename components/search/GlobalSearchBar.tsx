"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  SearchSuggestions,
  type SearchSuggestionsHandle,
  type SuggestionAgent,
} from "@/components/search/SearchSuggestions";
import { addRecentSearch } from "@/lib/search-history";

const BLUR_DELAY_MS = 150;

export function GlobalSearchBar({
  placeholder = "Search models, datasets, users...",
  className = "",
}: {
  placeholder?: string;
  className?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const searchAnchorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<SearchSuggestionsHandle>(null);

  useEffect(() => {
    setQuery(searchParams.get("q") ?? "");
  }, [searchParams]);

  const navigateToSearch = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      const params = new URLSearchParams();
      if (trimmed) params.set("q", trimmed);
      const nextPath = params.toString() ? `/search?${params.toString()}` : "/search";
      router.push(nextPath);
      if (trimmed) addRecentSearch(trimmed);
    },
    [router]
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      navigateToSearch(query);
      setShowSuggestions(false);
      inputRef.current?.blur();
    },
    [navigateToSearch, query]
  );

  const handleSuggestionSelect = useCallback(
    (agent: SuggestionAgent) => {
      router.push(`/agent/${agent.slug}`);
      setShowSuggestions(false);
    },
    [router]
  );

  const handleQuerySelect = useCallback(
    (text: string) => {
      navigateToSearch(text);
      setShowSuggestions(false);
    },
    [navigateToSearch]
  );

  const handleFocus = useCallback(() => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = undefined;
    }
    setShowSuggestions(true);
  }, []);

  const handleBlur = useCallback(() => {
    blurTimeoutRef.current = setTimeout(() => setShowSuggestions(false), BLUR_DELAY_MS);
  }, []);

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(e.key)) {
      suggestionsRef.current?.handleKeyDown(e);
    }
  }, []);

  useEffect(
    () => () => {
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    },
    []
  );

  return (
    <form
      onSubmit={handleSubmit}
      className={`relative w-full ${className}`}
      role="search"
      aria-label="Global search"
    >
      <div
        ref={searchAnchorRef}
        className="relative flex items-center w-full rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-primary)] focus-within:border-[var(--accent-heart)]/50 focus-within:ring-2 focus-within:ring-[var(--accent-heart)]/20 transition"
      >
        <div className="absolute left-3 w-4 h-4 text-[var(--text-tertiary)] pointer-events-none">
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
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleInputKeyDown}
          placeholder={placeholder}
          aria-label={placeholder}
          aria-autocomplete="list"
          aria-controls="global-search-suggestions"
          autoComplete="off"
          enterKeyHint="search"
          className="w-full h-9 pl-9 pr-3 bg-transparent text-sm placeholder-[var(--text-tertiary)] focus:outline-none"
        />
        <SearchSuggestions
          ref={suggestionsRef}
          query={query}
          onSelect={handleSuggestionSelect}
          onQuerySelect={handleQuerySelect}
          onClose={() => setShowSuggestions(false)}
          anchorRef={searchAnchorRef}
          visible={showSuggestions}
          id="global-search-suggestions"
        />
      </div>
    </form>
  );
}
