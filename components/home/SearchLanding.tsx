"use client";

import { useState, useEffect, useCallback } from "react";
import { applyPreset, HOME_ACCENT_STORAGE_KEY } from "@/lib/theme-presets";
import type { ThemePresetId } from "@/lib/theme-presets";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { SearchResultSnippet } from "@/components/search/SearchResultSnippet";
import { SearchResultsBar } from "@/components/search/SearchResultsBar";
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
  primaryImageUrl?: string | null;
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
  contentMeta?: {
    hasEditorialContent: boolean;
    qualityScore: number | null;
    lastReviewedAt: string | null;
    bestFor: string | null;
    setupComplexity: "low" | "medium" | "high";
    hasFaq: boolean;
    hasPlaybook: boolean;
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
  vertical?: "agents" | "skills" | "artifacts";
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

function isImageAsset(asset: MediaResult) {
  if (asset.mimeType?.startsWith("image/")) return true;
  const url = asset.url?.toLowerCase() ?? "";
  return [".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".svg"].some((ext) =>
    url.includes(ext)
  );
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
  const [fallbackAgents, setFallbackAgents] = useState<Agent[]>([]);
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
  const [vertical, setVertical] = useState<"agents" | "skills" | "artifacts">(() => {
    const urlVertical = searchParams.get("vertical");
    if (urlVertical === "artifacts" || urlVertical === "skills") return urlVertical;
    return "agents";
  }
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

      const requestVertical = nextVertical === "skills" ? "agents" : nextVertical;
      const requestSkillsOnly = nextVertical === "skills";
      const urlIncludeSources = nextVertical === "skills" ? [] : nextIncludeSources;
      const requestIncludeSources = nextVertical === "skills"
        ? ["GITHUB_OPENCLEW", "CLAWHUB", "GITHUB_REPOS"]
        : nextIncludeSources;

      const urlParams = new URLSearchParams();
      if (nextQuery.trim()) urlParams.set("q", nextQuery.trim());
      if (nextSelectedProtocols.length) urlParams.set("protocols", nextSelectedProtocols.join(","));
      if (nextMinSafety > 0) urlParams.set("minSafety", String(nextMinSafety));
      urlParams.set("sort", nextSort);
      urlParams.set("limit", "30");
      urlParams.set("vertical", nextVertical);
      if (requestVertical === "agents") {
        urlParams.set("include", "content");
      }
      urlParams.set("recall", nextRecall);
      if (urlIncludeSources.length > 0) {
        urlParams.set("includeSources", urlIncludeSources.join(","));
      }
      urlParams.set("intent", nextIntent);
      if (nextTaskType.trim()) urlParams.set("taskType", nextTaskType.trim());
      if (nextMaxLatencyMs.trim()) urlParams.set("maxLatencyMs", nextMaxLatencyMs.trim());
      if (nextMaxCostUsd.trim()) urlParams.set("maxCostUsd", nextMaxCostUsd.trim());
      if (nextDataRegion && nextDataRegion !== "global") urlParams.set("dataRegion", nextDataRegion);
      if (nextRequires.trim()) urlParams.set("requires", nextRequires);
      if (nextForbidden.trim()) urlParams.set("forbidden", nextForbidden);
      if (nextBundle) urlParams.set("bundle", "1");
      if (nextExplain) urlParams.set("explain", "1");
      if (!reset) {
        if (nextVertical !== "artifacts" && cursor) urlParams.set("cursor", cursor);
        if (nextVertical === "artifacts" && mediaCursor) {
          urlParams.set("mediaCursor", mediaCursor);
        }
      }

      const requestParams = new URLSearchParams(urlParams.toString());
      requestParams.set("vertical", requestVertical);
      if (requestSkillsOnly) {
        requestParams.set("skillsOnly", "1");
      } else {
        requestParams.delete("skillsOnly");
      }
      if (requestIncludeSources.length > 0) {
        requestParams.set("includeSources", requestIncludeSources.join(","));
      } else {
        requestParams.delete("includeSources");
      }

      router.replace(`/?${urlParams.toString()}`, { scroll: false });

      try {
        const res = await fetch(`/api/v1/search?${requestParams}`);
        const payload = await res.json();
        if (!res.ok) throw new Error(extractClientErrorMessage(payload, "Search failed"));
        const data = unwrapClientResponse<SearchResponsePayload>(payload);

        if (reset) {
          setAgents(data.results ?? []);
          setMediaResults(data.mediaResults ?? []);
          setTotal(data.pagination?.total ?? 0);
        } else {
          setAgents((prev) => [...prev, ...(data.results ?? [])]);
          setMediaResults((prev) => [...prev, ...(data.mediaResults ?? [])]);
        }
        setHasMore(data.pagination?.hasMore ?? false);
        if (requestVertical === "agents") {
          setCursor(data.pagination?.nextCursor ?? null);
          setMediaCursor(null);
        } else {
          setMediaCursor(data.pagination?.nextCursor ?? null);
          setCursor(null);
        }
        if (data.facets) setFacets(data.facets);
        setSearchMeta(data.searchMeta ?? null);

        if (reset && requestVertical === "artifacts") {
          if ((data.mediaResults ?? []).length > 0) {
            setFallbackAgents([]);
          } else {
            const fallbackParams = new URLSearchParams(requestParams.toString());
            fallbackParams.set("vertical", "agents");
            fallbackParams.delete("mediaCursor");
            fallbackParams.set("limit", "24");
            const fallbackRes = await fetch(`/api/v1/search?${fallbackParams}`);
            const fallbackPayload = await fallbackRes.json();
            if (fallbackRes.ok) {
              const fallbackData = unwrapClientResponse<SearchResponsePayload>(fallbackPayload);
              setFallbackAgents(fallbackData.results ?? []);
            } else {
              setFallbackAgents([]);
            }
          }
        } else if (requestVertical === "agents") {
          setFallbackAgents([]);
        }
      } catch (err) {
        console.error(err);
        if (reset) {
          setAgents([]);
          setMediaResults([]);
          setTotal(0);
        }
        setSearchMeta(null);
        setFallbackAgents([]);
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

  const handleVerticalChange = useCallback(
    (v: "agents" | "skills" | "artifacts") => {
      setVertical(v);
      const params = new URLSearchParams(searchParams.toString());
      params.set("vertical", v);
      router.replace(`/?${params.toString()}`, { scroll: false });
    },
    [searchParams, router]
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
    const urlVertical = searchParams.get("vertical");
    setVertical(urlVertical === "artifacts" || urlVertical === "skills" ? urlVertical : "agents");
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
    if (typeof window === "undefined") return;
    requestAnimationFrame(() => window.scrollTo(0, 0));
  }, [searchParams]);

  const currentSearch = searchParams.toString();
  const fromPath = currentSearch ? `/?${currentSearch}` : "/";

  useEffect(() => {
    try {
      const stored = localStorage.getItem(HOME_ACCENT_STORAGE_KEY) as ThemePresetId | null;
      if (stored) applyPreset(stored);
    } catch {
      // ignore
    }
  }, []);

  const hasResults = vertical === "artifacts" ? mediaResults.length > 0 : agents.length > 0;
  const hasFallbackAgents = fallbackAgents.length > 0;

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
    <div className="min-h-screen text-[var(--text-primary)] bg-[#1e1e1e] relative">
      <div className="fixed inset-0 pointer-events-none z-0" aria-hidden>
        <div className="absolute inset-0 bg-gradient-radial from-[var(--accent-heart)]/[0.08] via-transparent to-transparent" />
        <div className="absolute top-0 right-1/4 w-[24rem] h-[24rem] bg-[var(--accent-neural)]/[0.06] rounded-full blur-3xl" />
      </div>
      <div className="relative z-10">
        <SearchResultsBar
          query={query}
          setQuery={setQuery}
          onSearch={(overrideQuery) => {
            const resolvedQuery = (overrideQuery ?? query).trim();
            if (!resolvedQuery) {
              void handleExploreAllAgents();
              return;
            }
            void search(true, { query: resolvedQuery });
          }}
          loading={loading}
          vertical={vertical}
          onVerticalChange={handleVerticalChange}
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

        <div className="max-w-4xl mx-auto px-3 sm:px-6 pt-6">
          {vertical === "artifacts" && (
            <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[var(--text-tertiary)]">Density:</span>
              <button
                type="button"
                onClick={() => setRecall("normal")}
                className={`px-2.5 py-1 rounded border ${recall === "normal"
                  ? "border-[var(--accent-heart)] text-[var(--accent-heart)]"
                  : "border-[var(--border)] text-[var(--text-tertiary)]"
                  }`}
              >
                Normal
              </button>
              <button
                type="button"
                onClick={() => setRecall("high")}
                className={`px-2.5 py-1 rounded border ${recall === "high"
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
                    className={`px-2.5 py-1 rounded border ${active
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
        </div>

        <div
          className="max-w-4xl mx-auto px-3 sm:px-6 pb-20 sm:pb-16"
        >
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
                  {vertical === "artifacts"
                    ? "No machine-usable visual assets found for this query."
                    : vertical === "skills"
                      ? "No skills found. Try different filters or search terms."
                      : "No agents found. Try different filters or search terms."}
                </p>
                {vertical === "artifacts" && hasFallbackAgents && (
                  <p className="mt-2 text-xs text-[var(--text-quaternary)]">
                    Showing agent thumbnails instead.
                  </p>
                )}
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
                  {vertical === "artifacts"
                    ? `${mediaResults.length} visual asset${mediaResults.length === 1 ? "" : "s"} found`
                    : vertical === "skills"
                      ? total > 0
                        ? `About ${total} skill${total === 1 ? "" : "s"}`
                        : `${agents.length} skill${agents.length === 1 ? "" : "s"} found`
                      : total > 0
                        ? `About ${total} agent${total === 1 ? "" : "s"}`
                        : `${agents.length} agent${agents.length === 1 ? "" : "s"} found`}
                </p>
                {vertical === "artifacts" && (
                  <p className="mb-4 text-xs text-[var(--text-quaternary)]">
                    Searching visual index with {recall} recall.
                  </p>
                )}

                {vertical === "skills" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {agents.map((agent) => {
                      const protos = Array.isArray(agent.protocols) ? agent.protocols : [];
                      const caps = Array.isArray(agent.capabilities) ? agent.capabilities : [];
                      const href = `/agent/${agent.slug}?from=${encodeURIComponent(fromPath)}`;
                      return (
                        <article
                          key={agent.id}
                          className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]/70 p-5 hover:border-[var(--accent-heart)]/40 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <Link
                                href={href}
                                className="text-base font-semibold text-[var(--accent-neural)] hover:underline truncate block"
                              >
                                {agent.name}
                              </Link>
                              <p className="text-xs text-[var(--text-quaternary)] mt-1">SKILL.md</p>
                            </div>
                            <span className="text-[10px] uppercase tracking-wider rounded-full px-2 py-1 border border-[var(--accent-heart)]/40 text-[var(--accent-heart)]">
                              Skill
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-[var(--text-secondary)] line-clamp-3">
                            {agent.description || "No description available."}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[var(--text-tertiary)]">
                            {protos.slice(0, 3).map((p) => (
                              <span key={`proto-${agent.id}-${p}`} className="rounded border border-[var(--border)] px-1.5 py-0.5">
                                {p}
                              </span>
                            ))}
                            {caps.slice(0, 3).map((c) => (
                              <span key={`cap-${agent.id}-${c}`} className="rounded border border-[var(--border)] px-1.5 py-0.5">
                                {c}
                              </span>
                            ))}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : vertical !== "artifacts" ? (
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
                  <div className="columns-1 sm:columns-2 lg:columns-3 gap-4">
                    {mediaResults.map((asset) => {
                      const preview = isImageAsset(asset) ? asset.url : null;
                      return (
                        <article
                          key={asset.id}
                          className="mb-4 break-inside-avoid rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/80 p-3 hover:border-[var(--accent-heart)]/30 transition-colors"
                        >
                          {preview ? (
                            <a href={asset.sourcePageUrl ?? asset.url} target="_blank" rel="noreferrer">
                              <img
                                src={preview}
                                alt={asset.title ?? asset.caption ?? "Artifact preview"}
                                className="w-full h-auto rounded-lg border border-[var(--border)]"
                              />
                            </a>
                          ) : (
                            <div className="w-full min-h-28 rounded-lg border border-[var(--border)] flex items-center justify-center text-xs text-[var(--text-quaternary)] px-3 py-10 text-center">
                              No preview available
                            </div>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-secondary)]">
                            <Link href={`/agent/${asset.agentSlug}`} className="text-[var(--accent-heart)] hover:underline">
                              {asset.agentName}
                            </Link>
                            {asset.artifactType ? (
                              <span className="rounded border border-[var(--border)] px-1.5 py-0.5">
                                {asset.artifactType.replace(/_/g, " ")}
                              </span>
                            ) : null}
                            {asset.source ? (
                              <span className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[var(--text-quaternary)]">
                                {asset.source}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-xs text-[var(--text-tertiary)] line-clamp-2">
                            {asset.title ?? asset.caption ?? asset.url.split("/").pop() ?? "Untitled asset"}
                          </p>
                          <a
                            href={asset.sourcePageUrl ?? asset.url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 text-[11px] text-[var(--text-quaternary)] truncate block"
                          >
                            {asset.sourcePageUrl ?? asset.url}
                          </a>
                        </article>
                      );
                    })}
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
    </div>
  );
}
