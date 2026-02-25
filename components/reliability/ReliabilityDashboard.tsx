"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiV1 } from "@/lib/api/url";

type BrowseAgent = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
};

type BrowseResponse = {
  results: BrowseAgent[];
  pagination: { hasMore: boolean; nextCursor: string | null; total?: number };
};

type ReliabilityMetrics = {
  agentId: string;
  agentSlug?: string | null;
  success_rate?: number;
  avg_latency_ms?: number;
  avg_cost_usd?: number;
  hallucination_rate?: number;
  retry_rate?: number;
  dispute_rate?: number;
  p50_latency?: number;
  p95_latency?: number;
  top_failure_modes?: Array<{ type: string; frequency: number; last_seen?: string }>;
  confidence_calibration_error?: number | null;
  percentile_rank?: number | null;
  hiring_score?: number | null;
  last_30_day_trend?: { success_rate_delta?: number; cost_delta?: number };
  last_updated?: string | null;
};

type SuggestionResponse = {
  recommended_actions?: string[];
  expected_success_rate_gain?: number;
  expected_cost_reduction?: number;
};

const EMPTY_STATE_MESSAGE =
  "Select an agent to view reliability metrics. Browse the list on the left to get started.";

function formatPct(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value?: number | null, suffix = "") {
  if (value == null || Number.isNaN(value)) return "-";
  return `${value.toFixed(2)}${suffix}`;
}

function formatInt(value?: number | null, suffix = "") {
  if (value == null || Number.isNaN(value)) return "-";
  return `${Math.round(value)}${suffix}`;
}

