"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { StrategyCard } from "@/components/trading/StrategyCard";
import { StrategyCardSkeleton } from "@/components/trading/StrategyCardSkeleton";
import { RiskReturnScatter } from "@/components/trading/RiskReturnScatter";
import { cn } from "@/lib/utils";

interface MarketplaceStrategy {
  id: string;
  name: string;
  description: string | null;
  priceMonthlyCents: number;
  priceYearlyCents: number | null;
  platformFeePercent: number;
  developerName: string;
  sharpeRatio?: number | null;
  riskLabel?: string | null;
  category?: string | null;
  timeframe?: string | null;
  liveTrackRecordDays?: number | null;
  paperTradingDays?: number | null;
  healthScore?: number;
  healthLabel?: "healthy" | "moderate" | "struggling";
  maxDrawdownPercent?: number | null;
}

const TABS = ["browse", "featured", "map", "developers"] as const;
type TabId = (typeof TABS)[number];

const CATEGORIES = [
  { id: "crypto", label: "Crypto" },
  { id: "forex", label: "Forex" },
  { id: "stocks", label: "Stocks" },
  { id: "futures", label: "Futures" },
] as const;

const TIMEFRAMES = [
  { id: "scalping", label: "Scalping" },
  { id: "day", label: "Day" },
  { id: "swing", label: "Swing" },
] as const;

const RISKS = [
  { id: "conservative", label: "Conservative" },
  { id: "moderate", label: "Moderate" },
  { id: "aggressive", label: "Aggressive" },
] as const;

const SORT_OPTIONS = [
  { id: "newest", label: "Newest" },
  { id: "sharpe", label: "Top Sharpe" },
  { id: "price_asc", label: "Price ↑" },
  { id: "price_desc", label: "Price ↓" },
] as const;

const QUICK_ACTIONS = [
  {
    href: "/trading/developer",
    label: "Developer dashboard",
    desc: "List strategies, set prices, track earnings",
    icon: "📊",
    color: "hover:border-[#30d158]/40 hover:text-[#30d158]",
    bg: "group-hover:bg-[#30d158]/5",
  },
  {
    href: "/dashboard/strategies",
    label: "Your strategies",
    desc: "Build & run in the Game, then list here",
    icon: "🎯",
    color: "hover:border-[#0ea5e9]/40 hover:text-[#0ea5e9]",
    bg: "group-hover:bg-[#0ea5e9]/5",
  },
  {
    href: "/games/tournament",
    label: "AI Tournament",
    desc: "Watch AI agents battle, clone the winner",
    icon: "🏆",
    color: "hover:border-[#bf5af2]/40 hover:text-[#bf5af2]",
    bg: "group-hover:bg-[#bf5af2]/5",
  },
  {
    href: "/dashboard/settings",
    label: "Signal preferences",
    desc: "Discord webhook, email, custom delivery",
    icon: "🔔",
    color: "hover:border-[#ff9f0a]/40 hover:text-[#ff9f0a]",
    bg: "group-hover:bg-[#ff9f0a]/5",
  },
  {
    href: "/trading/developer/list",
    label: "List a strategy",
    desc: "Onboard, then list from your strategies",
    icon: "➕",
    color: "hover:border-[#30d158]/40 hover:text-[#30d158]",
    bg: "group-hover:bg-[#30d158]/5",
  },
];

/**
 * Trading marketplace — browse, filter, and subscribe to strategies.
 * Rich, tactile, explorable design.
 */
