"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { StrategyDetailSkeleton } from "@/components/trading/StrategyDetailSkeleton";
import { TradingErrorBanner } from "@/components/trading/TradingErrorBanner";

interface StrategyDetail {
  id: string;
  name: string;
  description: string | null;
  priceMonthlyCents: number;
  priceYearlyCents: number | null;
  platformFeePercent: number;
  isActive: boolean;
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
        {strategy.description && (
          <p className="text-[var(--dash-text-secondary)] mb-6">{strategy.description}</p>
        )}
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
