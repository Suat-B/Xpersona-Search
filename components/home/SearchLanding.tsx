"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { AgentCard } from "@/components/search/AgentCard";
import { SearchFilters } from "@/components/search/SearchFilters";
import { SearchHero } from "@/components/home/SearchHero";

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

function SkeletonCard() {
  return (
    <div className="agent-card p-6 rounded-xl border border-[var(--border)] animate-pulse">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="h-7 w-48 bg-[var(--text-quaternary)]/30 rounded mb-3" />
          <div className="h-4 w-full bg-[var(--text-quaternary)]/20 rounded mb-2" />
          <div className="h-4 w-3/4 bg-[var(--text-quaternary)]/20 rounded mb-4" />
          <div className="flex gap-2 mb-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-6 w-16 bg-[var(--text-quaternary)]/20 rounded-full" />
            ))}
          </div>
          <div className="flex gap-6">
            <div className="h-4 w-20 bg-[var(--text-quaternary)]/20 rounded" />
            <div className="h-4 w-12 bg-[var(--text-quaternary)]/20 rounded" />
          </div>
        </div>
        <div className="h-10 w-20 bg-[var(--text-quaternary)]/20 rounded-lg flex-shrink-0" />
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
        } else {
          setAgents((prev) => [...prev, ...(data.results ?? [])]);
        }
        setHasMore(data.pagination?.hasMore ?? false);
        setCursor(data.pagination?.nextCursor ?? null);
        if (data.facets) setFacets(data.facets);
      } catch (err) {
        console.error(err);
        if (reset) setAgents([]);
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

  return (
    <section className="min-h-screen text-[var(--text-primary)] bg-[var(--bg-deep)]">
      <SearchHero
        query={query}
        setQuery={setQuery}
        onSearch={() => search(true)}
        loading={loading}
      />

      <div className="max-w-6xl mx-auto px-4 pb-16">
        <div className="flex flex-col lg:flex-row gap-8">
          <aside className="lg:w-64 flex-shrink-0 order-2 lg:order-1">
            <SearchFilters
              facets={facets}
              selectedProtocols={selectedProtocols}
              onProtocolChange={setSelectedProtocols}
              minSafety={minSafety}
              onSafetyChange={setMinSafety}
              sort={sort}
              onSortChange={setSort}
            />
          </aside>

          <main className="flex-1 min-w-0 order-1 lg:order-2" aria-label="Search results">
            <p className="mb-4 text-[var(--text-tertiary)]" role="status" aria-live="polite">
              {agents.length} agent{agents.length === 1 ? "" : "s"} found
            </p>

            {loading && agents.length === 0 ? (
              <div className="space-y-4" aria-busy="true" aria-live="polite">
                {[1, 2, 3, 4, 5].map((i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            ) : !loading && agents.length === 0 ? (
              <div
                className="agent-card p-12 rounded-xl border border-[var(--border)] text-center"
                role="status"
              >
                <p className="text-[var(--text-secondary)] text-lg mb-2">
                  No agents found. Try different filters or search terms.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {agents.map((agent, i) => (
                    <div
                      key={agent.id}
                      className="animate-fade-in-up"
                      style={{ animationDelay: `${Math.min(i * 50, 300)}ms` }}
                    >
                      <AgentCard agent={agent} rank={i + 1} />
                    </div>
                  ))}
                </div>
                {hasMore && (
                  <button
                    type="button"
                    onClick={() => search(false)}
                    disabled={loading}
                    aria-busy={loading}
                    aria-label={loading ? "Loading more" : "Load more results"}
                    className="mt-8 w-full py-4 glass-panel hover:border-[var(--accent-heart)]/30 rounded-xl font-medium text-[var(--text-primary)] transition-all disabled:opacity-50 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:ring-offset-2 focus:ring-offset-[var(--bg-deep)]"
                  >
                    {loading ? (
                      <>
                        <span className="inline-block w-4 h-4 border-2 border-[var(--accent-heart)] border-t-transparent rounded-full animate-spin" />
                        Loading...
                      </>
                    ) : (
                      "Load more"
                    )}
                  </button>
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </section>
  );
}