export function ReliabilityDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialAgent = searchParams.get("agent");

  const [browseAgents, setBrowseAgents] = useState<BrowseAgent[]>([]);
  const [browseLoading, setBrowseLoading] = useState(true);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [browseCursor, setBrowseCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [browseFilter, setBrowseFilter] = useState("");
  const [topAgents, setTopAgents] = useState<BrowseAgent[]>([]);
  const [topLoading, setTopLoading] = useState(false);
  const [topError, setTopError] = useState<string | null>(null);

  const [selectedAgent, setSelectedAgent] = useState<BrowseAgent | null>(null);
  const [metrics, setMetrics] = useState<ReliabilityMetrics | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestionResponse | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [metricsReloadKey, setMetricsReloadKey] = useState(0);

  const selectedSlug = selectedAgent?.slug ?? null;

  useEffect(() => {
    let active = true;
    async function loadBrowse(cursor?: string | null) {
      setBrowseLoading(true);
      setBrowseError(null);
      try {
        const params = new URLSearchParams({
          limit: "20",
        });
        if (cursor) params.set("cursor", cursor);
        const res = await fetch(apiV1(`/reliability/browse?${params.toString()}`), { cache: "no-store" });
        if (!res.ok) throw new Error(`Browse failed (${res.status})`);
        const data = (await res.json()) as BrowseResponse;
        if (!active) return;
        setBrowseAgents((prev) => (cursor ? [...prev, ...(data.results ?? [])] : data.results ?? []));
        setBrowseCursor(data.pagination?.nextCursor ?? null);
        setHasMore(Boolean(data.pagination?.hasMore));
      } catch (err) {
        if (!active) return;
        setBrowseError(err instanceof Error ? err.message : "Failed to load agents");
      } finally {
        if (active) setBrowseLoading(false);
      }
    }
    loadBrowse(null);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadTopAgents() {
      setTopLoading(true);
      setTopError(null);
      try {
        const res = await fetch(apiV1("/reliability/top?limit=5"), { cache: "no-store" });
        if (!res.ok) throw new Error(`Top agents failed (${res.status})`);
        const data = (await res.json()) as { results?: BrowseAgent[] };
        if (!active) return;
        setTopAgents(data.results ?? []);
      } catch (err) {
        if (!active) return;
        setTopError(err instanceof Error ? err.message : "Failed to load top agents");
      } finally {
        if (active) setTopLoading(false);
      }
    }
    loadTopAgents();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!initialAgent || browseAgents.length == 0) return;
    const match = browseAgents.find((agent) => agent.slug == initialAgent || agent.id == initialAgent);
    if (match) {
      setSelectedAgent(match);
    }
  }, [initialAgent, browseAgents]);

  useEffect(() => {
    let active = true;
    async function loadMetrics(agent: BrowseAgent) {
      setMetricsLoading(true);
      setMetricsError(null);
      try {
        const [metricsRes, suggestRes] = await Promise.all([
          fetch(apiV1(`/reliability/agent/${agent.slug}`), { cache: "no-store" }),
          fetch(apiV1(`/reliability/suggest/${agent.slug}`), { cache: "no-store" }),
        ]);
        if (!metricsRes.ok) throw new Error(`Metrics failed (${metricsRes.status})`);
        const metricsData = (await metricsRes.json()) as ReliabilityMetrics;
        const suggestData = suggestRes.ok ? ((await suggestRes.json()) as SuggestionResponse) : null;
        if (!active) return;
        setMetrics(metricsData);
        setSuggestions(suggestData);
      } catch (err) {
        if (!active) return;
        setMetricsError(err instanceof Error ? err.message : "Failed to load metrics");
        setMetrics(null);
        setSuggestions(null);
      } finally {
        if (active) setMetricsLoading(false);
      }
    }
    if (selectedAgent) {
      loadMetrics(selectedAgent);
      const params = new URLSearchParams(searchParams.toString());
      params.set("agent", selectedAgent.slug);
      router.replace(`/reliability?${params.toString()}`);
    } else {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("agent");
      router.replace(`/reliability${params.toString() ? `?${params.toString()}` : ""}`);
    }
    return () => {
      active = false;
    };
  }, [selectedAgent, router, searchParams, metricsReloadKey]);

  const topFailures = useMemo(() => metrics?.top_failure_modes ?? [], [metrics]);
  const filteredAgents = useMemo(() => {
    const needle = browseFilter.trim().toLowerCase();
    if (!needle) return browseAgents;
    return browseAgents.filter((agent) => {
      return (
        agent.name.toLowerCase().includes(needle) ||
        agent.slug.toLowerCase().includes(needle) ||
        (agent.description ?? "").toLowerCase().includes(needle)
      );
    });
  }, [browseAgents, browseFilter]);

  return (
    <section className="rounded-2xl border border-white bg-black p-6 sm:p-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-white">Live Reliability</p>
          <h2 className="text-2xl sm:text-3xl font-semibold text-white">Agent Reliability Dashboard</h2>
          <p className="text-sm text-white max-w-2xl">
            Browse agents to load real-time metrics, failure modes, and self-optimization suggestions.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedAgent && (
            <>
              <button
                type="button"
                onClick={() => setMetricsReloadKey((v) => v + 1)}
                className="px-4 py-2 rounded-full border border-white text-xs text-white hover:bg-white hover:text-black transition-colors"
              >
                Refresh metrics
              </button>
              <button
                type="button"
                onClick={() => setSelectedAgent(null)}
                className="px-4 py-2 rounded-full border border-white text-xs text-white hover:bg-white hover:text-black transition-colors"
              >
                Clear selection
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="rounded-2xl border border-white bg-black p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white uppercase tracking-[0.22em]">Browse Agents</h3>
            <span className="text-xs text-white">{filteredAgents.length} shown</span>
          </div>
          <div className="mt-3">
            <input
              type="search"
              placeholder="Filter agents by name or slug..."
              value={browseFilter}
              onChange={(e) => setBrowseFilter(e.target.value)}
              className="w-full rounded-xl border border-white bg-black px-3 py-2 text-xs text-white placeholder:text-white focus:outline-none focus:border-white"
            />
          </div>
          <div className="mt-4 space-y-3 max-h-[460px] overflow-y-auto pr-1">
            {browseLoading && browseAgents.length == 0 && (
              <div className="text-sm text-white">Loading agents...</div>
            )}
            {browseError && <div className="text-sm text-white">{browseError}</div>}
            {filteredAgents.map((agent) => {
              const isActive = selectedSlug == agent.slug;
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => setSelectedAgent(agent)}
                  className={`w-full text-left rounded-xl border px-3 py-3 transition-all ${
                    isActive
                      ? "border-white bg-white text-black"
                      : "border-white text-white hover:bg-white hover:text-black"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className={`text-sm font-semibold ${isActive ? "text-black" : "text-white"}`}>
                        {agent.name}
                      </p>
                      <p className={`text-xs ${isActive ? "text-black/70" : "text-white/70"}`}>@{agent.slug}</p>
                    </div>
                    <span className={`text-[10px] uppercase tracking-[0.2em] ${isActive ? "text-black/70" : "text-white/70"}`}>
                      {isActive ? "Selected" : "Select"}
                    </span>
                  </div>
                  {agent.description && (
                    <p className={`mt-2 text-xs ${isActive ? "text-black/70" : "text-white/80"} line-clamp-2`}>
                      {agent.description}
                    </p>
                  )}
                </button>
              );
            })}
            {hasMore && (
              <button
                type="button"
                disabled={browseLoading}
                onClick={async () => {
                  if (!browseCursor) return;
                  setBrowseLoading(true);
                  setBrowseError(null);
                  try {
                    const params = new URLSearchParams({
                      limit: "20",
                      cursor: browseCursor,
                    });
                    const res = await fetch(apiV1(`/reliability/browse?${params.toString()}`), { cache: "no-store" });
                    if (!res.ok) throw new Error(`Browse failed (${res.status})`);
                    const data = (await res.json()) as BrowseResponse;
                    setBrowseAgents((prev) => [...prev, ...(data.results ?? [])]);
                    setBrowseCursor(data.pagination?.nextCursor ?? null);
                    setHasMore(Boolean(data.pagination?.hasMore));
                  } catch (err) {
                    setBrowseError(err instanceof Error ? err.message : "Failed to load more agents");
                  } finally {
                    setBrowseLoading(false);
                  }
                }}
                className="w-full rounded-xl border border-white px-3 py-2 text-xs text-white hover:bg-white hover:text-black transition-colors"
              >
                {browseLoading ? "Loading..." : "Load more"}
              </button>
            )}
          </div>
          <div className="mt-5 rounded-xl border border-white bg-black p-3">
            <p className="text-xs uppercase tracking-[0.2em] text-white">Top Reliability</p>
            <div className="mt-2 space-y-2 text-sm text-white">
              {topLoading && <div>Loading top agents...</div>}
              {topError && <div className="text-white">{topError}</div>}
              {!topLoading && topAgents.length == 0 && !topError && <div>No ranked agents yet.</div>}
              {!topLoading &&
                topAgents.map((agent) => (
                  <button
                    key={`top-${agent.id}`}
                    type="button"
                    onClick={() => setSelectedAgent(agent)}
                    className="w-full text-left rounded-lg border border-white px-3 py-2 hover:bg-white hover:text-black transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm">{agent.name}</span>
                      <span className="text-[10px] uppercase tracking-[0.2em]">View</span>
                    </div>
                    <p className="text-xs">@{agent.slug}</p>
                  </button>
                ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white bg-black p-4 sm:p-5">
          {!selectedAgent && (
            <div className="flex flex-col items-center justify-center min-h-[420px] text-center gap-3">
              <div className="w-16 h-16 rounded-full border border-white flex items-center justify-center text-white text-xl">
                o
              </div>
              <p className="text-sm text-white max-w-sm">{EMPTY_STATE_MESSAGE}</p>
            </div>
          )}

          {selectedAgent && (
            <div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-white">{selectedAgent.name}</h3>
                  <p className="text-xs text-white/70">@{selectedAgent.slug}</p>
                </div>
                <span className="text-xs uppercase tracking-[0.2em] text-white">Live Metrics</span>
              </div>

              {metricsError && (
                <div className="mt-4 rounded-xl border border-white bg-black p-3 text-sm text-white">
                  {metricsError}
                </div>
              )}

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white bg-black p-3">
                  <p className="text-xs text-white uppercase tracking-[0.2em]">Success Rate</p>
                  <p className="text-2xl font-semibold text-white">
                    {metricsLoading ? "..." : formatPct(metrics?.success_rate)}
                  </p>
                </div>
                <div className="rounded-xl border border-white bg-black p-3">
                  <p className="text-xs text-white uppercase tracking-[0.2em]">Avg Latency</p>
                  <p className="text-2xl font-semibold text-white">
                    {metricsLoading ? "..." : formatInt(metrics?.avg_latency_ms, " ms")}
                  </p>
                </div>
                <div className="rounded-xl border border-white bg-black p-3">
                  <p className="text-xs text-white uppercase tracking-[0.2em]">Avg Cost</p>
                  <p className="text-2xl font-semibold text-white">
                    {metricsLoading ? "..." : formatNumber(metrics?.avg_cost_usd, " USD")}
                  </p>
                </div>
                <div className="rounded-xl border border-white bg-black p-3">
                  <p className="text-xs text-white uppercase tracking-[0.2em]">Hallucination</p>
                  <p className="text-2xl font-semibold text-white">
                    {metricsLoading ? "..." : formatPct(metrics?.hallucination_rate)}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white bg-black p-3">
                  <p className="text-xs text-white uppercase tracking-[0.2em]">Percentile Rank</p>
                  <p className="text-2xl font-semibold text-white">
                    {metricsLoading ? "..." : formatInt(metrics?.percentile_rank)}
                  </p>
                </div>
                <div className="rounded-xl border border-white bg-black p-3">
                  <p className="text-xs text-white uppercase tracking-[0.2em]">Hiring Score</p>
                  <p className="text-2xl font-semibold text-white">
                    {metricsLoading ? "..." : formatInt(metrics?.hiring_score)}
                  </p>
                </div>
                <div className="rounded-xl border border-white bg-black p-3">
                  <p className="text-xs text-white uppercase tracking-[0.2em]">P50 Latency</p>
                  <p className="text-2xl font-semibold text-white">
                    {metricsLoading ? "..." : formatInt(metrics?.p50_latency, " ms")}
                  </p>
                </div>
                <div className="rounded-xl border border-white bg-black p-3">
                  <p className="text-xs text-white uppercase tracking-[0.2em]">P95 Latency</p>
                  <p className="text-2xl font-semibold text-white">
                    {metricsLoading ? "..." : formatInt(metrics?.p95_latency, " ms")}
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-white bg-black p-3">
                <p className="text-xs text-white uppercase tracking-[0.2em]">Last 30 Day Trend</p>
                <div className="mt-2 flex flex-wrap gap-4 text-sm text-white">
                  <span>Success delta: {metricsLoading ? "..." : formatNumber(metrics?.last_30_day_trend?.success_rate_delta)}</span>
                  <span>Cost delta: {metricsLoading ? "..." : formatNumber(metrics?.last_30_day_trend?.cost_delta)}</span>
                </div>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <div className="rounded-xl border border-white bg-black p-3">
                  <p className="text-xs text-white uppercase tracking-[0.2em]">Top Failure Modes</p>
                  <div className="mt-2 space-y-2 text-sm text-white">
                    {metricsLoading && <div>Loading...</div>}
                    {!metricsLoading && topFailures.length == 0 && <div>No failures recorded.</div>}
                    {!metricsLoading &&
                      topFailures.map((failure) => (
                        <div key={failure.type} className="flex items-center justify-between">
                          <span>{failure.type}</span>
                          <span className="text-xs">{failure.frequency}</span>
                        </div>
                      ))}
                  </div>
                </div>
                <div className="rounded-xl border border-white bg-black p-3">
                  <p className="text-xs text-white uppercase tracking-[0.2em]">Suggestions</p>
                  <div className="mt-2 space-y-2 text-sm text-white">
                    {metricsLoading && <div>Loading...</div>}
                    {!metricsLoading && (!suggestions?.recommended_actions || suggestions.recommended_actions.length == 0) && (
                      <div>No suggestions yet.</div>
                    )}
                    {!metricsLoading &&
                      suggestions?.recommended_actions?.map((action) => (
                        <div key={action} className="flex gap-2">
                          <span>-</span>
                          <span>{action}</span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
