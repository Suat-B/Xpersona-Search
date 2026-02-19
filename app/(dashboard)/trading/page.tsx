"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StrategyCard } from "@/components/trading/StrategyCard";
import { StrategyCardSkeleton } from "@/components/trading/StrategyCardSkeleton";

interface MarketplaceStrategy {
  id: string;
  name: string;
  description: string | null;
  priceMonthlyCents: number;
  priceYearlyCents: number | null;
  platformFeePercent: number;
  developerName: string;
}

/**
 * Trading marketplace — browse and subscribe to strategies.
 */
export default function TradingPage() {
  const [strategies, setStrategies] = useState<MarketplaceStrategy[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/trading/strategies", { credentials: "include" })
      .then((r) => r.json())
      .then((res) => {
        if (res.success && Array.isArray(res.data)) setStrategies(res.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-[#30d158] animate-pulse" />
          <span className="text-xs font-medium text-[var(--dash-text-secondary)] uppercase tracking-wider">
            STRATEGY MARKETPLACE
          </span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-gradient-primary">
              Trading
            </h1>
            <p className="mt-2 text-sm text-[var(--dash-text-secondary)]">
              List strategies for free. Set your price. We take 20%. Browse and subscribe to strategies from developers.
            </p>
          </div>
          <Link
            href="/trading/developer"
            className="shrink-0 inline-flex items-center gap-2 rounded-full border border-[#30d158]/30 bg-[#30d158]/10 px-5 py-2.5 text-sm font-medium text-[#30d158] hover:bg-[#30d158]/20 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#30d158]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--dash-bg)]"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            Developer dashboard
          </Link>
        </div>
      </header>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <StrategyCardSkeleton key={i} />
          ))}
        </div>
      ) : strategies.length === 0 ? (
        <div className="agent-card p-8 border-[var(--dash-divider)]">
          <h2 className="font-semibold text-[var(--text-primary)] text-lg mb-2">No strategies yet</h2>
          <p className="text-sm text-[var(--dash-text-secondary)] max-w-md mb-6">
            Be the first to list a strategy. Complete developer onboarding and list one of your advanced strategies.
          </p>
          <Link
            href="/trading/developer"
            className="inline-flex items-center gap-2 rounded-full bg-[#30d158] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#30d158]/90 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#30d158]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--dash-bg)]"
          >
            List a strategy
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {strategies.map((s) => (
            <StrategyCard
              key={s.id}
              id={s.id}
              name={s.name}
              description={s.description}
              priceMonthlyCents={s.priceMonthlyCents}
              developerName={s.developerName}
            />
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4">
        <Link
          href="/trading/developer"
          className="group block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#30d158]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--dash-bg)]"
        >
          <div className="agent-card p-5 transition-all duration-300 group-hover:scale-[1.01] border-[var(--dash-divider)] hover:border-[#30d158]/30">
            <h3 className="font-semibold text-[var(--text-primary)] group-hover:text-[#30d158] transition-colors">
              List a strategy
            </h3>
            <p className="mt-2 text-sm text-[var(--dash-text-secondary)]">
              Create a developer account, list your strategy for free, set your price.
            </p>
          </div>
        </Link>
        <Link
          href="/dashboard/strategies"
          className="group block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0ea5e9]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--dash-bg)]"
        >
          <div className="agent-card p-5 transition-all duration-300 group-hover:scale-[1.01] border-[var(--dash-divider)] hover:border-[#0ea5e9]/30">
            <h3 className="font-semibold text-[var(--text-primary)] group-hover:text-[#0ea5e9] transition-colors">
              Your strategies
            </h3>
            <p className="mt-2 text-sm text-[var(--dash-text-secondary)]">
              Build and run strategies in the Casino. List them on the marketplace when ready.
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
