"use client";

import { useState, useEffect, useCallback } from "react";
import { applyPreset, HOME_ACCENT_STORAGE_KEY } from "@/lib/theme-presets";
import type { ThemePresetId } from "@/lib/theme-presets";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { SearchResultSnippet } from "@/components/search/SearchResultSnippet";
import { SearchResultsBar } from "@/components/search/SearchResultsBar";
import { restoreScrollPosition } from "@/lib/search/scroll-memory";
import {
  extractClientErrorMessage,
  unwrapClientResponse,
} from "@/lib/api/client-response";

/** Protocol identifiers used in API/DB. Display labels for UI. */
const BROWSE_PROTOCOLS = [
  { id: "MCP", label: "MCP" },
  { id: "A2A", label: "A2A" },
  { id: "ANP", label: "ANP" },
  { id: "OPENCLEW", label: "OpenClaw" },
] as const;

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
  claimStatus?: string;
  verificationTier?: "NONE" | "BRONZE" | "SILVER" | "GOLD";
  hasCustomPage?: boolean;
  githubData?: { stars?: number; forks?: number };
  agentExecution?: {
    authModes: string[];
    inputSchemaRef: string | null;
    outputSchemaRef: string | null;
    rateLimit: { rpm?: number; burst?: number } | null;
    observedLatencyMsP50: number | null;
    observedLatencyMsP95: number | null;
    estimatedCostUsd: number | null;
    lastVerifiedAt: string | null;
    uptime30d: number | null;
    execReady?: boolean;
  };
  policyMatch?: { score: number; blockedBy: string[]; matched: string[] };
  fallbacks?: Array<{ id: string; slug: string; reason: string; switchWhen: string }>;
  delegationHints?: Array<{ role: string; why: string; candidateSlugs: string[] }>;
  rankingSignals?: {
    successScore: number;
    reliabilityScore: number;
    policyScore: number;
    freshnessScore: number;
    finalScore: number;
  };
}

interface Facets {
  protocols?: Array<{ protocol: string[]; count: number }>;
}

interface SearchMeta {
  fallbackApplied: boolean;
  matchMode:
    | "strict_lexical"
    | "relaxed_lexical"
    | "semantic"
    | "filter_only_fallback"
    | "global_fallback";
  queryOriginal: string;
  queryInterpreted: string;
  filtersHonored: boolean;
  stagesTried: string[];
  fallbackReason?: string;
}

interface SearchResponsePayload {
  results?: Agent[];
  pagination?: { hasMore?: boolean; nextCursor?: string | null; total?: number };
  facets?: Facets;
  didYouMean?: string;
  searchMeta?: SearchMeta;
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

function parseProtocolsFromUrl(p: string | null): string[] {
  if (!p) return [];
  return p
    .split(",")
    .map((s) => s.trim().toUpperCase().replace(/OPENCLAW/i, "OPENCLEW"))
    .filter(Boolean);
}

function parseBoolFromUrl(value: string | null): boolean {
  return value === "1" || value === "true";
}

export function SearchLanding() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState<number>(0);
  const [selectedProtocols, setSelectedProtocols] = useState<string[]>(() =>
    parseProtocolsFromUrl(searchParams.get("protocols"))
  );
  const [minSafety, setMinSafety] = useState(0);
  const [sort, setSort] = useState("rank");
  const [facets, setFacets] = useState<Facets | undefined>(undefined);
  const [intent, setIntent] = useState<"discover" | "execute">(
    searchParams.get("intent") === "execute" ? "execute" : "discover"
  );
  const [taskType, setTaskType] = useState(searchParams.get("taskType") ?? "");
  const [maxLatencyMs, setMaxLatencyMs] = useState(searchParams.get("maxLatencyMs") ?? "");
  const [maxCostUsd, setMaxCostUsd] = useState(searchParams.get("maxCostUsd") ?? "");
  const [dataRegion, setDataRegion] = useState(searchParams.get("dataRegion") ?? "global");
  const [requires, setRequires] = useState(searchParams.get("requires") ?? "");
  const [forbidden, setForbidden] = useState(searchParams.get("forbidden") ?? "");
  const [bundle, setBundle] = useState(parseBoolFromUrl(searchParams.get("bundle")));
  const [explain, setExplain] = useState(parseBoolFromUrl(searchParams.get("explain")));
  const [searchMeta, setSearchMeta] = useState<SearchMeta | null>(null);

