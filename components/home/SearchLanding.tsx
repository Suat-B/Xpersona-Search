"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { SearchResultSnippet } from "@/components/search/SearchResultSnippet";
import { SearchResultsBar } from "@/components/search/SearchResultsBar";

interface Agent {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  capabilities: string[];
  protocols: string[];
  safetyScore: number;
  popularityScore: number;
  overallRank: number;
  githubData?: { stars?: number; forks?: number };
}

interface Facets {
  protocols?: Array<{ protocol: string[]; count: number }>;
}

function SkeletonSnippet() {
  return (
    <div className="py-4 border-b border-[var(--border)] animate-pulse">
      <div className="h-5 w-48 bg-[var(--text-quaternary)]/25 rounded mb-2" />
      <div className="h-4 w-64 bg-[var(--text-quaternary)]/20 rounded mb-2" />
      <div className="h-4 w-full bg-[var(--text-quaternary)]/20 rounded mb-1" />
      <div className="h-4 w-4/5 bg-[var(--text-quaternary)]/20 rounded mb-2" />
      <div className="flex gap-2 mt-2">
        <div className="h-3 w-12 bg-[var(--text-quaternary)]/20 rounded" />
        <div className="h-3 w-14 bg-[var(--text-quaternary)]/20 rounded" />
      </div>
    </div>
  );
}

export function SearchLanding() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState<number>(0);
  const [selectedProtocols, setSelectedProtocols] = useState<string[]>([]);
  const [minSafety, setMinSafety] = useState(0);
  const [sort, setSort] = useState("rank");
  const [facets, setFacets] = useState<Facets | undefined>(undefined);

  const search = useCallback(
    async (reset = true) => {
      setLoading(true);
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (selectedProtocols.length)
        params.set("protocols", selectedProtocols.join(","));
      if (minSafety > 0) params.set("minSafety", String(minSafety));
      params.set("sort", sort);
      if (!reset && cursor) params.set("cursor", cursor);

      try {
        const res = await fetch(`/api/search?${params}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Search failed");

        if (reset) {
          setAgents(data.results ?? []);
          setTotal(data.pagination?.total ?? 0);
        } else {
          setAgents((prev) => [...prev, ...(data.results ?? [])]);
        }
        setHasMore(data.pagination?.hasMore ?? false);
        setCursor(data.pagination?.nextCursor ?? null);
        if (data.facets) setFacets(data.facets);
      } catch (err) {
        console.error(err);
        if (reset) {
          setAgents([]);
          setTotal(0);
        }
      } finally {
        setLoading(false);
      }
    },
    [query, selectedProtocols, minSafety, sort, cursor]
  );

  useEffect(() => {
    search(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProtocols, minSafety, sort]);

  const hasResults = agents.length > 0;

  return (
    <section className="min-h-screen text-[var(--text-primary)] bg-[var(--bg-deep)]">
      <SearchResultsBar
        query={query}
        setQuery={setQuery}
        onSearch={() => search(true)}
        loading={loading}
        selectedProtocols={selectedProtocols}
        onProtocolChange={setSelectedProtocols}
        sort={sort}
        onSortChange={setSort}
        minSafety={minSafety}
        onSafetyChange={setMinSafety}
        facets={facets}
      />

      <div className="max-w-2xl mx-auto px-4 py-6 pb-16">
        <main aria-label="Search results">
          {loading && !hasResults ? (
            <div className="space-y-0" aria-busy="true" aria-live="polite">
              {[1, 2, 3, 4, 5].map((i) => (
                <SkeletonSnippet key={i} />
              ))}
            </div>
          ) : !hasResults ? (
            <div
              className="py-12 text-center"
              role="status"
            >
              <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-[var(--text-tertiary)]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
              <p className="text-[var(--text-secondary)] font-medium">
                No agents found. Try different filters or search terms.
              </p>
              <p className="text-[var(--text-tertiary)] text-sm mt-1">
                Adjust your search query or filters to see more results.
              </p>
            </div>
          ) : (
            <>
              <p
                className="mb-4 text-sm text-[var(--text-tertiary)]"
                role="status"
                aria-live="polite"
              >
                {total > 0 ? `About ${total} agent${total === 1 ? "" : "s"}` : `${agents.length} agent${agents.length === 1 ? "" : "s"} found`}
              </p>

              <div className="divide-y-0">
                {agents.map((agent) => (
                  <SearchResultSnippet key={agent.id} agent={agent} />
                ))}
              </div>

              {hasMore && (
                <div className="flex justify-center pt-8">
                  <button
                    type="button"
                    onClick={() => search(false)}
                    disabled={loading}
                    aria-busy={loading}
                    aria-label={loading ? "Loading more" : "Load more results"}
                    className="px-8 py-3 bg-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/90 disabled:opacity-50 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:ring-offset-2 focus:ring-offset-[var(--bg-deep)]"
                  >
                    {loading ? (
                      <>
                        <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Loading...
                      </>
                    ) : (
                      "Load more"
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </section>
  );
}
