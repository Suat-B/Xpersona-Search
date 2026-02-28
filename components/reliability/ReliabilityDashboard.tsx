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
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 sm:p-8 backdrop-blur-sm">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[var(--accent-heart)]">Live Reliability</p>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mt-1">Agent Reliability Dashboard</h2>
          <p className="text-sm text-[var(--text-secondary)] max-w-2xl mt-2 leading-relaxed">
            Browse agents to load real-time metrics, failure modes, and self-optimization suggestions.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedAgent && (
            <>
              <button
                type="button"
                onClick={() => setMetricsReloadKey((v) => v + 1)}
                className="px-4 py-2 rounded-full border border-[var(--border)] text-xs font-bold text-white hover:bg-white hover:text-black transition-all active:scale-95 bg-white/5"
              >
                Refresh metrics
              </button>
              <button
                type="button"
                onClick={() => setSelectedAgent(null)}
                className="px-4 py-2 rounded-full border border-[var(--border)] text-xs font-bold text-white hover:bg-white hover:text-black transition-all active:scale-95 bg-white/5"
              >
                Clear selection
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="rounded-2xl border border-[var(--border)] bg-black/40 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-[0.22em]">Browse Agents</h3>
            <span className="text-xs text-[var(--text-tertiary)]">{filteredAgents.length} shown</span>
          </div>
          <div className="mb-4">
            <input
              type="search"
              placeholder="Filter agents by name or slug..."
              value={browseFilter}
              onChange={(e) => setBrowseFilter(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-black/60 px-4 py-3 text-xs text-white placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-heart)]/50 focus:border-[var(--accent-heart)]/50 transition-all"
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
                  className={`w-full text-left rounded-2xl border p-4 transition-all duration-300 ${isActive
                      ? "border-[var(--accent-heart)] bg-[var(--accent-heart)]/10 text-white shadow-lg shadow-[var(--accent-heart)]/5"
                      : "border-[var(--border)] text-white hover:bg-white/5 hover:border-white/20"
                    }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className={`text-sm font-bold ${isActive ? "text-[var(--accent-heart)]" : "text-white"}`}>
                        {agent.name}
                      </p>
                      <p className={`text-xs ${isActive ? "text-white/60" : "text-[var(--text-tertiary)]"}`}>@{agent.slug}</p>
                    </div>
                    <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${isActive ? "border-[var(--accent-heart)]/50 text-[var(--accent-heart)] bg-[var(--accent-heart)]/10" : "border-[var(--border)] text-[var(--text-tertiary)]"}`}>
                      {isActive ? "ACTIVE" : "SELECT"}
                    </span>
                  </div>
                  {agent.description && (
                    <p className={`mt-3 text-xs leading-relaxed ${isActive ? "text-white/80" : "text-[var(--text-secondary)]"} line-clamp-2`}>
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
                className="w-full rounded-2xl border border-[var(--border)] px-4 py-3 text-xs font-bold text-white hover:bg-white/5 transition-all"
              >
                {browseLoading ? "Loading..." : "Load more agents"}
              </button>
            )}
          </div>
          <div className="mt-8 rounded-2xl border border-[var(--border)] bg-black/40 p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--accent-heart)] mb-4">Top Reliability Ranking</p>
            <div className="space-y-3 text-sm text-white">
              {topLoading && <div>Loading top agents...</div>}
              {topError && <div className="text-white">{topError}</div>}
              {!topLoading && topAgents.length == 0 && !topError && <div>No ranked agents yet.</div>}
              {!topLoading &&
                topAgents.map((agent) => (
                  <button
                    key={`top-${agent.id}`}
                    type="button"
                    onClick={() => setSelectedAgent(agent)}
                    className="w-full text-left rounded-xl border border-[var(--border)] p-4 hover:bg-white/5 hover:border-white/20 transition-all group"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold group-hover:text-[var(--accent-heart)] transition-colors">{agent.name}</span>
                      <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">RANKED</span>
                    </div>
                    <p className="text-xs text-[var(--text-tertiary)] mt-1">@{agent.slug}</p>
                  </button>
                ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-black/40 p-5 min-h-[500px]">
          {!selectedAgent && (
            <div className="flex flex-col items-center justify-center min-h-[460px] text-center gap-6">
              <div className="w-20 h-20 rounded-full border-2 border-dashed border-[var(--border)] flex items-center justify-center text-[var(--accent-heart)] text-3xl animate-[pulse_3s_infinite]">
                📡
              </div>
              <p className="text-base text-[var(--text-secondary)] font-medium max-w-[280px] leading-relaxed">{EMPTY_STATE_MESSAGE}</p>
            </div>
          )}

          {selectedAgent && (
            <div>
              <div className="flex items-center justify-between gap-4 border-b border-[var(--divider)] pb-6 mb-8">
                <div>
                  <h3 className="text-2xl font-bold text-white tracking-tight">{selectedAgent.name}</h3>
                  <p className="text-sm text-[var(--accent-heart)] font-mono">@{selectedAgent.slug}</p>
                </div>
                <div className="bg-[var(--accent-heart)]/10 border border-[var(--accent-heart)]/20 px-3 py-1 rounded-full">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--accent-heart)]">Live Telemetry</span>
                </div>
              </div>

              {metricsError && (
                <div className="mt-4 rounded-xl border border-[var(--accent-danger)]/30 bg-[var(--accent-danger)]/5 p-4 text-sm text-[var(--accent-danger)]">
                  {metricsError}
                </div>
              )}

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-[var(--border)] bg-white/5 p-5 hover:border-[var(--accent-heart)]/20 transition-colors">
                  <p className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-[0.2em] mb-1">Success Rate</p>
                  <p className="text-3xl font-bold text-white tracking-tighter">
                    {metricsLoading ? "..." : formatPct(metrics?.success_rate)}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-white/5 p-5 hover:border-[var(--accent-heart)]/20 transition-colors">
                  <p className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-[0.2em] mb-1">Avg Latency</p>
                  <p className="text-3xl font-bold text-white tracking-tighter">
                    {metricsLoading ? "..." : formatInt(metrics?.avg_latency_ms, " ms")}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-white/5 p-5 hover:border-[var(--accent-heart)]/20 transition-colors">
                  <p className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-[0.2em] mb-1">Avg Cost</p>
                  <p className="text-3xl font-bold text-white tracking-tighter">
                    {metricsLoading ? "..." : formatNumber(metrics?.avg_cost_usd, " USD")}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-white/5 p-5 hover:border-[var(--accent-heart)]/20 transition-colors">
                  <p className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-[0.2em] mb-1">Hallucination</p>
                  <p className="text-3xl font-bold text-white tracking-tighter text-[var(--accent-danger)]">
                    {metricsLoading ? "..." : formatPct(metrics?.hallucination_rate)}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-[var(--border)] bg-white/5 p-5 hover:border-[var(--accent-heart)]/20 transition-colors">
                  <p className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-[0.2em] mb-1">Percentile Rank</p>
                  <p className="text-2xl font-bold text-white">
                    {metricsLoading ? "..." : formatInt(metrics?.percentile_rank)}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-white/5 p-5 hover:border-[var(--accent-heart)]/20 transition-colors">
                  <p className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-[0.2em] mb-1">Hiring Score</p>
                  <p className="text-2xl font-bold text-[var(--accent-success)]">
                    {metricsLoading ? "..." : formatInt(metrics?.hiring_score)}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-white/5 p-5 hover:border-[var(--accent-heart)]/20 transition-colors">
                  <p className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-[0.2em] mb-1">P50 Latency</p>
                  <p className="text-2xl font-bold text-white">
                    {metricsLoading ? "..." : formatInt(metrics?.p50_latency, " ms")}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-white/5 p-5 hover:border-[var(--accent-heart)]/20 transition-colors">
                  <p className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-[0.2em] mb-1">P95 Latency</p>
                  <p className="text-2xl font-bold text-white">
                    {metricsLoading ? "..." : formatInt(metrics?.p95_latency, " ms")}
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-[var(--border)] bg-white/5 p-5">
                <p className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-[0.2em] mb-4">Last 30 Day Trend Performance</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-1">Success Delta</span>
                    <span className={`text-lg font-bold ${metrics?.last_30_day_trend?.success_rate_delta && metrics.last_30_day_trend.success_rate_delta > 0 ? 'text-[var(--accent-success)]' : 'text-white'}`}>
                      {metricsLoading ? "..." : (metrics?.last_30_day_trend?.success_rate_delta ? `+${metrics.last_30_day_trend.success_rate_delta}%` : "0%")}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-1">Cost Delta</span>
                    <span className={`text-lg font-bold ${metrics?.last_30_day_trend?.cost_delta && metrics.last_30_day_trend.cost_delta < 0 ? 'text-[var(--accent-success)]' : 'text-white'}`}>
                      {metricsLoading ? "..." : (metrics?.last_30_day_trend?.cost_delta ? `${metrics.last_30_day_trend.cost_delta}%` : "0%")}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-[var(--border)] bg-black/20 p-5">
                  <p className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-[0.2em] mb-4">Top Failure Modes</p>
                  <div className="space-y-3 text-sm text-white">
                    {metricsLoading && <div>Loading...</div>}
                    {!metricsLoading && topFailures.length == 0 && <div className="text-[var(--text-tertiary)] italic">No failures recorded.</div>}
                    {!metricsLoading &&
                      topFailures.map((failure) => (
                        <div key={failure.type} className="flex items-center justify-between p-2 rounded-lg bg-white/5">
                          <span className="font-medium">{failure.type}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--accent-danger)]/10 text-[var(--accent-danger)]">{failure.frequency} hits</span>
                        </div>
                      ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-black/20 p-5">
                  <p className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-[0.2em] mb-4">Self-Optimization Suggestions</p>
                  <div className="space-y-3 text-sm text-white">
                    {metricsLoading && <div>Loading...</div>}
                    {!metricsLoading && (!suggestions?.recommended_actions || suggestions.recommended_actions.length == 0) && (
                      <div className="text-[var(--text-tertiary)] italic">No suggestions yet.</div>
                    )}
                    {!metricsLoading &&
                      suggestions?.recommended_actions?.map((action) => (
                        <div key={action} className="flex gap-3 p-3 rounded-lg bg-[var(--accent-heart)]/5 border border-[var(--accent-heart)]/20 animate-in fade-in slide-in-from-right-2">
                          <span className="text-[var(--accent-heart)] font-bold">→</span>
                          <span className="text-[var(--text-secondary)]">{action}</span>
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
