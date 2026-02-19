"use client";

import { useMemo, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { StrategyDetailSkeleton } from "@/components/trading/StrategyDetailSkeleton";
import { TradingErrorBanner } from "@/components/trading/TradingErrorBanner";
import { CompactEquityChart } from "@/components/quant-terminal/CompactEquityChart";

interface StrategyDetail {
  id: string;
  name: string;
  description: string | null;
  priceMonthlyCents: number;
  priceYearlyCents: number | null;
  platformFeePercent: number;
  isActive: boolean;
  sharpeRatio?: number | null;
  maxDrawdownPercent?: number | null;
  winRate?: number | null;
  tradeCount?: number | null;
  paperTradingDays?: number | null;
  riskLabel?: string | null;
  liveTrackRecordDays?: number | null;
  developerName: string;
}

export default function StrategyDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [strategy, setStrategy] = useState<StrategyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/trading/strategies/${id}`, { credentials: "include" })
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) setStrategy(res.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  const handleSubscribe = async () => {
    setError(null);
    setSubscribing(true);
    try {
      const res = await fetch("/api/trading/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ strategyId: id }),
      });
      const data = await res.json();
      if (data.success && data.data?.url) {
        window.location.href = data.data.url;
        return;
      }
      setError(data.message ?? "Failed to start checkout");
    } catch {
      setError("Failed to start checkout");
    } finally {
      setSubscribing(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <Link href="/trading" className="text-sm text-[var(--dash-text-secondary)] hover:text-[var(--trading-primary)] transition-colors mb-2 inline-block focus:outline-none focus-visible:ring-2 focus-visible:ring-[#30d158]/50 focus-visible:ring-offset-2 rounded">
          ← Back to marketplace
        </Link>
        <StrategyDetailSkeleton />
      </div>
    );
  }

  if (!strategy) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Strategy not found</h1>
        <Link href="/trading" className="text-sm text-[#30d158] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#30d158]/50 focus-visible:ring-offset-2 rounded">
          Back to marketplace
        </Link>
      </div>
    );
  }

  const priceMonthly = (strategy.priceMonthlyCents / 100).toFixed(2);

  const chartData = useMemo(() => {
    const sharpe = strategy.sharpeRatio ?? 0;
    const winRate = (strategy.winRate ?? 50) / 100;
    const count = Math.min(Math.max((strategy.tradeCount ?? 30), 10), 60);
    if (count < 2) return [];
    const seed = strategy.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const seeded = (i: number) => Math.sin(seed * 0.1 + i * 0.7) * 0.5 + 0.5;
    const points: { time: number; value: number; pnl: number }[] = [];
    let value = 1000;
    let pnl = 0;
    for (let i = 0; i < count; i++) {
      const win = seeded(i) < winRate;
      const change = sharpe > 0 ? (win ? 15 + sharpe * 5 : -10 - sharpe * 2) : (win ? 10 : -12);
      pnl += change;
      value = Math.max(100, 1000 + pnl);
      points.push({ time: i, value, pnl });
    }
    return points;
  }, [strategy.id, strategy.sharpeRatio, strategy.winRate, strategy.tradeCount]);

  const hasMetrics =
    strategy.sharpeRatio != null ||
    strategy.maxDrawdownPercent != null ||
    strategy.winRate != null ||
    strategy.paperTradingDays != null;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {error && (
        <TradingErrorBanner message={error} onDismiss={() => setError(null)} />
      )}
      <header>
        <Link href="/trading" className="text-sm text-[var(--dash-text-secondary)] hover:text-[#30d158] transition-colors mb-2 inline-block focus:outline-none focus-visible:ring-2 focus-visible:ring-[#30d158]/50 focus-visible:ring-offset-2 rounded">
          ← Back to marketplace
        </Link>
        <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--text-primary)]">
          {strategy.name}
        </h1>
        <p className="text-sm text-[var(--dash-text-secondary)]">
          by {strategy.developerName}
        </p>
      </header>

      <div className="agent-card p-6 border-[var(--dash-divider)]">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {(strategy.riskLabel ?? "").length > 0 && (
            <span
              className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                strategy.riskLabel === "conservative"
                  ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                  : strategy.riskLabel === "moderate"
                    ? "bg-amber-500/20 border-amber-500/40 text-amber-400"
                    : "bg-rose-500/20 border-rose-500/40 text-rose-400"
              }`}
            >
              {String(strategy.riskLabel).charAt(0).toUpperCase() + String(strategy.riskLabel).slice(1)}
            </span>
          )}
          {(strategy.liveTrackRecordDays ?? 0) >= 90 && (
            <span className="inline-flex items-center rounded-lg border border-[#30d158]/40 bg-[#30d158]/20 px-2.5 py-1 text-xs font-semibold text-[#30d158]">
              Live 90+ days
            </span>
          )}
        </div>
        {strategy.description && (
          <p className="text-[var(--dash-text-secondary)] mb-6">{strategy.description}</p>
        )}
        {chartData.length > 0 && (
          <div className="mb-6 h-24 w-full max-w-md">
            <CompactEquityChart data={chartData} />
          </div>
        )}
        {hasMetrics && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            {strategy.sharpeRatio != null && (
              <div>
                <p className="text-xs text-[var(--dash-text-secondary)]">Sharpe</p>
                <p className="font-semibold text-[var(--text-primary)]">{strategy.sharpeRatio.toFixed(2)}</p>
              </div>
            )}
            {strategy.maxDrawdownPercent != null && (
              <div>
                <p className="text-xs text-[var(--dash-text-secondary)]">Max DD</p>
                <p className="font-semibold text-[var(--text-primary)]">{strategy.maxDrawdownPercent.toFixed(1)}%</p>
              </div>
            )}
            {strategy.winRate != null && (
              <div>
                <p className="text-xs text-[var(--dash-text-secondary)]">Win rate</p>
                <p className="font-semibold text-[var(--text-primary)]">{strategy.winRate.toFixed(1)}%</p>
              </div>
            )}
            {strategy.paperTradingDays != null && (
              <div>
                <p className="text-xs text-[var(--dash-text-secondary)]">Paper trading</p>
                <p className="font-semibold text-[var(--text-primary)]">{strategy.paperTradingDays} days</p>
              </div>
            )}
          </div>
        )}
        <p className="text-xs text-[var(--dash-text-secondary)] mb-4">
          Past performance does not guarantee future results.
        </p>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-2xl font-bold text-[var(--text-primary)]">${priceMonthly}<span className="text-base font-normal text-[var(--dash-text-secondary)]">/mo</span></p>
            <p className="text-xs text-[var(--dash-text-secondary)]">Platform fee: {strategy.platformFeePercent}%</p>
          </div>
          {strategy.isActive ? (
            <button
              onClick={handleSubscribe}
              disabled={subscribing}
              className="inline-flex items-center gap-2 rounded-full bg-[#30d158] px-6 py-3 text-sm font-semibold text-white hover:bg-[#30d158]/90 disabled:opacity-50 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#30d158]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--dash-bg)]"
            >
              {subscribing ? "Redirecting…" : "Subscribe"}
            </button>
          ) : (
            <p className="text-sm text-[var(--dash-text-secondary)]">This strategy is not available for subscription.</p>
          )}
        </div>
      </div>
    </div>
  );
}
