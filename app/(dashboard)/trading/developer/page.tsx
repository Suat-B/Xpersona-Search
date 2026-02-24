"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TradingErrorBanner } from "@/components/trading/TradingErrorBanner";
import { FeeTierBadge } from "@/components/trading/FeeTierBadge";

interface DeveloperAccount {
  isDeveloper: boolean;
  onboarded: boolean;
  stripeAccountId?: string;
  subscriberCount?: number;
  feeTier?: string;
}

interface MyStrategy {
  id: string;
  name: string;
  description: string | null;
  priceMonthlyCents: number;
  isActive: boolean;
  subscriberCount: number;
}

type PermanentAccountRequiredResponse = {
  error: "PERMANENT_ACCOUNT_REQUIRED";
  upgradeUrl?: string;
};

export default function DeveloperDashboardPage() {
  const router = useRouter();
  const [account, setAccount] = useState<DeveloperAccount | null>(null);
  const [myStrategies, setMyStrategies] = useState<MyStrategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingStrategies, setLoadingStrategies] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const redirectToUpgradeIfNeeded = useCallback(
    (status: number, payload: unknown): boolean => {
      if (
        status === 403 &&
        payload &&
        typeof payload === "object" &&
        (payload as PermanentAccountRequiredResponse).error ===
          "PERMANENT_ACCOUNT_REQUIRED" &&
        typeof (payload as PermanentAccountRequiredResponse).upgradeUrl ===
          "string"
      ) {
        router.push((payload as PermanentAccountRequiredResponse).upgradeUrl!);
        return true;
      }
      return false;
    },
    [router]
  );

  useEffect(() => {
    fetch("/api/trading/developer/account", { credentials: "include" })
      .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))
      .then(({ status, body: res }) => {
        if (redirectToUpgradeIfNeeded(status, res)) return;
        if (res.success && res.data) setAccount(res.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [redirectToUpgradeIfNeeded]);

  useEffect(() => {
    if (!account?.onboarded) return;
    setLoadingStrategies(true);
    fetch("/api/trading/developer/strategies", { credentials: "include" })
      .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))
      .then(({ status, body: res }) => {
        if (redirectToUpgradeIfNeeded(status, res)) return;
        if (res.success && Array.isArray(res.data)) setMyStrategies(res.data);
        setLoadingStrategies(false);
      })
      .catch(() => setLoadingStrategies(false));
  }, [account?.onboarded, redirectToUpgradeIfNeeded]);

  const toggleActive = async (strategy: MyStrategy) => {
    setError(null);
    setTogglingId(strategy.id);
    try {
      const res = await fetch(`/api/trading/strategies/${strategy.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isActive: !strategy.isActive }),
      });
      const data = await res.json().catch(() => ({}));
      if (redirectToUpgradeIfNeeded(res.status, data)) return;
      if (data.success) {
        setMyStrategies((prev) =>
          prev.map((s) =>
            s.id === strategy.id ? { ...s, isActive: !s.isActive } : s
          )
        );
      } else {
        setError(data.message ?? "Failed to update status");
      }
    } catch {
      setError("Failed to update status");
    } finally {
      setTogglingId(null);
    }
  };

  const startOnboarding = async () => {
    setError(null);
    setOnboarding(true);
    try {
      const res = await fetch("/api/trading/developer/onboard", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (redirectToUpgradeIfNeeded(res.status, data)) return;
      if (data.success && data.data?.url) {
        window.location.href = data.data.url;
        return;
      }
      const msg = data.message ?? data.error ?? "Failed to start onboarding";
      setError(msg);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setOnboarding(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Developer Dashboard</h1>
        <p className="text-[var(--dash-text-secondary)]">Loading…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {error && (
        <TradingErrorBanner message={error} onDismiss={() => setError(null)} />
      )}
      <header>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-[#30d158] animate-pulse" />
          <span className="text-xs font-medium text-[var(--dash-text-secondary)] uppercase tracking-wider">
            DEVELOPER
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-gradient-primary">
          Developer Dashboard
        </h1>
        <p className="mt-2 text-sm text-[var(--dash-text-secondary)]">
          List strategies for free. Set your price. We take 20%.
        </p>
      </header>

      {!account?.onboarded ? (
        <div className="agent-card p-8 border-[var(--dash-divider)]">
          <h2 className="font-semibold text-[var(--text-primary)] text-lg mb-2">
            Complete onboarding to list strategies
          </h2>
          <p className="text-sm text-[var(--dash-text-secondary)] mb-6 max-w-md">
            Connect your Stripe account to receive payouts. It takes about 2 minutes. No monthly fees.
          </p>
          <button
            onClick={startOnboarding}
            disabled={onboarding}
            className="inline-flex items-center gap-2 rounded-full bg-[#30d158] px-6 py-3 text-sm font-semibold text-white hover:bg-[#30d158]/90 disabled:opacity-50 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#30d158]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--dash-bg)]"
          >
            {onboarding ? "Redirecting…" : "Start onboarding"}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="agent-card p-6 border-[var(--dash-divider)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[var(--dash-text-secondary)]">Status</p>
                <p className="font-semibold text-[#30d158]">Onboarded</p>
              </div>
              <div>
                <p className="text-sm text-[var(--dash-text-secondary)]">Fee tier</p>
                <FeeTierBadge
                  feeTier={account.feeTier ?? "newcomer"}
                  subscriberCount={account.subscriberCount}
                />
              </div>
              {typeof account.subscriberCount === "number" && (
                <div>
                  <p className="text-sm text-[var(--dash-text-secondary)]">Subscribers</p>
                  <p className="font-semibold text-[var(--text-primary)]">{account.subscriberCount}</p>
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href="/trading/developer/list"
              className="inline-flex items-center gap-2 rounded-full border border-[#30d158]/30 bg-[#30d158]/10 px-5 py-2.5 text-sm font-medium text-[#30d158] hover:bg-[#30d158]/20 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#30d158]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--dash-bg)]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              List a new strategy
            </Link>
          </div>

          {loadingStrategies ? (
            <p className="text-sm text-[var(--dash-text-secondary)]">Loading your strategies…</p>
          ) : myStrategies.length > 0 ? (
            <div className="agent-card overflow-hidden border-[var(--dash-divider)]">
              <h3 className="px-6 py-4 font-semibold text-[var(--text-primary)] border-b border-[var(--dash-divider)]">
                My strategies
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--dash-divider)] text-left text-[var(--dash-text-secondary)]">
                      <th className="px-6 py-3 font-medium">Name</th>
                      <th className="px-6 py-3 font-medium">Price</th>
                      <th className="px-6 py-3 font-medium">Status</th>
                      <th className="px-6 py-3 font-medium">Subscribers</th>
                      <th className="px-6 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myStrategies.map((s) => (
                      <tr key={s.id} className="border-b border-[var(--dash-divider)] last:border-0">
                        <td className="px-6 py-3">
                          <Link
                            href={`/trading/developer/strategy/${s.id}/edit`}
                            className="font-medium text-[var(--text-primary)] hover:text-[#30d158] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#30d158]/50 rounded"
                          >
                            {s.name}
                          </Link>
                        </td>
                        <td className="px-6 py-3 text-[#30d158] font-semibold">
                          ${(s.priceMonthlyCents / 100).toFixed(2)}/mo
                        </td>
                        <td className="px-6 py-3">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                              s.isActive
                                ? "bg-[#30d158]/20 text-[#30d158]"
                                : "bg-[var(--dash-divider)] text-[var(--dash-text-secondary)]"
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${s.isActive ? "bg-[#30d158]" : "bg-[var(--dash-text-secondary)]"}`} />
                            {s.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-[var(--text-primary)]">{s.subscriberCount}</td>
                        <td className="px-6 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => toggleActive(s)}
                              disabled={togglingId === s.id}
                              className="text-xs font-medium text-[var(--dash-text-secondary)] hover:text-[#30d158] disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#30d158]/50 rounded px-2 py-1"
                              title={s.isActive ? "Deactivate" : "Activate"}
                            >
                              {togglingId === s.id ? "…" : s.isActive ? "Deactivate" : "Activate"}
                            </button>
                            <Link
                              href={`/trading/developer/strategy/${s.id}/edit`}
                              className="text-xs font-medium text-[var(--dash-text-secondary)] hover:text-[#30d158] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#30d158]/50 rounded px-2 py-1"
                            >
                              Edit
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <p className="text-sm text-[var(--dash-text-secondary)]">
            Strategies you list will appear on the marketplace. You can edit prices and toggle active status anytime.
          </p>
        </div>
      )}

      <Link href="/trading" className="text-sm text-[var(--dash-text-secondary)] hover:text-[#30d158] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#30d158]/50 focus-visible:ring-offset-2 rounded">
        ← Back to Trading
      </Link>
    </div>
  );
}
