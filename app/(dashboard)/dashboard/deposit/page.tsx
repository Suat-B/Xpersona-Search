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

      {/* Credit packages */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">
          Credit packages
        </h2>
        {packagesLoading ? (
          <p className="text-sm text-[var(--text-secondary)]">Loading packages…</p>
        ) : packages.length === 0 ? (
          <GlassCard className="p-6">
            <p className="text-sm text-[var(--text-secondary)]">
              No packages available. Please try again later.
            </p>
          </GlassCard>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {packages.map((pkg) => (
              <GlassCard key={pkg.id} className="p-5 flex flex-col">
                <h3 className="font-semibold text-[var(--text-primary)]">{pkg.name}</h3>
                <p className="mt-1 text-2xl font-mono font-bold text-[var(--accent-heart)]">
                  {(pkg.amountCents / 100).toFixed(2)} USD
                </p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {pkg.credits.toLocaleString()} credits
                </p>
                <button
                  type="button"
                  onClick={() => buy(pkg.id)}
                  disabled={!!buyingId}
                  className="mt-4 w-full rounded-lg bg-[var(--accent-heart)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {buyingId === pkg.id ? "Redirecting…" : `Add ${pkg.credits.toLocaleString()} credits`}
                </button>
              </GlassCard>
            ))}
          </div>
        )}
      </section>

      {/* Disclaimer */}
      <GlassCard className="p-4 border-[var(--border)]">
        <p className="text-xs text-[var(--text-secondary)]">
          Credits are used only for gameplay on xpersona. Non-refundable. Payments are processed securely by Stripe.
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