  const handleProtocolChange = useCallback(
    (protocols: string[]) => {
      setSelectedProtocols(protocols);
      const params = new URLSearchParams(searchParams.toString());
      if (protocols.length) params.set("protocols", protocols.join(","));
      else params.delete("protocols");
      router.replace(`/?${params.toString()}`, { scroll: false });
    },
    [searchParams, router]
  );

  const search = useCallback(
    async (reset = true) => {
      setLoading(true);
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (selectedProtocols.length)
        params.set("protocols", selectedProtocols.join(","));
      if (minSafety > 0) params.set("minSafety", String(minSafety));
      params.set("sort", sort);
      params.set("limit", "30");
      params.set("intent", intent);
      if (taskType.trim()) params.set("taskType", taskType.trim());
      if (maxLatencyMs.trim()) params.set("maxLatencyMs", maxLatencyMs.trim());
      if (maxCostUsd.trim()) params.set("maxCostUsd", maxCostUsd.trim());
      if (dataRegion && dataRegion !== "global") params.set("dataRegion", dataRegion);
      if (requires.trim()) params.set("requires", requires);
      if (forbidden.trim()) params.set("forbidden", forbidden);
      if (bundle) params.set("bundle", "1");
      if (explain) params.set("explain", "1");
      if (!reset && cursor) params.set("cursor", cursor);

      router.replace(`/?${params.toString()}`, { scroll: false });

      try {
        const res = await fetch(`/api/v1/search?${params}`);
        const payload = await res.json();
        if (!res.ok) throw new Error(extractClientErrorMessage(payload, "Search failed"));
        const data = unwrapClientResponse<SearchResponsePayload>(payload);

        if (reset) {
          setAgents(data.results ?? []);
          setTotal(data.pagination?.total ?? 0);
        } else {
          setAgents((prev) => [...prev, ...(data.results ?? [])]);
        }
        setHasMore(data.pagination?.hasMore ?? false);
        setCursor(data.pagination?.nextCursor ?? null);
        if (data.facets) setFacets(data.facets);
        setSearchMeta(data.searchMeta ?? null);
      } catch (err) {
        console.error(err);
        if (reset) {
          setAgents([]);
          setTotal(0);
        }
        setSearchMeta(null);
      } finally {
        setLoading(false);
      }
    },
    [
      query,
      selectedProtocols,
      minSafety,
      sort,
      cursor,
      intent,
      taskType,
      maxLatencyMs,
      maxCostUsd,
      dataRegion,
      requires,
      forbidden,
      bundle,
      explain,
    ]
  );

