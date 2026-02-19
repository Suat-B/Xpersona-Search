"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface DeveloperAccount {
  isDeveloper: boolean;
  onboarded: boolean;
  stripeAccountId?: string;
  subscriberCount?: number;
  feeTier?: string;
}

export default function DeveloperDashboardPage() {
  const [account, setAccount] = useState<DeveloperAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboarding, setOnboarding] = useState(false);

  useEffect(() => {
    fetch("/api/trading/developer/account", { credentials: "include" })
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) setAccount(res.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const startOnboarding = async () => {
    setOnboarding(true);
    try {
      const res = await fetch("/api/trading/developer/onboard", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (data.success && data.data?.url) {
        window.location.href = data.data.url;
        return;
      }
      alert(data.message ?? "Failed to start onboarding");
    } catch (e) {
      alert("Failed to start onboarding");
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
            className="inline-flex items-center gap-2 rounded-full bg-[#30d158] px-6 py-3 text-sm font-semibold text-white hover:bg-[#30d158]/90 disabled:opacity-50 transition-all"
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
                <p className="font-semibold text-[var(--text-primary)] capitalize">{account.feeTier ?? "newcomer"}</p>
              </div>
              {typeof account.subscriberCount === "number" && (
                <div>
                  <p className="text-sm text-[var(--dash-text-secondary)]">Subscribers</p>
                  <p className="font-semibold text-[var(--text-primary)]">{account.subscriberCount}</p>
                </div>
              )}
            </div>
          </div>
          <Link
            href="/trading/developer/list"
            className="inline-flex items-center gap-2 rounded-full border border-[#30d158]/30 bg-[#30d158]/10 px-5 py-2.5 text-sm font-medium text-[#30d158] hover:bg-[#30d158]/20 transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            List a new strategy
          </Link>
          <p className="text-sm text-[var(--dash-text-secondary)]">
            Strategies you list will appear on the marketplace. You can edit prices and toggle active status anytime.
          </p>
        </div>
      )}

      <Link href="/trading" className="text-sm text-[var(--dash-text-secondary)] hover:text-[#30d158] transition-colors">
        ← Back to Trading
      </Link>
    </div>
  );
}
