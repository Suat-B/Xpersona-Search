"use client";

import { useEffect, useMemo, useState } from "react";
import { apiV1 } from "@/lib/api/url";

type GraphResponse = {
  clusters: { id: string; label: string; tiers: { tier: string; count: number }[] }[];
  sample_size: number;
};

type TopResponse = {
  results: {
    successRate: number | null;
    avgLatencyMs: number | null;
    avgCostUsd: number | null;
  }[];
  count: number;
};

type KpiResponse = {
  ok: boolean;
  timestamp: string;
  kpi: {
    searchRequests: { success: number; noResults: number; error: number; fallback: number; total: number };
    searchExecutionOutcomes: { success: number; failure: number; timeout: number; total: number };
    graphFallbacks: { recommend: number; plan: number; top: number; related: number; total: number };
    clickThroughRate: number | null;
    noResultRate: number | null;
    top404: Array<{ route: string; method: string; count: number }>;
  };
};

function formatNumber(value: number | null, suffix = "") {
  if (value == null || Number.isNaN(value)) return "--";
  return `${value}${suffix}`;
}

function formatPct(value: number | null) {
  if (value == null || Number.isNaN(value)) return "--";
  return `${(value * 100).toFixed(1)}%`;
}

export function AgentOpsStats() {
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [top, setTop] = useState<TopResponse | null>(null);
  const [kpi, setKpi] = useState<KpiResponse["kpi"] | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [graphRes, topRes] = await Promise.all([
          fetch(apiV1("/reliability/graph"), { cache: "no-store" }),
          fetch(apiV1("/reliability/top?limit=5"), { cache: "no-store" }),
        ]);
        const kpiRes = await fetch("/api/metrics/kpi", { cache: "no-store" });
        const graphJson = graphRes.ok ? ((await graphRes.json()) as GraphResponse) : null;
        const topJson = topRes.ok ? ((await topRes.json()) as TopResponse) : null;
        const kpiJson = kpiRes.ok ? ((await kpiRes.json()) as KpiResponse) : null;
        if (!active) return;
        setGraph(graphJson);
        setTop(topJson);
        setKpi(kpiJson?.kpi ?? null);
      } catch {
        if (!active) return;
        setGraph(null);
        setTop(null);
        setKpi(null);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  const aggregate = useMemo(() => {
    if (!top?.results?.length) {
      return { success: null, latency: null, cost: null };
    }
    const count = top.results.length;
    const success = top.results.reduce((acc, r) => acc + (r.successRate ?? 0), 0) / count;
    const latency = top.results.reduce((acc, r) => acc + (r.avgLatencyMs ?? 0), 0) / count;
    const cost = top.results.reduce((acc, r) => acc + (r.avgCostUsd ?? 0), 0) / count;
    return { success, latency, cost };
  }, [top]);

  return (
    <div className="mt-4 grid gap-3 lg:grid-cols-3">
      <div className="rounded-2xl border border-white bg-black p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-white">Ingest Contract</p>
        <p className="mt-2 text-sm text-white">
          Signed telemetry with idempotency. Rejects duplicates and replays.
        </p>
        <div className="mt-3 rounded-lg border border-white bg-black p-3 text-[11px] text-white">
          Required headers: idempotency-key, x-gpg-key-id, x-gpg-timestamp, x-gpg-signature
        </div>
        <div className="mt-3 text-[11px] text-white">
          Live sample: {formatNumber(graph?.sample_size ?? null)} runs
        </div>
      </div>

      <div className="rounded-2xl border border-white bg-black p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-white">Decision Loop</p>
        <p className="mt-2 text-sm text-white">
          Query reliability, select agent, execute, report outcome. Use trends to tune retries.
        </p>
        <div className="mt-3 rounded-lg border border-white bg-black p-3 text-[11px] text-white">
          Preferred cadence: 5-15 min refresh for hot tasks; daily for cold tasks.
        </div>
        <div className="mt-3 text-[11px] text-white">
          Active clusters: {formatNumber(graph?.clusters?.length ?? null)}
        </div>
      </div>

      <div className="rounded-2xl border border-white bg-black p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-white">Reliability Signals</p>
        <p className="mt-2 text-sm text-white">
          Prioritize success rate, calibration, and dispute rate. Penalize high variance.
        </p>
        <div className="mt-3 rounded-lg border border-white bg-black p-3 text-[11px] text-white">
          Deterministic filters: cluster, tier, and time window.
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-white">
          <span>Top-5 SR: {formatPct(aggregate.success)}</span>
          <span>Avg Lat: {formatNumber(aggregate.latency ? Math.round(aggregate.latency) : null, "ms")}</span>
          <span>Avg Cost: {aggregate.cost == null ? "--" : `$${aggregate.cost.toFixed(3)}`}</span>
        </div>
      </div>

      <div className="rounded-2xl border border-white bg-black p-4 lg:col-span-3">
        <p className="text-xs uppercase tracking-[0.2em] text-white">Search KPI Snapshot</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-4 text-xs text-white">
          <span>Requests: {kpi?.searchRequests.total ?? 0}</span>
          <span>CTR: {formatPct(kpi?.clickThroughRate ?? null)}</span>
          <span>No-result rate: {formatPct(kpi?.noResultRate ?? null)}</span>
          <span>Graph fallbacks: {kpi?.graphFallbacks.total ?? 0}</span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3 text-xs text-white">
          <span>Exec success: {kpi?.searchExecutionOutcomes.success ?? 0}</span>
          <span>Exec failure: {kpi?.searchExecutionOutcomes.failure ?? 0}</span>
          <span>Exec timeout: {kpi?.searchExecutionOutcomes.timeout ?? 0}</span>
        </div>
        <div className="mt-3 rounded-lg border border-white bg-black p-3">
          <p className="text-[11px] text-white/80 uppercase tracking-[0.16em]">Top 404 Endpoints</p>
          <div className="mt-2 space-y-1 text-[11px] text-white">
            {(kpi?.top404 ?? []).length === 0 && <div>No 404s recorded yet.</div>}
            {(kpi?.top404 ?? []).slice(0, 5).map((item) => (
              <div key={`${item.method}:${item.route}`} className="flex items-center justify-between gap-2">
                <span className="font-mono">{item.method} {item.route}</span>
                <span>{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