  useEffect(() => {
    search(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedProtocols,
    minSafety,
    sort,
    intent,
    taskType,
    maxLatencyMs,
    maxCostUsd,
    dataRegion,
    requires,
    forbidden,
    bundle,
    explain,
  ]);

  // Sync state from URL when it changes (e.g. from Link navigation on Explore/Browse buttons)
  useEffect(() => {
    const urlQ = searchParams.get("q") ?? "";
    const urlProtocols = parseProtocolsFromUrl(searchParams.get("protocols"));
    setQuery(urlQ);
    setSelectedProtocols(urlProtocols);
    setIntent(searchParams.get("intent") === "execute" ? "execute" : "discover");
    setTaskType(searchParams.get("taskType") ?? "");
    setMaxLatencyMs(searchParams.get("maxLatencyMs") ?? "");
    setMaxCostUsd(searchParams.get("maxCostUsd") ?? "");
    setDataRegion(searchParams.get("dataRegion") ?? "global");
    setRequires(searchParams.get("requires") ?? "");
    setForbidden(searchParams.get("forbidden") ?? "");
    setBundle(parseBoolFromUrl(searchParams.get("bundle")));
    setExplain(parseBoolFromUrl(searchParams.get("explain")));
  }, [searchParams]);

  useEffect(() => {
    const currentSearch = searchParams.toString();
    const fromPath = currentSearch ? `/?${currentSearch}` : "/";
    restoreScrollPosition(fromPath);
  }, [searchParams]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(HOME_ACCENT_STORAGE_KEY) as ThemePresetId | null;
      if (stored) applyPreset(stored);
    } catch {
      // ignore
    }
  }, []);

  const hasResults = agents.length > 0;

  return (
    <section className="min-h-screen text-[var(--text-primary)] bg-[var(--bg-deep)] relative">
      <div className="fixed inset-0 pointer-events-none z-0" aria-hidden>
        <div className="absolute inset-0 bg-gradient-radial from-[var(--accent-heart)]/[0.08] via-transparent to-transparent" />
        <div className="absolute top-0 right-1/4 w-[24rem] h-[24rem] bg-[var(--accent-neural)]/[0.06] rounded-full blur-3xl" />
      </div>
      <div className="relative z-10">
      <SearchResultsBar
        query={query}
        setQuery={setQuery}
        onSearch={() => search(true)}
        loading={loading}
        selectedProtocols={selectedProtocols}
        onProtocolChange={handleProtocolChange}
        sort={sort}
        onSortChange={setSort}
        minSafety={minSafety}
        onSafetyChange={setMinSafety}
        facets={facets}
        intent={intent}
        onIntentChange={setIntent}
        taskType={taskType}
        onTaskTypeChange={setTaskType}
        maxLatencyMs={maxLatencyMs}
        onMaxLatencyMsChange={setMaxLatencyMs}
        maxCostUsd={maxCostUsd}
        onMaxCostUsdChange={setMaxCostUsd}
        dataRegion={dataRegion}
        onDataRegionChange={setDataRegion}
        requires={requires}
        onRequiresChange={setRequires}
        forbidden={forbidden}
        onForbiddenChange={setForbidden}
        bundle={bundle}
        onBundleChange={setBundle}
        explain={explain}
        onExplainChange={setExplain}
      />

      <div className="max-w-4xl mx-auto px-3 sm:px-6 py-6 pb-20 sm:pb-16">
        <main aria-label="Search results">
          {searchMeta?.fallbackApplied && (
            <div className="mb-4 rounded-lg border border-[var(--accent-heart)]/40 bg-[var(--accent-heart)]/10 px-4 py-3 text-sm text-[var(--text-secondary)]">
              Showing related results for{" "}
              <span className="font-semibold text-[var(--text-primary)]">
                {searchMeta.queryInterpreted || query}
              </span>
              {searchMeta.queryOriginal &&
              searchMeta.queryOriginal !== searchMeta.queryInterpreted ? (
                <span className="text-[var(--text-tertiary)]">
                  {" "}
                  (from "{searchMeta.queryOriginal}")
                </span>
              ) : null}
            </div>
          )}
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
              <p className="text-[var(--text-tertiary)] text-sm mt-2">
                Developer tip: claim your agent page to unlock full customization.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Link
                  href="/?q=discover"
                  className="inline-flex items-center gap-2 px-4 py-3 min-h-[44px] rounded-lg neural-glass border border-white/[0.08] hover:border-[var(--accent-heart)]/30 text-[var(--text-secondary)] hover:text-[var(--accent-heart)] transition-all text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:ring-offset-2 focus:ring-offset-[var(--bg-deep)] touch-manipulation"
                >
                  Explore all agents
                </Link>
                {BROWSE_PROTOCOLS.map(({ id, label }) => (
                  <Link
                    key={id}
                    href={`/?protocols=${id}`}
                    className="inline-flex items-center px-4 py-3 min-h-[44px] rounded-lg border border-[var(--border)] hover:border-[var(--accent-heart)]/40 text-[var(--text-tertiary)] hover:text-[var(--accent-heart)] transition-all text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:ring-offset-2 focus:ring-offset-[var(--bg-deep)] touch-manipulation"
                  >
                    Browse {label}
                  </Link>
                ))}
              </div>
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
                {agents.map((agent, i) => {
                  const delay = ["animate-delay-75", "animate-delay-150", "animate-delay-225", "animate-delay-300"][i % 4];
                  return (
                    <SearchResultSnippet
                      key={agent.id}
                      agent={agent}
                      showSitelinks={i === 0}
                      className={`animate-slide-in-from-bottom ${delay}`}
                    />
                  );
                })}
              </div>

              {hasMore && (
                <div className="flex justify-center pt-8">
                  <button
                    type="button"
                    onClick={() => search(false)}
                    disabled={loading}
                    aria-busy={loading}
                    aria-label={loading ? "Loading more" : "Load more results"}
                    className="w-full sm:w-auto px-8 py-3.5 min-h-[48px] bg-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/90 disabled:opacity-50 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:ring-offset-2 focus:ring-offset-[var(--bg-deep)] touch-manipulation"
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
      </div>
    </section>
  );
}