export default function TradingPage() {
  const [strategies, setStrategies] = useState<MarketplaceStrategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>("browse");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [category, setCategory] = useState<string>("");
  const [timeframe, setTimeframe] = useState<string>("");
  const [risk, setRisk] = useState<string>("");
  const [sort, setSort] = useState<string>("newest");

  const fetchStrategies = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (category) params.set("category", category);
    if (timeframe) params.set("timeframe", timeframe);
    if (risk) params.set("risk", risk);
    params.set("sort", sort);
    fetch(`/api/trading/strategies?${params.toString()}`, { credentials: "include" })
      .then((r) => r.json())
      .then((res) => {
        if (res.success && Array.isArray(res.data)) setStrategies(res.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [search, category, timeframe, risk, sort]);

  useEffect(() => {
    fetchStrategies();
  }, [fetchStrategies]);

  const handleSearch = () => {
    setSearch(searchInput);
  };

  const applyFilter = (key: "category" | "timeframe" | "risk", value: string) => {
    if (key === "category") setCategory((c) => (c === value ? "" : value));
    if (key === "timeframe") setTimeframe((t) => (t === value ? "" : value));
    if (key === "risk") setRisk((r) => (r === value ? "" : value));
  };

  const featuredStrategies = strategies
    .filter((s) => s.sharpeRatio != null && s.sharpeRatio >= 1)
    .sort((a, b) => (b.sharpeRatio ?? 0) - (a.sharpeRatio ?? 0))
    .slice(0, 12);

  const spotlightPool = strategies
    .filter((s) => s.sharpeRatio != null && s.sharpeRatio >= 1)
    .sort((a, b) => (b.sharpeRatio ?? 0) - (a.sharpeRatio ?? 0))
    .slice(0, 5);
  const spotlightId =
    spotlightPool.length > 0
      ? spotlightPool[Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000)) % spotlightPool.length]?.id ?? null
      : null;

  const displayStrategies = tab === "featured" ? featuredStrategies : strategies;
  const showMap = tab === "map";

  const hasActiveFilters = category || timeframe || risk || search || sort !== "newest";

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative rounded-2xl overflow-hidden border border-[var(--dash-divider)] mb-8">
        <div className="absolute inset-0 bg-gradient-to-br from-[#30d158]/10 via-transparent to-[#0ea5e9]/5" />
        <div className="relative p-8 sm:p-10">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-[#30d158] animate-pulse" />
                <span className="text-xs font-medium text-[var(--dash-text-secondary)] uppercase tracking-wider">
                  Strategy Marketplace
                </span>
              </div>
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-[var(--text-primary)]">
                Discover & subscribe to{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#30d158] to-[#0ea5e9]">
                  AI-driven strategies
                </span>
              </h1>
              <p className="mt-4 text-base text-[var(--dash-text-secondary)] max-w-xl leading-relaxed">
                List your strategies for free. Set your price. We take 20%. Browse performance metrics, filter by risk and timeframe, and clone winners from AI tournaments.
              </p>
            </div>
            <Link
              href="/trading/developer"
              className="shrink-0 inline-flex items-center gap-2 rounded-xl border-2 border-[#30d158]/50 bg-[#30d158]/15 px-6 py-3 text-sm font-semibold text-[#30d158] hover:bg-[#30d158]/25 hover:border-[#30d158] transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#30d158]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--dash-bg)] active:scale-[0.98]"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              Developer dashboard
            </Link>
          </div>
        </div>
      </section>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 active:scale-[0.98]",
              tab === t
                ? "bg-[#30d158]/20 text-[#30d158] border border-[#30d158]/40"
                : "bg-[var(--dash-btn-bg)] text-[var(--dash-text-secondary)] border border-[var(--dash-divider)] hover:border-[#30d158]/30 hover:text-[var(--text-primary)]"
            )}
          >
            {t === "browse" && "Browse all"}
            {t === "featured" && "Top Sharpe"}
            {t === "map" && "Risk map"}
            {t === "developers" && "For developers"}
          </button>
        ))}
      </div>

      {/* Risk map tab */}
      {showMap && (
        <div className="mb-8">
          <RiskReturnScatter strategies={strategies} width={600} height={360} />
          <p className="mt-4 text-xs text-[var(--dash-text-secondary)]">
            Strategies with both Sharpe ratio and max drawdown appear on the map. Ideal quadrant: upper left (low risk, high return).
          </p>
        </div>
      )}

      {/* Browse / Featured: search, filters, grid */}
      {(tab === "browse" || tab === "featured") && (
        <>
          {/* Search & sort bar */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex flex-1 gap-2">
              <input
                type="text"
                placeholder="Search strategies..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="flex-1 min-w-0 rounded-xl border border-[var(--dash-divider)] bg-[var(--dash-bg)] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--dash-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[#30d158]/40 focus:border-[#30d158]/50"
              />
              <button
                onClick={handleSearch}
                className="px-5 py-2.5 rounded-xl bg-[#30d158]/20 text-[#30d158] font-medium text-sm hover:bg-[#30d158]/30 transition-colors active:scale-[0.98]"
              >
                Search
              </button>
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="rounded-xl border border-[var(--dash-divider)] bg-[var(--dash-bg)] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#30d158]/40"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Filter chips */}
          <div className="flex flex-wrap gap-2 mb-6">
            <span className="text-xs font-medium text-[var(--dash-text-secondary)] uppercase tracking-wider self-center mr-2">
              Filters:
            </span>
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => applyFilter("category", c.id)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 active:scale-[0.97]",
                  category === c.id
                    ? "bg-[#30d158]/25 text-[#30d158] border border-[#30d158]/40"
                    : "bg-[var(--dash-btn-bg)] text-[var(--dash-text-secondary)] border border-[var(--dash-divider)] hover:border-[#30d158]/30"
                )}
              >
                {c.label}
              </button>
            ))}
            <span className="w-px h-5 bg-[var(--dash-divider)] mx-1" />
            {TIMEFRAMES.map((t) => (
              <button
                key={t.id}
                onClick={() => applyFilter("timeframe", t.id)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 active:scale-[0.97]",
                  timeframe === t.id
                    ? "bg-[#30d158]/25 text-[#30d158] border border-[#30d158]/40"
                    : "bg-[var(--dash-btn-bg)] text-[var(--dash-text-secondary)] border border-[var(--dash-divider)] hover:border-[#30d158]/30"
                )}
              >
                {t.label}
              </button>
            ))}
            <span className="w-px h-5 bg-[var(--dash-divider)] mx-1" />
            {RISKS.map((r) => (
              <button
                key={r.id}
                onClick={() => applyFilter("risk", r.id)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 active:scale-[0.97]",
                  risk === r.id
                    ? "bg-[#30d158]/25 text-[#30d158] border border-[#30d158]/40"
                    : "bg-[var(--dash-btn-bg)] text-[var(--dash-text-secondary)] border border-[var(--dash-divider)] hover:border-[#30d158]/30"
                )}
              >
                {r.label}
              </button>
            ))}
            {hasActiveFilters && (
              <button
                onClick={() => {
                  setSearch("");
                  setSearchInput("");
                  setCategory("");
                  setTimeframe("");
                  setRisk("");
                  setSort("newest");
                }}
                className="ml-2 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--dash-text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--dash-divider)] transition-colors"
              >
                Clear all
              </button>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <StrategyCardSkeleton key={i} />
              ))}
            </div>
          ) : displayStrategies.length === 0 ? (
            <div className="agent-card p-10 border-[var(--dash-divider)] rounded-xl text-center">
              <p className="text-4xl mb-4">🔍</p>
              <h2 className="font-semibold text-[var(--text-primary)] text-lg mb-2">
                {tab === "featured" ? "No high-Sharpe strategies yet" : "No strategies match"}
              </h2>
              <p className="text-sm text-[var(--dash-text-secondary)] max-w-md mx-auto mb-6">
                {tab === "featured"
                  ? "Strategies with Sharpe ≥ 1 will appear here. Browse all to discover what&apos;s available."
                  : "Try clearing filters or browse the full marketplace."}
              </p>
              <button
                onClick={() => {
                  setSearch("");
                  setSearchInput("");
                  setCategory("");
                  setTimeframe("");
                  setRisk("");
                  setSort("newest");
                  if (tab === "featured") setTab("browse");
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-[#30d158]/20 text-[#30d158] px-5 py-2.5 text-sm font-medium hover:bg-[#30d158]/30 transition-colors"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {displayStrategies.map((s) => (
                <StrategyCard
                  key={s.id}
                  id={s.id}
                  name={s.name}
                  description={s.description}
                  priceMonthlyCents={s.priceMonthlyCents}
                  developerName={s.developerName}
                  sharpeRatio={s.sharpeRatio}
                  riskLabel={s.riskLabel}
                  category={s.category}
                  timeframe={s.timeframe}
                  liveTrackRecordDays={s.liveTrackRecordDays}
                  healthScore={s.healthScore}
                  healthLabel={s.healthLabel}
                  isSpotlight={spotlightId === s.id}
                />
              ))}
            </div>
          )}

          {tab === "browse" && strategies.length > 0 && (
            <p className="mt-6 text-xs text-[var(--dash-text-secondary)]">
              Showing {strategies.length} strateg{strategies.length === 1 ? "y" : "ies"}.
            </p>
          )}
        </>
      )}

      {/* For developers: quick action grid */}
      {tab === "developers" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {QUICK_ACTIONS.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className={cn(
                "group block rounded-xl border border-[var(--dash-divider)] p-5 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#30d158]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--dash-bg)]",
                a.color,
                a.bg
              )}
            >
              <span className="text-2xl mb-3 block">{a.icon}</span>
              <h3 className="font-semibold text-[var(--text-primary)] transition-colors">{a.label}</h3>
              <p className="mt-1.5 text-sm text-[var(--dash-text-secondary)]">{a.desc}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--dash-text-secondary)] group-hover:text-inherit transition-colors">
                Open
                <svg className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* Quick actions strip (always visible, below main content) */}
      <section className="mt-12 pt-8 border-t border-[var(--dash-divider)]">
        <h2 className="text-sm font-semibold text-[var(--dash-text-secondary)] uppercase tracking-wider mb-4">
          Quick links
        </h2>
        <div className="flex flex-wrap gap-3">
          {QUICK_ACTIONS.slice(0, 4).map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium border border-[var(--dash-divider)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-200",
                a.color
              )}
            >
              {a.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
