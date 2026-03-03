"use client";

import { useState, useEffect, useCallback } from "react";
import { HFSearchHeader } from "@/components/search/HFSearchHeader";
import { HFModelsSidebar } from "@/components/search/HFModelsSidebar";
import { HFModelCard } from "@/components/search/HFModelCard";
import { HFMobileFilters } from "@/components/search/HFMobileFilters";

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
  claimStatus?: string;
  verificationTier?: "NONE" | "BRONZE" | "SILVER" | "GOLD";
  lastCrawledAt?: string;
  updatedAt?: string;
}

interface SearchResponse {
  results: Agent[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
    total: number;
  };
}

const PAGE_SIZE = 30;

export default function HFSearchPage() {
  const [query, setQuery] = useState("");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState("rank");

  // Filters
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [selectedProtocols, setSelectedProtocols] = useState<string[]>([]);
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>([]);
  const [minRank, setMinRank] = useState(0);
  const [showFullTextSearch, setShowFullTextSearch] = useState(false);
  const [showInference, setShowInference] = useState(false);

  const search = useCallback(
    async (isLoadMore = false) => {
      setLoading(true);

      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("q", query.trim());
        if (selectedProtocols.length) params.set("protocols", selectedProtocols.join(","));
        if (selectedCapabilities.length) params.set("capabilities", selectedCapabilities.join(","));
        if (minRank > 0) params.set("minRank", String(minRank));
        params.set("sort", sortBy);
        params.set("limit", String(PAGE_SIZE));

        if (isLoadMore && cursor) {
          params.set("cursor", cursor);
        }

        const res = await fetch(`/api/v1/search?${params}`);
        if (!res.ok) throw new Error("Search failed");

        const data: SearchResponse = await res.json();

        if (isLoadMore) {
          setAgents((prev) => [...prev, ...data.results]);
        } else {
          setAgents(data.results);
        }

        setHasMore(data.pagination.hasMore);
        setCursor(data.pagination.nextCursor);
        setTotal(data.pagination.total);
      } catch (error) {
        console.error("Search error:", error);
      } finally {
        setLoading(false);
      }
    },
    [query, selectedProtocols, selectedCapabilities, minRank, sortBy, cursor]
  );

  // Initial load
  useEffect(() => {
    search(false);
  }, [search]);

  // Search on filter changes
  useEffect(() => {
    search(false);
  }, [search, selectedTasks, selectedProtocols, selectedCapabilities, minRank, sortBy]);

  const loadMore = () => {
    if (hasMore && !loading) {
      search(true);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-matte)]">
      {/* Header */}
      <HFSearchHeader
        query={query}
        onQueryChange={setQuery}
        onSearch={() => search(false)}
        totalAgents={total}
        sortBy={sortBy}
        onSortChange={setSortBy}
        showFullTextSearch={showFullTextSearch}
        onFullTextSearchToggle={() => setShowFullTextSearch(!showFullTextSearch)}
        showInference={showInference}
        onInferenceToggle={() => setShowInference(!showInference)}
      />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex gap-6">
          {/* Sidebar - Desktop */}
          <div className="hidden lg:block">
            <div className="sticky top-24">
              <HFModelsSidebar
                selectedTasks={selectedTasks}
                onTaskChange={setSelectedTasks}
                selectedProtocols={selectedProtocols}
                onProtocolChange={setSelectedProtocols}
                selectedCapabilities={selectedCapabilities}
                onCapabilityChange={setSelectedCapabilities}
                minRank={minRank}
                onMinRankChange={setMinRank}
              />
            </div>
          </div>

          {/* Results */}
          <div className="flex-1 min-w-0">
            {/* Mobile Filters Button */}
            <div className="lg:hidden mb-4">
              <HFMobileFilters
                selectedTasks={selectedTasks}
                onTaskChange={setSelectedTasks}
                selectedProtocols={selectedProtocols}
                onProtocolChange={setSelectedProtocols}
                selectedCapabilities={selectedCapabilities}
                onCapabilityChange={setSelectedCapabilities}
                minRank={minRank}
                onMinRankChange={setMinRank}
              />
            </div>
            {/* Results Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {agents.map((agent) => (
                <HFModelCard key={agent.id} agent={agent} />
              ))}
            </div>

            {/* Loading State */}
            {loading && agents.length === 0 && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className="p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] animate-pulse"
                  >
                    <div className="flex gap-3">
                      <div className="w-10 h-10 rounded-lg bg-[var(--bg-elevated)]" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-[var(--bg-elevated)] rounded w-3/4" />
                        <div className="h-3 bg-[var(--bg-elevated)] rounded w-1/2" />
                        <div className="h-3 bg-[var(--bg-elevated)] rounded w-1/3" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty State */}
            {!loading && agents.length === 0 && (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--bg-card)] flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-[var(--text-tertiary)]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">
                  No agents found
                </h3>
                <p className="text-[var(--text-tertiary)]">
                  Try adjusting your filters or search query
                </p>
              </div>
            )}

            {/* Load More */}
            {hasMore && (
              <div className="mt-8 text-center">
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="px-6 py-3 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] hover:border-[var(--accent-heart)] hover:text-[var(--accent-heart)] transition-colors disabled:opacity-50"
                >
                  {loading ? "Loading..." : "Load more"}
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
