"use client";

import { useEffect, useState } from "react";

type TierStats = {
  tier: "budget" | "standard" | "premium";
  count: number;
  success_p50: number;
  success_p90: number;
  cost_p50: number;
  cost_p90: number;
  latency_p50: number;
  latency_p90: number;
};

type ClusterStats = {
  id: string;
  label: string;
  tiers: TierStats[];
};

type GraphResponse = {
  clusters: ClusterStats[];
  sample_size: number;
};

function formatPct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatUsd(value: number) {
  return `$${value.toFixed(3)}`;
}

export function GlobalPerformanceGraph() {
  const [data, setData] = useState<GraphResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/reliability/graph", { cache: "no-store" });
        if (!res.ok) throw new Error(`Graph failed (${res.status})`);
        const json = (await res.json()) as GraphResponse;
        if (!active) return;
        setData(json);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load graph");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="mt-10 rounded-3xl border border-white/[0.08] bg-black/35 p-6 sm:p-8 shadow-[0_30px_60px_rgba(0,0,0,0.45)]">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-tertiary)]">Global Graph</p>
          <h2 className="text-2xl sm:text-3xl font-semibold text-[var(--text-primary)]">
            Global Performance Graph
          </h2>
          <p className="text-sm text-[var(--text-secondary)] max-w-2xl">
            Percentile summaries across capability clusters and price tiers, derived from live agent telemetry.
          </p>
        </div>
        {data && (
          <div className="text-xs text-[var(--text-tertiary)]">
            Sample size: {data.sample_size}
          </div>
        )}
      </div>

      {loading && (
        <div className="mt-6 text-sm text-[var(--text-tertiary)]">Loading graph...</div>
      )}
      {error && (
        <div className="mt-6 rounded-xl border border-rose-400/40 bg-rose-500/10 p-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      {data && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {data.clusters.map((cluster) => (
            <div key={cluster.id} className="rounded-2xl border border-white/[0.08] bg-black/30 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-[var(--text-primary)]">{cluster.label}</p>
                <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
                  {cluster.id}
                </span>
              </div>
              <div className="mt-3 space-y-3">
                {cluster.tiers.map((tier) => (
                  <div
                    key={`${cluster.id}-${tier.tier}`}
                    className="rounded-xl border border-white/[0.08] bg-black/40 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
                        {tier.tier}
                      </span>
                      <span className="text-xs text-[var(--text-tertiary)]">{tier.count} agents</span>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2 text-xs text-[var(--text-secondary)]">
                      <span>Success p50: {formatPct(tier.success_p50)}</span>
                      <span>Success p90: {formatPct(tier.success_p90)}</span>
                      <span>Cost p50: {formatUsd(tier.cost_p50)}</span>
                      <span>Cost p90: {formatUsd(tier.cost_p90)}</span>
                      <span>Latency p50: {Math.round(tier.latency_p50)} ms</span>
                      <span>Latency p90: {Math.round(tier.latency_p90)} ms</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
