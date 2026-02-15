"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { AI_FIRST_MESSAGING } from "@/lib/ai-first-messaging";
import { useSearchParams } from "next/navigation";
import { GlassCard } from "@/components/ui/GlassCard";

type Package = { id: string; name: string; credits: number; amountCents: number };

function DepositPageClient() {
  const searchParams = useSearchParams();
  const success = searchParams.get("success") === "1";

  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [packages, setPackages] = useState<Package[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(true);
  const [buyingId, setBuyingId] = useState<string | null>(null);

  const loadBalance = useCallback(async () => {
    setBalanceLoading(true);
    try {
      const res = await fetch("/api/me/balance");
      const data = await res.json();
      if (data.success && typeof data.data?.balance === "number") {
        setBalance(data.data.balance);
      }
    } catch {
      // ignore
    } finally {
      setBalanceLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBalance();
  }, [loadBalance]);

  useEffect(() => {
    fetch("/api/credits/packages")
      .then((r) => r.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data)) {
          setPackages(data.data);
        }
      })
      .finally(() => setPackagesLoading(false));
  }, []);

  const buy = async (packageId: string) => {
    setBuyingId(packageId);
    try {
      const res = await fetch("/api/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId }),
      });
      const data = await res.json();
      if (data.success && data.data?.url) {
        window.location.href = data.data.url;
        return;
      }
    } finally {
      setBuyingId(null);
    }
  };

  const starterBundle = packages.find((p) => p.credits === 500) ?? packages[0];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Hero / title */}
      <section>
        <h1 className="text-2xl font-bold text-[var(--text-primary)] font-[family-name:var(--font-outfit)]">
          Deposit funds
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {AI_FIRST_MESSAGING.depositSubtitle} Secure payment via Stripe.
        </p>
      </section>

      {/* Success message */}
      {success && (
        <GlassCard className="p-4 border-emerald-500/30 bg-emerald-500/10">
          <p className="text-sm font-medium text-emerald-400">
            Payment successful. Your balance has been updated.
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Credits are available immediately. You can close this message or continue to add more.
          </p>
        </GlassCard>
      )}

      {/* Current balance */}
      <GlassCard className="p-5">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
          Your balance
        </h2>
        {balanceLoading ? (
          <p className="text-sm text-[var(--text-secondary)]">Loading…</p>
        ) : balance !== null ? (
          <p className="text-xl font-mono font-bold text-[var(--text-primary)]">
            {balance.toLocaleString()} credits
          </p>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">Unable to load balance.</p>
        )}
      </GlassCard>

      {/* Starter Bundle card — $5 / 500 credits */}
      <section className="max-w-md">
        {packagesLoading ? (
          <GlassCard className="p-8">
            <div className="animate-pulse space-y-4">
              <div className="h-14 w-14 rounded-2xl bg-white/10" />
              <div className="h-6 w-32 bg-white/10 rounded" />
              <div className="h-10 w-24 bg-white/10 rounded mx-auto" />
              <div className="h-12 w-full bg-white/10 rounded-xl" />
            </div>
          </GlassCard>
        ) : starterBundle ? (
          <GlassCard className="overflow-hidden border-[var(--accent-heart)]/20 shadow-[0_0_40px_-10px_rgba(244,63,94,0.15)] hover:shadow-[0_0_50px_-10px_rgba(244,63,94,0.25)] transition-shadow duration-300">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent-heart)]/5 via-transparent to-transparent pointer-events-none" />
              <div className="relative p-8">
                <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--accent-heart)]/10 border border-[var(--accent-heart)]/20 mb-6">
                  <svg className="w-7 h-7 text-[var(--accent-heart)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-center text-lg font-semibold text-[var(--text-primary)] font-[family-name:var(--font-outfit)]">
                  {starterBundle.name}
                </h3>
                <div className="mt-4 flex flex-col items-center gap-1">
                  <span className="text-4xl font-bold font-mono text-[var(--accent-heart)]">
                    ${(starterBundle.amountCents / 100).toFixed(0)}
                  </span>
                  <span className="text-sm text-[var(--text-secondary)]">
                    {starterBundle.credits.toLocaleString()} credits
                  </span>
                </div>
                <p className="mt-4 text-center text-xs text-[var(--text-secondary)]">
                  ≈ {Math.round(starterBundle.credits / (starterBundle.amountCents / 100))} credits per dollar — instant delivery
                </p>
                <button
                  type="button"
                  onClick={() => buy(starterBundle.id)}
                  disabled={!!buyingId}
                  className="mt-6 w-full rounded-xl bg-gradient-to-b from-[var(--accent-heart)] to-[#e11d48] px-6 py-4 text-base font-bold text-white shadow-lg shadow-[var(--accent-heart)]/30 hover:shadow-[var(--accent-heart)]/40 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:hover:scale-100 transition-all duration-200"
                >
                  {buyingId === starterBundle.id ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Redirecting…
                    </span>
                  ) : (
                    <>Get {starterBundle.credits.toLocaleString()} credits →</>
                  )}
                </button>
              </div>
            </div>
          </GlassCard>
        ) : (
          <GlassCard className="p-6">
            <p className="text-sm text-[var(--text-secondary)]">
              No packages available. Run <code className="bg-white/10 px-1 rounded">npm run seed</code> and set <code className="bg-white/10 px-1 rounded">STRIPE_PRICE_500</code> in .env.
            </p>
          </GlassCard>
        )}
      </section>

      {/* Disclaimer */}
      <GlassCard className="p-4 border-[var(--border)]">
        <p className="text-xs text-[var(--text-secondary)]">
          Credits are used only for gameplay on Xpersona. Non-refundable. Payments are processed securely by Stripe.
        </p>
      </GlassCard>
    </div>
  );
}

export default function DepositPage() {
  return (
    <Suspense fallback={<div className="space-y-6 animate-in fade-in duration-500"><div className="h-8 w-48 rounded bg-white/10" /><div className="h-32 rounded-xl bg-white/5" /><div className="h-24 rounded-xl bg-white/5" /></div>}>
      <DepositPageClient />
    </Suspense>
  );
}
