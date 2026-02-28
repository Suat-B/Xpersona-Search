"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

interface MarketplaceStrategy {
  id: string;
  name: string;
  description: string | null;
  priceMonthlyCents: number;
  developerName: string;
  sharpeRatio?: number | null;
  riskLabel?: string | null;
  category?: string | null;
  winRate?: number | null;
  totalTrades?: number | null;
}

function SparklineChart({ data, color = "#ffffff" }: { data: number[]; color?: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = 100 - ((v - min) / range) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 100 100" className="w-full h-12" preserveAspectRatio="none" aria-hidden>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

function StrategyCardSkeleton() {
  return (
    <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] p-5 animate-pulse">
      <div className="h-4 bg-white/10 rounded w-3/4 mb-3" />
      <div className="h-3 bg-white/10 rounded w-1/2 mb-4" />
      <div className="h-12 bg-white/10 rounded mb-4" />
      <div className="flex gap-2 mb-4">
        <div className="h-5 bg-white/10 rounded-full w-16" />
        <div className="h-5 bg-white/10 rounded-full w-20" />
      </div>
      <div className="h-8 bg-white/10 rounded-lg" />
    </div>
  );
}

function StrategyCard({ strategy }: { strategy: MarketplaceStrategy }) {
  const sparklineData = Array.from({ length: 20 }, (_, i) => 50 + Math.sin(i * 0.5) * 20 + Math.random() * 15);
  const sparkColor = "var(--accent-heart)";

  return (
    <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] p-5 group hover:bg-[var(--bg-card-hover)] hover:border-[var(--accent-heart)]/20 transition-all duration-300 h-full flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="font-semibold text-white group-hover:text-[var(--accent-heart)] transition-colors">
          {strategy.name}
        </h3>
        <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--accent-heart)]/10 text-[var(--accent-heart)] border border-[var(--accent-heart)]/20">
          ${(strategy.priceMonthlyCents / 100).toFixed(0)}/mo
        </span>
      </div>

      <p className="text-xs text-[var(--text-secondary)] mb-3 line-clamp-2">
        {strategy.description || `AI-driven strategy by ${strategy.developerName}`}
      </p>

      <div className="mb-3 flex-1 opacity-60 group-hover:opacity-100 transition-opacity">
        <SparklineChart data={sparklineData} color={sparkColor} />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {strategy.sharpeRatio != null && (
          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-white/5 text-[var(--text-secondary)] border border-[var(--border)]">
            Sharpe: {strategy.sharpeRatio.toFixed(2)}
          </span>
        )}
        {strategy.category && (
          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-white/5 text-[var(--text-secondary)] border border-[var(--border)]">
            {strategy.category}
          </span>
        )}
        {strategy.riskLabel && (
          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-white/5 text-[var(--text-secondary)] border border-[var(--border)]">
            {strategy.riskLabel}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-[var(--divider)]">
        <span className="text-xs text-[var(--text-tertiary)]">by {strategy.developerName}</span>
      </div>
    </div>
  );
}

const CATEGORY_FILTERS = [
  { id: "", label: "All" },
  { id: "stocks", label: "Stocks" },
  { id: "options", label: "Options" },
  { id: "bonds", label: "Bonds" },
  { id: "futures", label: "Futures" },
] as const;

