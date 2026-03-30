"use client";

import { useState, useEffect, useCallback, useRef, useTransition } from "react";
import { applyPreset, HOME_ACCENT_STORAGE_KEY } from "@/lib/theme-presets";
import type { ThemePresetId } from "@/lib/theme-presets";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { SearchTopControlsBar } from "@/components/search/SearchTopControlsBar";
import { SearchFiltersSidebar } from "@/components/search/SearchFiltersSidebar";
import { HFModelCard } from "@/components/search/HFModelCard";
import {
  extractClientErrorMessage,
  unwrapClientResponse,
} from "@/lib/api/client-response";
import { safeFetchJson } from "@/lib/safeFetch";
import {
  capabilityTokenToLabel,
  parseCapabilityParam,
} from "@/lib/search/capability-tokens";
import {
  buildSearchPageKey,
  buildSearchScopeKey,
  getPrefetchOrder,
  getRequestVertical,
  isMcpsOnlyVertical,
  isSkillsOnlyVertical,
  type ResolvedSearchState,
  type SearchVertical,
} from "@/components/home/searchTabState";

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
  entityType?: "agent" | "skill" | "mcp";
  canonicalPath?: string;
  description: string | null;
  primaryImageUrl?: string | null;
  capabilities: string[];
  protocols: string[];
  safetyScore: number;
  popularityScore?: number;
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

interface MixedDocResult {
  id: string;
  kind?: "agent" | "artifact" | "doc" | "page";
  docType?: string;
  source?: string;
  sourceId?: string;
  url?: string;
  domain?: string;
  agentSlug?: string | null;
  agentUrl?: string | null;
  title?: string | null;
  snippet?: string | null;
  qualityScore?: number;
  safetyScore?: number;
  freshnessScore?: number;
  confidenceScore?: number;
  indexedAt?: string;
  overallRank?: number;
}

type SearchResultItem = Agent | MixedDocResult;

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
  results?: SearchResultItem[];
  mediaResults?: MediaResult[];
  pagination?: { hasMore?: boolean; nextCursor?: string | null; total?: number };
  facets?: Facets;
  didYouMean?: string;
  searchMeta?: SearchMeta;
}

interface SearchOverrides {
  query?: string;
  selectedProtocols?: string[];
  selectedCapabilities?: string[];
  minSafety?: number;
  sort?: string;
  vertical?: "all" | "agents" | "skills" | "mcps" | "artifacts";
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

const PAGE_SIZE = 30;
type PageCursorMap = Record<number, string | null>;

interface CachedSearchPage {
  agents: SearchResultItem[];
  mediaResults: MediaResult[];
  fallbackAgents: Agent[];
  total: number | null;
  hasMore: boolean;
  facets?: Facets;
  searchMeta: SearchMeta | null;
  nextCursor: string | null;
}

type SearchCacheStore = Record<string, CachedSearchPage>;
type CursorStore = Record<string, PageCursorMap>;

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function isAgentResult(item: SearchResultItem): item is Agent {
  return typeof (item as Agent).slug === "string" && typeof (item as Agent).name === "string";
}

function buildPageItems(current: number, totalPages: number): Array<number | "ellipsis"> {
  const items: Array<number | "ellipsis"> = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i += 1) items.push(i);
    return items;
  }
  const left = Math.max(2, current - 1);
  const right = Math.min(totalPages - 1, current + 1);
  items.push(1);
  if (left > 2) items.push("ellipsis");
  for (let i = left; i <= right; i += 1) items.push(i);
  if (right < totalPages - 1) items.push("ellipsis");
  items.push(totalPages);
  return items;
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

function parseCapabilitiesFromUrl(value: string | null): string[] {
  return parseCapabilityParam(value);
}

function parseBoolFromUrl(value: string | null): boolean {
  return value === "1" || value === "true";
}

function parseSortFromUrl(value: string | null): string {
  if (value === "rank" || value === "safety" || value === "popularity" || value === "freshness") {
    return value;
  }
  return "popularity";
}

