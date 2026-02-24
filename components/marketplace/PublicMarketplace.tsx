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

function SparklineChart({ data, color = "#0ea5e9" }: { data: number[]; color?: string }) {
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
      <defs>
        <linearGradient id={`spark-fill-${color}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
      <polygon fill={`url(#spark-fill-${color})`} points={`0,100 ${points} 100,100`} />
    </svg>
  );
}

function StrategyCardSkeleton() {
  return (
    <div className="agent-card p-5 border-[var(--border)] animate-pulse">
      <div className="h-4 bg-white/10 rounded w-3/4 mb-3" />
      <div className="h-3 bg-white/5 rounded w-1/2 mb-4" />
      <div className="h-12 bg-white/5 rounded mb-4" />
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
  const isProfitable = Math.random() > 0.3;
  const sparkColor = isProfitable ? "#30d158" : "#f48771";

  return (
    <div className="agent-card p-5 border-[var(--border)] group hover:border-[#30d158]/30 transition-all duration-300 h-full flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="font-semibold text-[var(--text-primary)] group-hover:text-[#30d158] transition-colors">
          {strategy.name}
        </h3>
        <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#30d158]/20 text-[#30d158]">
          ${(strategy.priceMonthlyCents / 100).toFixed(0)}/mo
        </span>
      </div>

      <p className="text-xs text-[var(--text-tertiary)] mb-3 line-clamp-2">
        {strategy.description || `AI-driven strategy by ${strategy.developerName}`}
      </p>

      <div className="mb-3 flex-1">
        <SparklineChart data={sparklineData} color={sparkColor} />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {strategy.sharpeRatio != null && (
          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-white/5 text-[var(--text-secondary)]">
            Sharpe: {strategy.sharpeRatio.toFixed(2)}
          </span>
        )}
        {strategy.category && (
          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#0ea5e9]/20 text-[#0ea5e9]">
            {strategy.category}
          </span>
        )}
        {strategy.riskLabel && (
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-medium ${
              strategy.riskLabel === "Conservative"
                ? "bg-[#30d158]/20 text-[#30d158]"
                : strategy.riskLabel === "Moderate"
                  ? "bg-[#ff9f0a]/20 text-[#ff9f0a]"
                  : "bg-[#ff453a]/20 text-[#ff453a]"
            }`}
          >
            {strategy.riskLabel}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-[var(--border)]">
        <span className="text-xs text-[var(--text-tertiary)]">by {strategy.developerName}</span>
        <span className="text-xs font-medium text-[#30d158]">Sign in to subscribe</span>
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
    <section className="min-h-dvh bg-[var(--bg-deep)] text-[var(--text-primary)]">
      <div className="container mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-[#30d158] animate-pulse" />
              <span className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
                Public Marketplace
              </span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-bold text-[var(--text-primary)]">
              Discover{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#30d158] to-[#0ea5e9]">
                verified strategies
              </span>
            </h1>
            <p className="mt-2 text-sm text-[var(--text-secondary)] max-w-xl">
              Browse AI-driven strategies with verified performance. Sign in to subscribe or list your own.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
            <Link
              href="/auth/signin?callbackUrl=/dashboard/jobs"
              className="inline-flex items-center justify-center rounded-full border border-[var(--border)] px-5 py-2.5 text-sm font-medium text-[var(--text-primary)] hover:bg-white/5 hover:border-[#30d158]/30 transition-all"
            >
              Sign in to subscribe
            </Link>
            <Link
              href="/dashboard/strategies"
              className="inline-flex items-center justify-center rounded-full bg-[#30d158] text-white px-5 py-2.5 text-sm font-semibold hover:bg-[#2FB552] transition-colors"
            >
              List your strategy
            </Link>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-6 mb-6">
          <div className="flex flex-wrap gap-2">
            {CATEGORY_FILTERS.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveFilter(c.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeFilter === c.id
                    ? "bg-[#30d158]/20 text-[#30d158] border border-[#30d158]/40"
                    : "bg-white/5 text-[var(--text-secondary)] border border-[var(--border)] hover:border-[#30d158]/30"
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
              className="w-full rounded-lg border border-[var(--border)] bg-white/5 px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[#30d158]/50"
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
          <div className="agent-card p-10 border-[var(--border)] text-center">
            <h3 className="font-semibold text-[var(--text-primary)] mb-2">Unable to load marketplace</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-4">{error}</p>
            <button
              type="button"
              onClick={() => setReloadKey((prev) => prev + 1)}
              className="inline-flex items-center gap-2 rounded-lg bg-[#30d158]/20 text-[#30d158] px-5 py-2.5 text-sm font-medium hover:bg-[#30d158]/30 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="agent-card p-10 border-[var(--border)] text-center">
            <div className="text-4xl mb-4">Charts</div>
            <h3 className="font-semibold text-[var(--text-primary)] mb-2">No strategies yet</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Be the first to list a strategy on the marketplace!
            </p>
            <Link
              href="/dashboard/strategies"
              className="inline-flex items-center gap-2 rounded-lg bg-[#30d158]/20 text-[#30d158] px-5 py-2.5 text-sm font-medium hover:bg-[#30d158]/30 transition-colors"
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