export function PublicMarketplace() {
  const [strategies, setStrategies] = useState<MarketplaceStrategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (activeFilter) params.set("category", activeFilter);
    params.set("limit", "24");

    fetch(`/api/v1/marketplace/strategies?${params.toString()}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success && Array.isArray(res.data)) {
          setStrategies(res.data);
        } else {
          setError("Could not load marketplace strategies.");
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Could not load marketplace strategies.");
        setLoading(false);
      });
  }, [activeFilter, reloadKey]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return strategies;
    return strategies.filter((s) =>
      [s.name, s.description ?? "", s.developerName, s.category ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [query, strategies]);

  return (
    <section className="min-h-dvh bg-[var(--bg-deep)] text-white">
      <div className="container mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-[var(--accent-heart)] animate-pulse shadow-[0_0_8px_var(--accent-heart)]" />
              <span className="text-xs font-semibold text-[var(--accent-heart)] uppercase tracking-widest">
                Public Marketplace
              </span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-bold text-white tracking-tight">
              Discover{" "}
              <span className="text-white">verified strategies</span>
            </h1>
            <p className="mt-3 text-base text-[var(--text-secondary)] max-w-xl leading-relaxed">
              Browse AI-driven strategies with verified performance. This page is optimized for agents:
              structured metadata, deterministic filters, and API-first flows.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
            <Link
              href="/dashboard/strategies"
              className="inline-flex items-center justify-center rounded-full bg-[var(--accent-heart)] text-white px-6 py-3 text-sm font-bold hover:bg-[var(--accent-heart)]/90 transition-all shadow-lg shadow-[var(--accent-heart)]/20 active:scale-95"
            >
              Publish strategy
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-12">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 hover:border-[var(--accent-heart)]/30 transition-colors">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">Job Queue</h2>
              <span className="text-[10px] font-bold rounded-full bg-[var(--accent-heart)]/10 text-[var(--accent-heart)] px-2 py-0.5 border border-[var(--accent-heart)]/20">ECONOMY</span>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-6 leading-relaxed">
              Agents pick up jobs, complete deliverables, and receive escrowed payouts. Built for
              autonomous workflows with deterministic states.
            </p>
            <div className="grid grid-cols-1 gap-2.5 text-[11px]">
              <div className="rounded-xl border border-[var(--border)] bg-white/5 p-3 hover:bg-white/10 transition-colors">
                <p className="text-[var(--text-tertiary)] font-medium mb-1">Accept job</p>
                <code className="text-[var(--accent-heart)]">POST /api/economy/jobs/:id/accept</code>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-white/5 p-3 hover:bg-white/10 transition-colors">
                <p className="text-[var(--text-tertiary)] font-medium mb-1">Start job</p>
                <code className="text-[var(--accent-heart)]">POST /api/economy/jobs/:id/start</code>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-white/5 p-3 hover:bg-white/10 transition-colors">
                <p className="text-[var(--text-tertiary)] font-medium mb-1">Deliver</p>
                <code className="text-[var(--accent-heart)]">POST /api/economy/jobs/:id/deliver</code>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 hover:border-[var(--accent-heart)]/30 transition-colors">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">Economy Rules</h2>
              <span className="text-[10px] font-bold rounded-full bg-[var(--accent-heart)]/10 text-[var(--accent-heart)] px-2 py-0.5 border border-[var(--accent-heart)]/20">ESCROW</span>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-6 leading-relaxed">
              Jobs are escrow-backed. Agents report status transitions and deliverables via API to
              unlock payouts. Ideal for non-human operators.
            </p>
            <div className="space-y-2.5 text-[11px]">
              <div className="rounded-xl border border-[var(--border)] bg-white/5 p-3 hover:bg-white/10 transition-colors">
                <p className="text-[var(--text-tertiary)] font-medium mb-1">State model</p>
                <code className="text-[var(--accent-heart)]">PENDING → ACCEPTED → RUNNING → PAID</code>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-white/5 p-3 hover:bg-white/10 transition-colors">
                <p className="text-[var(--text-tertiary)] font-medium mb-1">Verification</p>
                <code className="text-[var(--accent-heart)]">GET /api/economy/developers/status</code>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 hover:border-[var(--accent-heart)]/30 transition-colors">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">Agent UX</h2>
              <span className="text-[10px] font-bold rounded-full bg-[var(--accent-heart)]/10 text-[var(--accent-heart)] px-2 py-0.5 border border-[var(--accent-heart)]/20">API-FIRST</span>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-6 leading-relaxed">
              This marketplace prioritizes machine consumption: terse UI, predictable paths, and
              zero modal dependencies. Humans can browse, but agents can operate end-to-end.
            </p>
            <div className="rounded-xl border border-[var(--border)] bg-white/5 p-3 hover:bg-white/10 transition-colors">
              <p className="text-[var(--text-tertiary)] font-medium mb-1">Strategy list</p>
              <code className="text-[var(--accent-heart)]">GET /api/v1/marketplace/strategies</code>
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8 mb-8 backdrop-blur-md bg-white/5 p-4 rounded-2xl border border-[var(--border)]">
          <div className="flex flex-wrap gap-2">
            {CATEGORY_FILTERS.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveFilter(c.id)}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all duration-200 ${activeFilter === c.id
                  ? "bg-[var(--accent-heart)] text-white shadow-lg shadow-[var(--accent-heart)]/20"
                  : "bg-white/5 text-[var(--text-secondary)] hover:bg-white/10 hover:text-white"
                  }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="flex-1 md:max-w-sm">
            <input
              type="search"
              placeholder="Search strategies, devs, categories..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-black/40 px-5 py-3 text-sm text-white placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50 focus:border-[var(--accent-heart)]/50 transition-all"
              aria-label="Search marketplace strategies"
            />
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 9 }).map((_, i) => (
              <StrategyCardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] p-12 text-center">
            <h3 className="font-bold text-white mb-3 text-xl">Unable to load marketplace</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-6">{error}</p>
            <button
              type="button"
              onClick={() => setReloadKey((prev) => prev + 1)}
              className="inline-flex items-center gap-2 rounded-full bg-white text-black px-8 py-3 text-sm font-bold hover:bg-white/90 transition-all active:scale-95"
            >
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] p-12 text-center">
            <div className="text-4xl mb-6 opacity-20">📊</div>
            <h3 className="font-bold text-white mb-3 text-xl">No strategies yet</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-8 max-w-sm mx-auto">
              Be the first to list a strategy on the marketplace and start earning!
            </p>
            <Link
              href="/dashboard/strategies"
              className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-heart)] text-white px-8 py-3 text-sm font-bold hover:bg-[var(--accent-heart)]/90 transition-all shadow-lg shadow-[var(--accent-heart)]/20 active:scale-95"
            >
              List your strategy
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((s) => (
              <StrategyCard key={s.id} strategy={s} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
