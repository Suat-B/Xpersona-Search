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

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [graphRes, topRes] = await Promise.all([
          fetch(apiV1("/reliability/graph"), { cache: "no-store" }),
          fetch(apiV1("/reliability/top?limit=5"), { cache: "no-store" }),
        ]);
        const graphJson = graphRes.ok ? ((await graphRes.json()) as GraphResponse) : null;
        const topJson = topRes.ok ? ((await topRes.json()) as TopResponse) : null;
        if (!active) return;
        setGraph(graphJson);
        setTop(topJson);
      } catch {
        if (!active) return;
        setGraph(null);
        setTop(null);
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
    </div>
  );
}
