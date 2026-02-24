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

interface MediaResult {
  id: string;
  agentId: string;
  agentSlug: string;
  agentName: string;
  assetKind: string;
  artifactType: string | null;
  url: string;
  sourcePageUrl: string | null;
  source?: string | null;
  title: string | null;
  caption: string | null;
  width: number | null;
  height: number | null;
  mimeType: string | null;
  qualityScore: number;
  safetyScore: number;
}

interface SearchResponsePayload {
  results?: Agent[];
  mediaResults?: MediaResult[];
  pagination?: { hasMore?: boolean; nextCursor?: string | null; total?: number };
  facets?: Facets;
  didYouMean?: string;
  searchMeta?: SearchMeta;
}

interface SearchOverrides {
  query?: string;
  selectedProtocols?: string[];
  minSafety?: number;
  sort?: string;
  vertical?: "agents" | "images" | "artifacts";
  intent?: "discover" | "execute";
  taskType?: string;
  maxLatencyMs?: string;
  maxCostUsd?: string;
  dataRegion?: string;
  requires?: string;
  forbidden?: string;
  bundle?: boolean;
  explain?: boolean;
  recall?: "normal" | "high";
  includeSources?: string[];
}

function SkeletonSnippet() {
  return (
    <div className="py-4 border-b border-[var(--border)] animate-pulse">
      <div className="h-5 w-48 bg-[var(--text-quaternary)]/25 rounded mb-2" />
      <div className="h-4 w-64 bg-[var(--text-quaternary)]/20 rounded mb-2" />
      <div className="h-4 w-full bg-[var(--text-quaternary)]/20 rounded mb-1" />
      <div className="h-4 w-4/5 bg-[var(--text-quaternary)]/20 rounded mb-2" />
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
  const [mediaResults, setMediaResults] = useState<MediaResult[]>([]);
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
  const [vertical, setVertical] = useState<"agents" | "images" | "artifacts">(
    searchParams.get("vertical") === "images"
      ? "images"
      : searchParams.get("vertical") === "artifacts"
        ? "artifacts"
        : "agents"
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
  const [brokenMediaUrls, setBrokenMediaUrls] = useState<Set<string>>(new Set());
  const [mediaCursor, setMediaCursor] = useState<string | null>(null);
  const [recall, setRecall] = useState<"normal" | "high">(
    searchParams.get("recall") === "high" ? "high" : "normal"
  );
  const [includeSources, setIncludeSources] = useState<string[]>(
    (searchParams.get("includeSources") ?? "")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
  );
  const isImagesVertical = vertical === "images";

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
    async (reset = true, overrides?: SearchOverrides) => {
      setLoading(true);
      const nextQuery = overrides?.query ?? query;
      const nextSelectedProtocols = overrides?.selectedProtocols ?? selectedProtocols;
      const nextMinSafety = overrides?.minSafety ?? minSafety;
      const nextSort = overrides?.sort ?? sort;
      const nextVertical = overrides?.vertical ?? vertical;
      const nextIntent = overrides?.intent ?? intent;
      const nextTaskType = overrides?.taskType ?? taskType;
      const nextMaxLatencyMs = overrides?.maxLatencyMs ?? maxLatencyMs;
      const nextMaxCostUsd = overrides?.maxCostUsd ?? maxCostUsd;
      const nextDataRegion = overrides?.dataRegion ?? dataRegion;
      const nextRequires = overrides?.requires ?? requires;
      const nextForbidden = overrides?.forbidden ?? forbidden;
      const nextBundle = overrides?.bundle ?? bundle;
      const nextExplain = overrides?.explain ?? explain;
      const nextRecall = overrides?.recall ?? recall;
      const nextIncludeSources = overrides?.includeSources ?? includeSources;

      const params = new URLSearchParams();
      if (nextQuery.trim()) params.set("q", nextQuery.trim());
      if (nextSelectedProtocols.length) params.set("protocols", nextSelectedProtocols.join(","));
      if (nextMinSafety > 0) params.set("minSafety", String(nextMinSafety));
      params.set("sort", nextSort);
      params.set("limit", "30");
      params.set("vertical", nextVertical);
      params.set("recall", nextRecall);
      if (nextIncludeSources.length > 0) {
        params.set("includeSources", nextIncludeSources.join(","));
      }
      params.set("intent", nextIntent);
      if (nextTaskType.trim()) params.set("taskType", nextTaskType.trim());
      if (nextMaxLatencyMs.trim()) params.set("maxLatencyMs", nextMaxLatencyMs.trim());
      if (nextMaxCostUsd.trim()) params.set("maxCostUsd", nextMaxCostUsd.trim());
      if (nextDataRegion && nextDataRegion !== "global") params.set("dataRegion", nextDataRegion);
      if (nextRequires.trim()) params.set("requires", nextRequires);
      if (nextForbidden.trim()) params.set("forbidden", nextForbidden);
      if (nextBundle) params.set("bundle", "1");
      if (nextExplain) params.set("explain", "1");
      if (!reset) {
        if (nextVertical === "agents" && cursor) params.set("cursor", cursor);
        if ((nextVertical === "images" || nextVertical === "artifacts") && mediaCursor) {
          params.set("mediaCursor", mediaCursor);
        }
      }

      router.replace(`/?${params.toString()}`, { scroll: false });

      try {
        const res = await fetch(`/api/v1/search?${params}`);
        const payload = await res.json();
        if (!res.ok) throw new Error(extractClientErrorMessage(payload, "Search failed"));
        const data = unwrapClientResponse<SearchResponsePayload>(payload);

        if (reset) {
          setAgents(data.results ?? []);
          setMediaResults(data.mediaResults ?? []);
          setBrokenMediaUrls(new Set());
          setTotal(data.pagination?.total ?? 0);
        } else {
          setAgents((prev) => [...prev, ...(data.results ?? [])]);
          setMediaResults((prev) => [...prev, ...(data.mediaResults ?? [])]);
        }
        setHasMore(data.pagination?.hasMore ?? false);
        if (nextVertical === "agents") {
          setCursor(data.pagination?.nextCursor ?? null);
          setMediaCursor(null);
        } else {
          setMediaCursor(data.pagination?.nextCursor ?? null);
          setCursor(null);
        }
        if (data.facets) setFacets(data.facets);
        setSearchMeta(data.searchMeta ?? null);
      } catch (err) {
        console.error(err);
        if (reset) {
          setAgents([]);
          setMediaResults([]);
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
      vertical,
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
      recall,
      includeSources,
      mediaCursor,
      router,
    ]
  );

  useEffect(() => {
    search(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedProtocols,
    minSafety,
    sort,
    vertical,
    intent,
    taskType,
    maxLatencyMs,
    maxCostUsd,
    dataRegion,
    requires,
    forbidden,
    bundle,
    explain,
    recall,
    includeSources,
  ]);

  useEffect(() => {
    const urlQ = searchParams.get("q") ?? "";
    const urlProtocols = parseProtocolsFromUrl(searchParams.get("protocols"));
    setQuery(urlQ);
    setSelectedProtocols(urlProtocols);
    setIntent(searchParams.get("intent") === "execute" ? "execute" : "discover");
    setVertical(
      searchParams.get("vertical") === "images"
        ? "images"
        : searchParams.get("vertical") === "artifacts"
          ? "artifacts"
          : "agents"
    );
    setTaskType(searchParams.get("taskType") ?? "");
    setMaxLatencyMs(searchParams.get("maxLatencyMs") ?? "");
    setMaxCostUsd(searchParams.get("maxCostUsd") ?? "");
    setDataRegion(searchParams.get("dataRegion") ?? "global");
    setRequires(searchParams.get("requires") ?? "");
    setForbidden(searchParams.get("forbidden") ?? "");
    setBundle(parseBoolFromUrl(searchParams.get("bundle")));
    setExplain(parseBoolFromUrl(searchParams.get("explain")));
    setRecall(searchParams.get("recall") === "high" ? "high" : "normal");
    setIncludeSources(
      (searchParams.get("includeSources") ?? "")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    );
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

  const hasResults = vertical === "agents" ? agents.length > 0 : mediaResults.length > 0;

  const handleExploreAllAgents = useCallback(async () => {
    setQuery("");
    setSelectedProtocols([]);
    setMinSafety(0);
    setSort("rank");
    setVertical("agents");
    setIntent("discover");
    setTaskType("");
    setMaxLatencyMs("");
    setMaxCostUsd("");
    setDataRegion("global");
    setRequires("");
    setForbidden("");
    setBundle(false);
    setExplain(false);
    setRecall("normal");
    setIncludeSources([]);

    await search(true, {
      query: "",
      selectedProtocols: [],
      minSafety: 0,
      sort: "rank",
      vertical: "agents",
      intent: "discover",
      taskType: "",
      maxLatencyMs: "",
      maxCostUsd: "",
      dataRegion: "global",
      requires: "",
      forbidden: "",
      bundle: false,
      explain: false,
      recall: "normal",
      includeSources: [],
    });
  }, [search]);

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
          onSearch={() => {
            if (!query.trim()) {
              void handleExploreAllAgents();
              return;
            }
            void search(true);
          }}
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

        <div
          className={
            isImagesVertical
              ? "w-full max-w-[min(1800px,100vw)] mx-auto px-3 sm:px-5 lg:px-6 py-6 pb-20 sm:pb-16"
              : "max-w-4xl mx-auto px-3 sm:px-6 py-6 pb-20 sm:pb-16"
          }
        >
          <div className="mb-4 flex items-center gap-2">
            {(["agents", "images", "artifacts"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  setVertical(v);
                  const params = new URLSearchParams(searchParams.toString());
                  params.set("vertical", v);
                  router.replace(`/?${params.toString()}`, { scroll: false });
                }}
                className={`px-3 py-1.5 rounded-lg border text-sm ${
                  vertical === v
                    ? "border-[var(--accent-heart)] text-[var(--accent-heart)] bg-[var(--accent-heart)]/10"
                    : "border-[var(--border)] text-[var(--text-tertiary)]"
                }`}
              >
                {v === "agents" ? "Agents" : v === "images" ? "Images" : "Artifacts"}
              </button>
            ))}
          </div>
          {vertical !== "agents" && (
            <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[var(--text-tertiary)]">Density:</span>
              <button
                type="button"
                onClick={() => setRecall("normal")}
                className={`px-2.5 py-1 rounded border ${
                  recall === "normal"
                    ? "border-[var(--accent-heart)] text-[var(--accent-heart)]"
                    : "border-[var(--border)] text-[var(--text-tertiary)]"
                }`}
              >
                Normal
              </button>
              <button
                type="button"
                onClick={() => setRecall("high")}
                className={`px-2.5 py-1 rounded border ${
                  recall === "high"
                    ? "border-[var(--accent-heart)] text-[var(--accent-heart)]"
                    : "border-[var(--border)] text-[var(--text-tertiary)]"
                }`}
              >
                High recall
              </button>
              <span className="ml-2 text-[var(--text-tertiary)]">Sources:</span>
              {["GITHUB", "REGISTRY", "WEB"].map((src) => {
                const active = includeSources.includes(src);
                return (
                  <button
                    key={src}
                    type="button"
                    onClick={() =>
                      setIncludeSources((prev) =>
                        prev.includes(src)
                          ? prev.filter((v) => v !== src)
                          : [...prev, src]
                      )
                    }
                    className={`px-2.5 py-1 rounded border ${
                      active
                        ? "border-[var(--accent-heart)] text-[var(--accent-heart)]"
                        : "border-[var(--border)] text-[var(--text-tertiary)]"
                    }`}
                  >
                    {src}
                  </button>
                );
              })}
            </div>
          )}

          <main aria-label="Search results">
            {loading && !hasResults ? (
              <div className="space-y-0" aria-busy="true" aria-live="polite">
                {[1, 2, 3, 4, 5].map((i) => (
                  <SkeletonSnippet key={i} />
                ))}
              </div>
            ) : !hasResults ? (
              <div className="py-12 text-center" role="status">
                <p className="text-[var(--text-secondary)] font-medium">
                  {vertical === "agents"
                    ? "No agents found. Try different filters or search terms."
                    : "No machine-usable visual assets found for this query."}
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <button
                    type="button"
                    onClick={handleExploreAllAgents}
                    className="inline-flex items-center gap-2 px-4 py-3 min-h-[44px] rounded-lg neural-glass border border-white/[0.08]"
                  >
                    Explore all agents
                  </button>
                  {BROWSE_PROTOCOLS.map(({ id, label }) => (
                    <Link
                      key={id}
                      href={`/?protocols=${id}`}
                      className="inline-flex items-center px-4 py-3 min-h-[44px] rounded-lg border border-[var(--border)]"
                    >
                      Browse {label}
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <p className="mb-4 text-sm text-[var(--text-tertiary)]" role="status" aria-live="polite">
                  {vertical === "agents"
                    ? total > 0
                      ? `About ${total} agent${total === 1 ? "" : "s"}`
                      : `${agents.length} agent${agents.length === 1 ? "" : "s"} found`
                    : `${mediaResults.length} visual asset${mediaResults.length === 1 ? "" : "s"} found`}
                </p>
                {vertical !== "agents" && (
                  <p className="mb-4 text-xs text-[var(--text-quaternary)]">
                    Searching visual index with {recall} recall.
                  </p>
                )}

                {vertical === "agents" ? (
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
                ) : (
                  <div
                    className={
                      isImagesVertical
                        ? "columns-2 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-3 sm:gap-4"
                        : "space-y-3"
                    }
                  >
                    {mediaResults.map((asset) => (
                      <article
                        key={asset.id}
                        className={
                          isImagesVertical
                            ? "mb-3 sm:mb-4 break-inside-avoid rounded-lg border border-white/[0.08] bg-[var(--bg-card)]/75 p-2.5 transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_30px_rgba(0,0,0,0.25)]"
                            : "rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3"
                        }
                      >
                        {isImagesVertical ? (
                          <a href={asset.url} target="_blank" rel="noreferrer">
                            {brokenMediaUrls.has(asset.url) ? (
                              <div className="w-full min-h-24 rounded-md border border-[var(--border)] flex items-center justify-center text-xs text-[var(--text-quaternary)] px-2 py-8 text-center">
                                Image unavailable
                              </div>
                            ) : (
                              <img
                                src={asset.url}
                                alt={asset.title ?? asset.agentName}
                                className="w-full h-auto rounded-md border border-[var(--border)]"
                                onError={() =>
                                  setBrokenMediaUrls((prev) => new Set(prev).add(asset.url))
                                }
                              />
                            )}
                          </a>
                        ) : null}
                        <p className={isImagesVertical ? "mt-2 text-[11px] text-[var(--text-secondary)]" : "mt-2 text-xs text-[var(--text-secondary)]"}>
                          <Link href={`/agent/${asset.agentSlug}`} className="text-[var(--accent-heart)] hover:underline">
                            {asset.agentName}
                          </Link>
                          {asset.artifactType ? (
                            <span className="ml-2 rounded border border-[var(--border)] px-1.5 py-0.5">
                              {asset.artifactType.replace(/_/g, " ")}
                            </span>
                          ) : null}
                          {asset.source ? (
                            <span className="ml-2 rounded border border-[var(--border)] px-1.5 py-0.5 text-[var(--text-quaternary)]">
                              {asset.source}
                            </span>
                          ) : null}
                        </p>
                        <p className={isImagesVertical ? "text-[11px] text-[var(--text-tertiary)] truncate" : "text-xs text-[var(--text-tertiary)] truncate"}>
                          {asset.title ?? asset.caption ?? asset.url.split("/").pop() ?? "Untitled asset"}
                        </p>
                        <a
                          href={asset.sourcePageUrl ?? asset.url}
                          target="_blank"
                          rel="noreferrer"
                          className={isImagesVertical ? "text-[11px] text-[var(--text-quaternary)] truncate block" : "text-xs text-[var(--text-quaternary)] truncate block"}
                        >
                          {asset.sourcePageUrl ?? asset.url}
                        </a>
                      </article>
                    ))}
                  </div>
                )}

                {hasMore && (
                  <div className="flex justify-center pt-8">
                    <button
                      type="button"
                      onClick={() => search(false)}
                      disabled={loading}
                      aria-busy={loading}
                      aria-label={loading ? "Loading more" : "Load more results"}
                      className="w-full sm:w-auto px-8 py-3.5 min-h-[48px] bg-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/90 disabled:opacity-50 rounded-xl font-semibold text-white"
                    >
                      {loading ? "Loading..." : "Load more"}
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
