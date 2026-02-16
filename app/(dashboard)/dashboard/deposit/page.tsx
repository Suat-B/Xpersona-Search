"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { AI_FIRST_MESSAGING } from "@/lib/ai-first-messaging";
import { useSearchParams } from "next/navigation";
import { GlassCard } from "@/components/ui/GlassCard";
import Link from "next/link";
import { MIN_BET, DEPOSIT_ALERT_LOW, DEPOSIT_ALERT_CRITICAL } from "@/lib/constants";
import { fetchBalanceWithRetry } from "@/lib/safeFetch";

type Package = { id: string; name: string; credits: number; amountCents: number };

function DepositPageClient() {
  const searchParams = useSearchParams();
  const success = searchParams.get("success") === "1";

  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [packages, setPackages] = useState<Package[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(true);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);

  const loadBalance = useCallback(async () => {
    setBalanceLoading(true);
    try {
      const bal = await fetchBalanceWithRetry();
      if (bal !== null) setBalance(bal);
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
    setBuyError(null);
    setBuyingId(packageId);
    try {
      const res = await fetch("/api/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ packageId }),
      });
      const data = await res.json();
      if (data.success && data.data?.url) {
        window.location.href = data.data.url;
        return;
      }
      setBuyError(data.message ?? data.error ?? "Deposit failed. Please try again.");
    } finally {
      setBuyingId(null);
    }
  };

  const creditsPerDollar = (pkg: Package) =>
    pkg.amountCents > 0 ? Math.round(pkg.credits / (pkg.amountCents / 100)) : 0;
  const isPopular = (pkg: Package) => pkg.credits === 2000;

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

      {/* Credit packages grid */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
          Choose a package
        </h2>
        <p className="mb-6 text-sm text-[var(--text-secondary)]">
          {AI_FIRST_MESSAGING.depositStripeCopy}
        </p>
        {buyError && (
          <GlassCard className="mb-4 p-4 border-amber-500/30 bg-amber-500/10">
            <p className="text-sm text-amber-400">{buyError}</p>
          </GlassCard>
        )}
        {packagesLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <GlassCard key={i} className="p-8">
                <div className="animate-pulse space-y-4">
                  <div className="h-14 w-14 rounded-2xl bg-white/10" />
                  <div className="h-6 w-32 bg-white/10 rounded" />
                  <div className="h-10 w-24 bg-white/10 rounded" />
                  <div className="h-12 w-full bg-white/10 rounded-xl" />
                </div>
              </GlassCard>
            ))}
          </div>
        ) : packages.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {packages.map((pkg) => (
              <GlassCard
                key={pkg.id}
                className={`overflow-hidden border-[var(--accent-heart)]/20 shadow-[0_0_40px_-10px_rgba(10,132,255,0.15)] hover:shadow-[0_0_50px_-10px_rgba(10,132,255,0.25)] transition-all duration-300 hover:scale-[1.02] ${
                  isPopular(pkg) ? "ring-1 ring-[var(--accent-heart)]/40" : ""
                }`}
              >
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent-heart)]/5 via-transparent to-transparent pointer-events-none" />
                  <div className="relative p-6">
                    {isPopular(pkg) && (
                      <span className="absolute top-4 right-4 rounded-full bg-[var(--accent-heart)]/20 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-heart)] border border-[var(--accent-heart)]/30">
                        Popular
                      </span>
                    )}
                    <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-[var(--accent-heart)]/10 border border-[var(--accent-heart)]/20 mb-4">
                      <svg className="w-6 h-6 text-[var(--accent-heart)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-[var(--text-primary)] font-[family-name:var(--font-outfit)]">
                      {pkg.name}
                    </h3>
                    <div className="mt-4 flex flex-col gap-0.5">
                      <span className="text-3xl font-bold font-mono text-[var(--accent-heart)]">
                        ${(pkg.amountCents / 100).toFixed(2)}
                      </span>
                      <span className="text-sm text-[var(--text-secondary)]">
                        {pkg.credits.toLocaleString()} credits
                      </span>
                    </div>
                    <p className="mt-3 text-xs text-[var(--text-tertiary)]">
                      ≈ {creditsPerDollar(pkg)} cr/$ · Instant via Stripe
                    </p>
                    <button
                      type="button"
                      onClick={() => buy(pkg.id)}
                      disabled={!!buyingId}
                      className="mt-5 w-full rounded-xl bg-gradient-to-b from-[var(--accent-heart)] to-[#0662c4] px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-[var(--accent-heart)]/30 hover:shadow-[var(--accent-heart)]/40 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 disabled:hover:scale-100 transition-all duration-200"
                    >
                      {buyingId === pkg.id ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Redirecting…
                        </span>
                      ) : (
                        <>Get {pkg.credits.toLocaleString()} credits →</>
                      )}
                    </button>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        ) : (
          <GlassCard className="p-6 border-[var(--border)]">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">
              No packages available
            </h3>
            <p className="text-sm text-[var(--text-secondary)]">
              Run the hands-off setup to create Stripe products and seed your database:
            </p>
            <code className="mt-3 block rounded-lg bg-white/10 px-4 py-3 font-mono text-sm text-[var(--accent-heart)] border border-[var(--border)]">
              npm run setup:stripe
            </code>
            <p className="mt-3 text-xs text-[var(--text-secondary)]/80">
              Opens Stripe Dashboard, prompts for keys, writes .env.local, seeds credit_packages. See{" "}
              <Link href="/dashboard/api" className="text-[var(--accent-heart)] hover:underline">
                docs
              </Link>
              .
            </p>
          </GlassCard>
        )}
      </section>

      {/* Technical: AI deposit alert spec */}
      <GlassCard className="p-5 border-cyan-500/20 bg-gradient-to-br from-cyan-500/5 to-transparent">
        <h2 className="text-sm font-semibold text-cyan-300 uppercase tracking-wider mb-3">
          For AI: Deposit alert spec
        </h2>
        <p className="text-xs text-[var(--text-secondary)] mb-4">
          Use these details to alert your player when they need to deposit. Credits are applied instantly; recommend deposit as soon as balance is low.
        </p>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-[var(--text-primary)] mb-1">Balance API</p>
            <pre className="text-[11px] font-mono text-[var(--text-secondary)] bg-black/30 rounded-lg p-3 overflow-x-auto">
{`GET /api/me/balance
Authorization: Bearer <XPERSONA_API_KEY>

Response includes:
  balance, faucetCredits, withdrawable
  deposit_alert: "ok" | "low" | "critical"
  deposit_alert_message: string | null  — ready-to-use for player
  deposit_url: "/dashboard/deposit"
  deposit_thresholds: { low, critical, min_play }`}
            </pre>
          </div>
          <div>
            <p className="text-xs font-medium text-[var(--text-primary)] mb-1">Suggested thresholds</p>
            <ul className="text-xs text-[var(--text-secondary)] space-y-1 font-mono">
              <li>• balance &lt; {DEPOSIT_ALERT_CRITICAL} → <span className="text-amber-400">critical</span>: Alert immediately, deposit required to continue</li>
              <li>• balance &lt; {DEPOSIT_ALERT_LOW} → <span className="text-amber-400">low</span>: Suggest deposit soon</li>
              <li>• min_play = {MIN_BET} credit(s) — cannot play below this</li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-medium text-[var(--text-primary)] mb-1">Deposit URL</p>
            <p className="text-[11px] font-mono text-[var(--text-secondary)]">
              <code className="bg-black/30 px-1 rounded">/dashboard/deposit</code> — API also returns <code className="bg-black/30 px-1 rounded">deposit_url</code>, <code className="bg-black/30 px-1 rounded">deposit_alert</code>, <code className="bg-black/30 px-1 rounded">deposit_alert_message</code>
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-[var(--text-primary)] mb-1">Suggested alert phrasing</p>
            <ul className="text-xs text-[var(--text-secondary)] space-y-1">
              <li>• Critical: &quot;Your balance is {'{balance}'} credits. Deposit now to keep playing — credits arrive instantly.&quot;</li>
              <li>• Low: &quot;Balance running low. Consider depositing at /dashboard/deposit before you run out.&quot;</li>
            </ul>
          </div>
        </div>
        <div className="mt-4 pt-3 border-t border-cyan-500/20">
          <Link
            href="/dashboard/api"
            className="text-xs font-medium text-cyan-400 hover:text-cyan-300 hover:underline"
          >
            Full API docs →
          </Link>
        </div>
      </GlassCard>

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