export function SearchLanding({ basePath = "/" }: { basePath?: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isTransitionPending, startTransition] = useTransition();
  const normalizedBasePath = basePath.startsWith("/") ? basePath : `/${basePath}`;
  const buildPath = useCallback(
    (params: URLSearchParams) => {
      const query = params.toString();
      return query ? `${normalizedBasePath}?${query}` : normalizedBasePath;
    },
    [normalizedBasePath]
  );
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [agents, setAgents] = useState<SearchResultItem[]>([]);
  const [mediaResults, setMediaResults] = useState<MediaResult[]>([]);
  const [fallbackAgents, setFallbackAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [selectedProtocols, setSelectedProtocols] = useState<string[]>(() =>
    parseProtocolsFromUrl(searchParams.get("protocols"))
  );
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>(() =>
    parseCapabilitiesFromUrl(searchParams.get("capabilities"))
  );
  const [minSafety, setMinSafety] = useState(0);
  const [sort, setSort] = useState(() => parseSortFromUrl(searchParams.get("sort")));
  const [facets, setFacets] = useState<Facets | undefined>(undefined);
  const [intent, setIntent] = useState<"discover" | "execute">(
    searchParams.get("intent") === "execute" ? "execute" : "discover"
  );
  const [vertical, setVertical] = useState<SearchVertical>(() => {
    const urlVertical = searchParams.get("vertical");
    if (
      urlVertical === "artifacts" ||
      urlVertical === "mcps" ||
      urlVertical === "skills" ||
      urlVertical === "all" ||
      urlVertical === "agents" ||
      urlVertical === "docs"
    ) {
      return urlVertical === "docs" ? "all" : urlVertical;
    }
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
  const [recall, setRecall] = useState<"normal" | "high">(
    searchParams.get("recall") === "high" ? "high" : "normal"
  );
  const [includeSources, setIncludeSources] = useState<string[]>(
    (searchParams.get("includeSources") ?? "")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
  );
  const [page, setPage] = useState(1);
  const cacheRef = useRef<SearchCacheStore>({});
  const cursorStoreRef = useRef<CursorStore>({});
  const inFlightRequestsRef = useRef<Map<string, Promise<CachedSearchPage>>>(new Map());
  const latestVisibleRequestRef = useRef(0);
  const latestVisiblePageKeyRef = useRef<string | null>(null);

  const buildResolvedState = useCallback(
    (overrides?: SearchOverrides): ResolvedSearchState => ({
      query: overrides?.query ?? query,
      selectedProtocols: overrides?.selectedProtocols ?? selectedProtocols,
      selectedCapabilities: overrides?.selectedCapabilities ?? selectedCapabilities,
      minSafety: overrides?.minSafety ?? minSafety,
      sort: overrides?.sort ?? sort,
      vertical: overrides?.vertical ?? vertical,
      intent: overrides?.intent ?? intent,
      taskType: overrides?.taskType ?? taskType,
      maxLatencyMs: overrides?.maxLatencyMs ?? maxLatencyMs,
      maxCostUsd: overrides?.maxCostUsd ?? maxCostUsd,
      dataRegion: overrides?.dataRegion ?? dataRegion,
      requires: overrides?.requires ?? requires,
      forbidden: overrides?.forbidden ?? forbidden,
      bundle: overrides?.bundle ?? bundle,
      explain: overrides?.explain ?? explain,
      recall: overrides?.recall ?? recall,
      includeSources: overrides?.includeSources ?? includeSources,
    }),
    [
      bundle,
      dataRegion,
      explain,
      includeSources,
      intent,
      maxCostUsd,
      maxLatencyMs,
      minSafety,
      query,
      recall,
      requires,
      forbidden,
      selectedCapabilities,
      selectedProtocols,
      sort,
      taskType,
      vertical,
    ]
  );

  const applyCachedPage = useCallback((entry: CachedSearchPage, pageIndex: number) => {
    setAgents(entry.agents);
    setMediaResults(entry.mediaResults);
    setFallbackAgents(entry.fallbackAgents);
    setTotal(entry.total);
    setHasMore(entry.hasMore);
    setFacets(entry.facets);
    setSearchMeta(entry.searchMeta);
    setPage(pageIndex);
  }, []);

  const handleProtocolChange = useCallback(
    (protocols: string[]) => {
      setSelectedProtocols(protocols);
      const params = new URLSearchParams(searchParams.toString());
      if (protocols.length) params.set("protocols", protocols.join(","));
      else params.delete("protocols");
      router.replace(buildPath(params), { scroll: false });
    },
    [searchParams, router, buildPath]
  );

  const loadPage = useCallback(
    async (pageIndex: number, overrides?: SearchOverrides, options?: { prefetch?: boolean }) => {
      const resolvedState = buildResolvedState(overrides);
      const requestVertical = getRequestVertical(resolvedState.vertical);
      const scopeKey = buildSearchScopeKey(resolvedState);
      const pageKey = buildSearchPageKey(scopeKey, pageIndex);
      const requestId = options?.prefetch ? 0 : latestVisibleRequestRef.current + 1;
      const cursorMap = cursorStoreRef.current[scopeKey] ?? { 1: null };
      const pageCursor = pageIndex === 1 ? null : cursorMap[pageIndex] ?? null;

      const urlParams = new URLSearchParams();
      if (resolvedState.query.trim()) urlParams.set("q", resolvedState.query.trim());
      if (resolvedState.selectedProtocols.length) {
        urlParams.set("protocols", resolvedState.selectedProtocols.join(","));
      }
      if (resolvedState.selectedCapabilities.length) {
        urlParams.set("capabilities", resolvedState.selectedCapabilities.join(","));
      }
      if (resolvedState.minSafety > 0) urlParams.set("minSafety", String(resolvedState.minSafety));
      urlParams.set("sort", resolvedState.sort);
      urlParams.set("limit", String(PAGE_SIZE));
      urlParams.set("vertical", resolvedState.vertical);
      urlParams.set("page", String(pageIndex));
      urlParams.set("recall", resolvedState.recall);
      urlParams.set("intent", resolvedState.intent);
      if (resolvedState.taskType.trim()) urlParams.set("taskType", resolvedState.taskType.trim());
      if (resolvedState.maxLatencyMs.trim()) urlParams.set("maxLatencyMs", resolvedState.maxLatencyMs.trim());
      if (resolvedState.maxCostUsd.trim()) urlParams.set("maxCostUsd", resolvedState.maxCostUsd.trim());
      if (resolvedState.dataRegion && resolvedState.dataRegion !== "global") {
        urlParams.set("dataRegion", resolvedState.dataRegion);
      }
      if (resolvedState.requires.trim()) urlParams.set("requires", resolvedState.requires.trim());
      if (resolvedState.forbidden.trim()) urlParams.set("forbidden", resolvedState.forbidden.trim());
      if (resolvedState.bundle) urlParams.set("bundle", "1");
      if (resolvedState.explain) urlParams.set("explain", "1");
      if (resolvedState.includeSources.length > 0) {
        urlParams.set("includeSources", resolvedState.includeSources.join(","));
      }

      const requestParams = new URLSearchParams(urlParams.toString());
      requestParams.set("vertical", requestVertical);
      requestParams.set("includeTotal", "0");
      if (requestVertical === "agents") {
        requestParams.set("fields", "card");
      }
      if (isSkillsOnlyVertical(resolvedState.vertical)) {
        requestParams.set("entityTypes", "skill");
        requestParams.set("skillsOnly", "1");
      } else if (isMcpsOnlyVertical(resolvedState.vertical)) {
        requestParams.set("entityTypes", "mcp");
        requestParams.delete("skillsOnly");
      } else if (resolvedState.vertical === "agents") {
        requestParams.set("entityTypes", "agent");
        requestParams.delete("skillsOnly");
      } else {
        if (resolvedState.vertical === "all") {
          requestParams.set("entityTypes", "agent,skill,mcp");
        }
        requestParams.delete("skillsOnly");
      }
      if (resolvedState.includeSources.length > 0) {
        requestParams.set("includeSources", resolvedState.includeSources.join(","));
      } else {
        requestParams.delete("includeSources");
      }
      if (requestVertical !== "artifacts" && pageCursor) {
        requestParams.set("cursor", pageCursor);
      }
      if (requestVertical === "artifacts" && pageCursor) {
        requestParams.set("mediaCursor", pageCursor);
      }

      const cached = cacheRef.current[pageKey];

      if (!options?.prefetch) {
        latestVisibleRequestRef.current = requestId;
        latestVisiblePageKeyRef.current = pageKey;
        if (!cached) {
          setLoading(true);
        }
        router.replace(buildPath(urlParams), { scroll: false });
      }
      if (cached) {
        if (!options?.prefetch && latestVisiblePageKeyRef.current === pageKey) {
          applyCachedPage(cached, pageIndex);
          setLoading(false);
        }
        return cached;
      }

      if (pageIndex > 1 && !pageCursor) {
        if (!options?.prefetch && latestVisiblePageKeyRef.current === pageKey) {
          setLoading(false);
        }
        return null;
      }

      const existingRequest = inFlightRequestsRef.current.get(pageKey);
      const requestPromise = existingRequest ?? (async () => {
        const searchResponse = await safeFetchJson(`/api/v1/search?${requestParams}`);
        if (!searchResponse.ok) {
          throw new Error(extractClientErrorMessage(searchResponse.data, "Search failed"));
        }
        const searchData = unwrapClientResponse<SearchResponsePayload>(searchResponse.data);
        const nextAgents = dedupeById<SearchResultItem>(searchData.results ?? []);
        const nextMedia = dedupeById<MediaResult>(searchData.mediaResults ?? []);
        let nextFallbackAgents: Agent[] = [];

        if (pageIndex === 1 && requestVertical === "artifacts" && nextMedia.length === 0) {
          const fallbackParams = new URLSearchParams(requestParams.toString());
          fallbackParams.set("vertical", "agents");
          fallbackParams.delete("mediaCursor");
          fallbackParams.delete("cursor");
          fallbackParams.set("limit", String(PAGE_SIZE));
          fallbackParams.set("page", "1");
          const fallbackResponse = await safeFetchJson(`/api/v1/search?${fallbackParams}`);
          if (fallbackResponse.ok) {
            const fallbackData = unwrapClientResponse<SearchResponsePayload>(fallbackResponse.data);
            nextFallbackAgents = (fallbackData.results ?? []).filter(isAgentResult);
          }
        }

        const nextCursor = searchData.pagination?.nextCursor ?? null;
        cursorStoreRef.current[scopeKey] = {
          ...(cursorStoreRef.current[scopeKey] ?? { 1: null }),
          [pageIndex]: pageCursor,
          ...(nextCursor ? { [pageIndex + 1]: nextCursor } : {}),
        };

        const entry: CachedSearchPage = {
          agents: nextAgents,
          mediaResults: nextMedia,
          fallbackAgents: requestVertical === "artifacts" ? nextFallbackAgents : [],
          total: typeof searchData.pagination?.total === "number" ? searchData.pagination.total : null,
          hasMore: searchData.pagination?.hasMore ?? false,
          facets: searchData.facets,
          searchMeta: searchData.searchMeta ?? null,
          nextCursor,
        };
        cacheRef.current[pageKey] = entry;
        return entry;
      })();

      if (!existingRequest) {
        inFlightRequestsRef.current.set(
          pageKey,
          requestPromise.finally(() => {
            inFlightRequestsRef.current.delete(pageKey);
          })
        );
      }

      try {
        const entry = await requestPromise;
        if (!options?.prefetch && latestVisiblePageKeyRef.current === pageKey && latestVisibleRequestRef.current === requestId) {
          applyCachedPage(entry, pageIndex);
        }
        return entry;
      } catch (err) {
        if (!options?.prefetch && latestVisiblePageKeyRef.current === pageKey && latestVisibleRequestRef.current === requestId) {
          console.error(err);
          setAgents([]);
          setMediaResults([]);
          setFallbackAgents([]);
          setTotal(null);
          setHasMore(false);
          setFacets(undefined);
          setSearchMeta(null);
        }
        return null;
      } finally {
        if (!options?.prefetch && latestVisiblePageKeyRef.current === pageKey && latestVisibleRequestRef.current === requestId) {
          setLoading(false);
        }
      }
    },
    [applyCachedPage, buildPath, buildResolvedState, router]
  );

  const handleVerticalChange = useCallback(
    (v: SearchVertical) => {
      if (v === vertical) return;
      startTransition(() => {
        setVertical(v);
        setPage(1);
        const params = new URLSearchParams(searchParams.toString());
        params.set("vertical", v);
        params.set("page", "1");
        router.replace(buildPath(params), { scroll: false });
      });
    },
    [buildPath, router, searchParams, startTransition, vertical]
  );

  useEffect(() => {
    const activeState = buildResolvedState();
    void loadPage(1, activeState).then((entry) => {
      if (!entry || activeState.vertical !== vertical) return;
      const siblingOverrides = getPrefetchOrder(activeState.vertical).map((nextVertical) => ({
        ...activeState,
        vertical: nextVertical,
      }));
      siblingOverrides.forEach((prefetchState) => {
        void loadPage(1, prefetchState, { prefetch: true });
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedProtocols,
    selectedCapabilities,
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
    recall,
    includeSources,
    vertical,
  ]);

  useEffect(() => {
    const urlQ = searchParams.get("q") ?? "";
    const urlProtocols = parseProtocolsFromUrl(searchParams.get("protocols"));
    const urlCapabilities = parseCapabilitiesFromUrl(searchParams.get("capabilities"));
    const urlPage = Number(searchParams.get("page") ?? "1");
    setQuery(urlQ);
    setSelectedProtocols(urlProtocols);
    setSelectedCapabilities(urlCapabilities);
    setIntent(searchParams.get("intent") === "execute" ? "execute" : "discover");
    setSort(parseSortFromUrl(searchParams.get("sort")));
    const urlVertical = searchParams.get("vertical");
    if (
      urlVertical === "artifacts" ||
      urlVertical === "skills" ||
      urlVertical === "mcps" ||
      urlVertical === "all" ||
      urlVertical === "agents" ||
      urlVertical === "docs"
    ) {
      setVertical(urlVertical === "docs" ? "all" : urlVertical);
    } else {
      setVertical("agents");
    }
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
    if (Number.isFinite(urlPage) && urlPage > 0) setPage(urlPage);
  }, [searchParams]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    requestAnimationFrame(() => window.scrollTo(0, 0));
  }, [searchParams]);

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
  const totalLabel = typeof total === "number" && total > 0
    ? `${total.toLocaleString("en-US")} ${
        vertical === "artifacts"
          ? "assets"
        : vertical === "skills"
          ? "skills"
        : vertical === "mcps"
          ? "mcps"
          : vertical === "all"
            ? "results"
            : "agents"
    }`
    : undefined;

  const handleExploreAllAgents = useCallback(async () => {
    setQuery("");
    setSelectedProtocols([]);
    setSelectedCapabilities([]);
    setMinSafety(0);
    setSort("popularity");
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

    await loadPage(1, {
      query: "",
      selectedProtocols: [],
      selectedCapabilities: [],
      minSafety: 0,
      sort: "popularity",
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
  }, [loadPage]);

  const totalPages = typeof total === "number" && total > 0
    ? Math.max(1, Math.ceil(total / PAGE_SIZE))
    : null;
  const activeScopeKey = buildSearchScopeKey(buildResolvedState());
  const activeCursorMap = cursorStoreRef.current[activeScopeKey] ?? { 1: null };
  const maxNavigablePage = Math.max(
    1,
    ...Object.keys(activeCursorMap).map((p) => Number(p)),
    hasMore ? page + 1 : 1
  );
  const pageItems = totalPages ? buildPageItems(page, totalPages) : [];
  const filtersSidebar = (
    <SearchFiltersSidebar
      facets={facets}
      protocolOptions={BROWSE_PROTOCOLS}
      selectedProtocols={selectedProtocols}
      onProtocolChange={handleProtocolChange}
      minSafety={minSafety}
      onSafetyChange={setMinSafety}
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
  );

  return (
    <div className="min-h-screen text-[var(--text-primary)] bg-[#1e1e1e] relative">
      <div className="fixed inset-0 pointer-events-none z-0" aria-hidden>
        <div className="absolute inset-0 bg-gradient-radial from-[var(--accent-heart)]/[0.08] via-transparent to-transparent" />
        <div className="absolute top-0 right-1/4 w-[24rem] h-[24rem] bg-[var(--accent-neural)]/[0.06] rounded-full blur-3xl" />
      </div>
      <div className="relative z-10">
        <header>
          <SearchTopControlsBar
            query={query}
            setQuery={setQuery}
            onSearch={(overrideQuery) => {
              const resolvedQuery = (overrideQuery ?? query).trim();
              const hasFilterState =
                selectedProtocols.length > 0 ||
                selectedCapabilities.length > 0 ||
                minSafety > 0 ||
                vertical !== "agents" ||
                intent !== "discover" ||
                taskType.trim().length > 0 ||
                maxLatencyMs.trim().length > 0 ||
                maxCostUsd.trim().length > 0 ||
                dataRegion !== "global" ||
                requires.trim().length > 0 ||
                forbidden.trim().length > 0 ||
                bundle ||
                explain ||
                recall !== "normal" ||
                includeSources.length > 0;
              if (!resolvedQuery && !hasFilterState) {
                void handleExploreAllAgents();
                return;
              }
              const submitSort = resolvedQuery ? "popularity" : sort;
              if (resolvedQuery && sort !== "popularity") {
                setSort("popularity");
              }
              setPage(1);
              void loadPage(1, { query: resolvedQuery, sort: submitSort });
            }}
            loading={loading}
            isRefreshing={isTransitionPending || (loading && hasResults)}
            vertical={vertical}
            onVerticalChange={handleVerticalChange}
            sort={sort}
            onSortChange={setSort}
            totalLabel={totalLabel}
            filtersSidebar={filtersSidebar}
          />
        </header>

        <section className="w-full pt-4 pb-20 sm:pb-16" aria-label="Search results layout">
          <div className="mx-auto w-full max-w-none px-4 sm:px-6">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[480px_minmax(0,1fr)]">
              <aside className="hidden lg:block lg:sticky lg:top-24 h-fit">
                {filtersSidebar}
              </aside>

              <div className="min-w-0 w-full max-w-[960px] mx-auto">
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

              {selectedCapabilities.length > 0 && (
                <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-[var(--text-tertiary)]">Capabilities:</span>
                  {selectedCapabilities.map((capability) => (
                    <button
                      key={capability}
                      type="button"
                      onClick={() =>
                        setSelectedCapabilities((prev) =>
                          prev.filter((value) => value !== capability)
                        )
                      }
                      className="inline-flex items-center gap-2 rounded-full border border-[var(--accent-heart)]/30 bg-[var(--accent-heart)]/10 px-3 py-1 text-[var(--accent-heart)]"
                    >
                      {capabilityTokenToLabel(capability)}
                      <span aria-hidden>×</span>
                    </button>
                  ))}
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
                      {vertical === "artifacts"
                        ? "No machine-usable visual assets found for this query."
                        : vertical === "all"
                          ? "No results found. Try different filters or search terms."
                        : vertical === "skills"
                          ? "No skills found. Try different filters or search terms."
                          : vertical === "mcps"
                            ? "No MCPs found. Try different filters or search terms."
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
                    {vertical === "artifacts" && (
                      <p className="mb-4 text-xs text-[var(--text-quaternary)]">
                        Searching visual index with {recall} recall.
                      </p>
                    )}

                    {vertical === "all" ? (
                      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 auto-rows-[64px] items-stretch pt-4">
                        {agents.map((item) =>
                          isAgentResult(item) ? (
                            <HFModelCard key={item.id} agent={item} />
                          ) : (
                            <div key={item.id} className="rounded-lg bg-gradient-to-r from-[#6366f1] via-[#8b5cf6] to-[#ec4899] p-[1px]">
                              <article className="group flex h-full min-h-[64px] items-center gap-3 overflow-hidden rounded-[7px] border border-transparent bg-white px-3 py-1.5 transition-all duration-200 hover:bg-white">
                                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                                  {item.kind ?? "doc"}
                                </div>
                                <div className="min-w-0 flex-1 overflow-hidden">
                                  <div className="flex items-center justify-between gap-3">
                                    {item.agentUrl ? (
                                      <Link
                                        href={item.agentUrl}
                                        className="min-w-0 truncate text-sm font-semibold text-slate-900 transition-colors hover:text-[var(--accent-heart)]"
                                      >
                                        {item.title?.trim() || item.url || item.sourceId || "Untitled result"}
                                      </Link>
                                    ) : item.url?.startsWith("http") ? (
                                      <a
                                        href={item.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="min-w-0 truncate text-sm font-semibold text-slate-900 transition-colors hover:text-[var(--accent-heart)]"
                                      >
                                        {item.title?.trim() || item.url || item.sourceId || "Untitled result"}
                                      </a>
                                    ) : (
                                      <h3 className="min-w-0 truncate text-sm font-semibold text-slate-900">
                                        {item.title?.trim() || item.url || item.sourceId || "Untitled result"}
                                      </h3>
                                    )}
                                    <span className="shrink-0 text-xs text-slate-500">
                                      {item.domain || item.source || "document"}
                                    </span>
                                  </div>
                                  <p className="mt-1 truncate text-[11px] leading-none text-slate-500">
                                    {item.snippet || item.url || item.sourceId || "Open result"}
                                  </p>
                                </div>
                              </article>
                            </div>
                          )
                        )}
                      </div>
                    ) : vertical !== "artifacts" ? (
                      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 auto-rows-[64px] items-stretch pt-4">
                        {agents.filter(isAgentResult).map((agent) => (
                          <HFModelCard key={agent.id} agent={agent} />
                        ))}
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
                                  <Image
                                    src={preview}
                                    alt={asset.title ?? asset.caption ?? "Artifact preview"}
                                    width={1200}
                                    height={800}
                                    unoptimized
                                    className="w-full h-auto rounded-lg border border-[var(--border)]"
                                  />
                                </a>
                              ) : (
                                <div className="w-full min-h-28 rounded-lg border border-[var(--border)] flex items-center justify-center text-xs text-[var(--text-quaternary)] px-3 py-10 text-center">
                                  No preview available
                                </div>
                              )}
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-secondary)]">
                                <Link href={agents.filter(isAgentResult).find((agent) => agent.slug === asset.agentSlug)?.canonicalPath ?? `/agent/${asset.agentSlug}`} className="text-[var(--accent-heart)] hover:underline">
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

                    {((totalPages != null && totalPages > 1) || (totalPages == null && (page > 1 || hasMore))) && (
                      <div className="flex flex-col items-center gap-4 pt-8">
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => loadPage(Math.max(1, page - 1))}
                            disabled={loading || page <= 1}
                            aria-label="Previous page"
                            className="px-3 py-2 min-h-[40px] rounded-lg border border-[var(--border)] text-sm text-[var(--text-primary)] disabled:opacity-50"
                          >
                            Prev
                          </button>
                          {pageItems.map((item, i) =>
                            item === "ellipsis" ? (
                              <span
                                key={`ellipsis-${i}`}
                                className="px-2 text-[var(--text-tertiary)]"
                              >
                                …
                              </span>
                            ) : (
                              <button
                                key={`page-${item}`}
                                type="button"
                                onClick={() => loadPage(item)}
                                disabled={loading || item === page || item > maxNavigablePage}
                                aria-label={`Page ${item}`}
                                className={`px-3 py-2 min-h-[40px] rounded-lg border text-sm ${
                                  item === page
                                    ? "border-[var(--accent-heart)] text-[var(--accent-heart)] bg-[var(--accent-heart)]/10"
                                    : "border-[var(--border)] text-[var(--text-primary)]"
                                } disabled:opacity-50`}
                              >
                                {item}
                              </button>
                            )
                          )}
                          <button
                            type="button"
                            onClick={() => loadPage(page + 1)}
                            disabled={loading || !hasMore || page + 1 > maxNavigablePage}
                            aria-label="Next page"
                            className="px-3 py-2 min-h-[40px] rounded-lg border border-[var(--border)] text-sm text-[var(--text-primary)] disabled:opacity-50"
                          >
                            Next
                          </button>
                        </div>
                        <p className="text-xs text-[var(--text-tertiary)]">
                          {totalPages != null ? `Page ${page} of ${totalPages}` : `Page ${page}`}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </main>
            </div>
          </div>
          </div>
        </section>
      </div>
    </div>
  );
}
