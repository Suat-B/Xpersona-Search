"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import Link from "next/link";
import { WITHDRAW_MIN_USD, WITHDRAW_MIN_CREDITS, CREDITS_TO_USD } from "@/lib/constants";
import { AI_FIRST_MESSAGING } from "@/lib/ai-first-messaging";
import { fetchBalanceDataWithRetry } from "@/lib/safeFetch";

type BalanceData = {
  balance: number;
  faucetCredits: number;
  withdrawable: number;
};

type WithdrawPageClientProps = {
  initialBalanceData?: BalanceData | null;
};

export function WithdrawPageClient({ initialBalanceData }: WithdrawPageClientProps) {
  const [balanceData, setBalanceData] = useState<BalanceData | null>(initialBalanceData ?? null);
  const [loading, setLoading] = useState(
    initialBalanceData === undefined || initialBalanceData === null
  );
  const [amount, setAmount] = useState("");
  const [wiseEmail, setWiseEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [currency, setCurrency] = useState<"USD" | "EUR" | "GBP">("USD");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  const loadBalance = useCallback(async (clearMessage = true, silent = false): Promise<boolean> => {
    if (!silent) setLoading(true);
    if (clearMessage) setMessage(null);
    try {
      const data = await fetchBalanceDataWithRetry();
      if (data) {
        setBalanceData({
          balance: data.balance,
          faucetCredits: data.faucetCredits,
          withdrawable: data.withdrawable,
        });
        setMessage(null);
        return true;
      }
      setMessage({ type: "error", text: "Failed to load balance." });
      return false;
    } catch {
      setMessage({ type: "error", text: "Failed to load balance." });
      return false;
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialBalanceData) {
      setBalanceData(initialBalanceData);
      setLoading(false);
    }
  }, [initialBalanceData]);

  useEffect(() => {
    let mounted = true;
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const hasServerBalance = initialBalanceData !== undefined && initialBalanceData !== null;

    const runInitialLoad = () => {
      loadBalance().then((ok) => {
        if (!mounted) return;
        if (!ok) {
          const id1 = setTimeout(() => {
            if (!mounted) return;
            loadBalance(false).then((ok2) => {
              if (!mounted || ok2) return;
              const id2 = setTimeout(() => {
                if (!mounted) return;
                loadBalance(false);
              }, 3500);
              timeouts.push(id2);
            });
          }, 2500);
          timeouts.push(id1);
        }
      });
    };

    if (hasServerBalance) {
      const refreshInBackground = () => loadBalance(false, true);
      const timeoutId = setTimeout(refreshInBackground, 300);
      timeouts.push(timeoutId);
    } else {
      const delay = 1200;
      const timeoutId = setTimeout(runInitialLoad, delay);
      timeouts.push(timeoutId);
    }

    const handler = () => loadBalance();
    window.addEventListener("balance-updated", handler);

    return () => {
      mounted = false;
      timeouts.forEach(clearTimeout);
      window.removeEventListener("balance-updated", handler);
    };
  }, [loadBalance, initialBalanceData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(amount, 10);
    if (Number.isNaN(num) || num < 1) {
      setMessage({ type: "error", text: "Enter a valid amount." });
      return;
    }
    if (num < WITHDRAW_MIN_CREDITS) {
      setMessage({
        type: "error",
        text: `Minimum withdrawal is $${WITHDRAW_MIN_USD} (${WITHDRAW_MIN_CREDITS.toLocaleString()} credits).`,
      });
      return;
    }
    const withdrawable = balanceData?.withdrawable ?? 0;
    if (num > withdrawable) {
      setMessage({ type: "error", text: `Maximum withdrawable: ${withdrawable.toLocaleString()} credits.` });
      return;
    }
    const emailTrim = wiseEmail.trim();
    const nameTrim = fullName.trim();
    if (!emailTrim) {
      setMessage({ type: "error", text: "Wise email is required." });
      return;
    }
    if (!/^[^\s]+@[^\s]+\.[^\s]{2,}$/.test(emailTrim)) {
      setMessage({ type: "error", text: "Enter a valid email address." });
      return;
    }
    if (nameTrim.length < 2) {
      setMessage({ type: "error", text: "Full name is required (min 2 characters)." });
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/me/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          amount: num,
          wiseEmail: emailTrim,
          fullName: nameTrim,
          currency,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({
          type: "success",
          text: "We will contact you via the email linked to your account and send you the payments through Wise.",
        });
        setAmount("");
        setWiseEmail("");
        setFullName("");
        loadBalance();
        window.dispatchEvent(new Event("balance-updated"));
      } else {
        const err = data.error ?? data.message ?? "Withdrawal failed.";
        setMessage({ type: "error", text: err });
      }
    } catch {
      setMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  const withdrawableUsd = balanceData ? (balanceData.withdrawable * CREDITS_TO_USD).toFixed(2) : "0.00";

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Hero */}
      <section>
        <h1 className="text-2xl font-bold text-[var(--text-primary)] font-[family-name:var(--font-outfit)]">
          Withdraw funds
        </h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)] max-w-xl">
          {AI_FIRST_MESSAGING.withdrawSubtitle}
        </p>
      </section>

      {/* Balance */}
      <GlassCard className="p-5">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
          Your balance
        </h2>
        {loading ? (
          <p className="text-sm text-[var(--text-secondary)]">Loading…</p>
        ) : balanceData ? (
          <div className="space-y-2">
            <p className="text-xl font-mono font-bold text-[var(--text-primary)]">
              {balanceData.balance.toLocaleString()} credits total
            </p>
            <p className="text-sm text-[var(--text-secondary)]">
              {balanceData.withdrawable.toLocaleString()} credits withdrawable
              <span className="text-[var(--accent-heart)] font-medium"> (${withdrawableUsd} USD)</span>
              {balanceData.faucetCredits > 0 && (
                <span className="block mt-1 text-[var(--text-secondary)]/80">
                  {balanceData.faucetCredits.toLocaleString()} Free Credits (0% withdrawable)
                </span>
              )}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-[var(--text-secondary)]">Unable to load balance.</p>
            <p className="text-xs text-[var(--text-secondary)]/80">
              Refresh the page or sign in — this often fixes session issues.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => loadBalance()}
                disabled={loading}
                className="rounded-lg bg-[var(--accent-heart)]/20 px-3 py-1.5 text-sm font-medium text-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/30 disabled:opacity-50 transition-colors"
              >
                {loading ? "Retrying…" : "Retry"}
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-white/5 transition-colors"
              >
                Refresh page
              </button>
              <Link
                href="/api/auth/guest"
                className="rounded-lg border border-[var(--accent-heart)]/50 px-3 py-1.5 text-sm font-medium text-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/10 transition-colors inline-block"
              >
                Continue as guest
              </Link>
            </div>
          </div>
        )}
      </GlassCard>

      {/* Request form — premium design */}
      <GlassCard interactive={false} className="relative overflow-hidden border-0 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_0_40px_rgba(10,132,255,0.08)] bg-gradient-to-b from-[var(--bg-card)] to-[var(--bg-elevated)]">
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent-heart)]/5 via-transparent to-[var(--accent-neural)]/5 pointer-events-none" aria-hidden />
        <div className="relative p-6 md:p-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-heart)]/15 text-[var(--accent-heart)]">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)] tracking-tight">
                Request Withdrawal
              </h2>
              <p className="text-[13px] text-[var(--text-secondary)] mt-0.5 leading-relaxed max-w-lg">
                Enter the amount you wish to withdraw (up to your available balance). We will contact you via the email linked to your account and send you the payments through Wise.
              </p>
            </div>
          </div>
          {!balanceData && !loading && (
            <div className="mb-5 flex items-center gap-2 rounded-xl bg-amber-500/15 border border-amber-500/25 px-4 py-2.5">
              <svg className="h-4 w-4 flex-shrink-0 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-sm text-amber-400">
                Load your balance first. Click Retry above if balance failed to load.
              </p>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-5 md:grid-cols-2 md:gap-6">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                  Amount (credits)
                </label>
                <input
                  type="number"
                  min={WITHDRAW_MIN_CREDITS}
                  max={balanceData?.withdrawable ?? undefined}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={
                    balanceData
                      ? `Min ${WITHDRAW_MIN_CREDITS.toLocaleString()} · Max ${balanceData.withdrawable.toLocaleString()}`
                      : "Load balance to see limits"
                  }
                  disabled={!balanceData}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-matte)]/80 px-4 py-3.5 text-[var(--text-primary)] placeholder:text-[var(--text-quaternary)] focus:border-[var(--accent-heart)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/25 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
                />
                {amount && !Number.isNaN(parseInt(amount, 10)) && (
                  <p className="mt-2 text-sm font-medium text-[var(--accent-heart)]">
                    ≈ ${((parseInt(amount, 10) || 0) * CREDITS_TO_USD).toFixed(2)} USD
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                  Wise email <span className="text-[var(--accent-heart)]">*</span>
                </label>
                <input
                  type="email"
                  value={wiseEmail}
                  onChange={(e) => setWiseEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-matte)]/80 px-4 py-3 text-[var(--text-primary)] placeholder:text-[var(--text-quaternary)] focus:border-[var(--accent-heart)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/25 transition-all duration-200"
                />
                <p className="mt-1.5 text-xs text-[var(--text-tertiary)]">
                  Email linked to your Wise account
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                  Full name <span className="text-[var(--accent-heart)]">*</span>
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="John Doe"
                  required
                  minLength={2}
                  maxLength={255}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-matte)]/80 px-4 py-3 text-[var(--text-primary)] placeholder:text-[var(--text-quaternary)] focus:border-[var(--accent-heart)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/25 transition-all duration-200"
                />
                <p className="mt-1.5 text-xs text-[var(--text-tertiary)]">
                  Name as it appears on your Wise account
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-end gap-4 pt-2">
              <div className="flex-1 min-w-0">
                <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                  Currency
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as "USD" | "EUR" | "GBP")}
                  className="w-full sm:max-w-[140px] rounded-xl border border-[var(--border)] bg-[var(--bg-matte)]/80 px-4 py-3 text-[var(--text-primary)] focus:border-[var(--accent-heart)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/25 transition-all duration-200"
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={
                  submitting ||
                  !balanceData ||
                  balanceData.withdrawable < WITHDRAW_MIN_CREDITS ||
                  !amount ||
                  !wiseEmail.trim() ||
                  fullName.trim().length < 2
                }
                className="rounded-xl bg-gradient-to-r from-[var(--accent-heart)] to-[var(--accent-neural)] px-6 py-3.5 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(10,132,255,0.35)] hover:shadow-[0_6px_20px_rgba(10,132,255,0.45)] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100 disabled:shadow-none transition-all duration-200"
              >
                {submitting ? "Processing…" : "Request Withdrawal"}
              </button>
            </div>
          </form>
        </div>
      </GlassCard>

      {/* Withdraw process — full explanation */}
      <GlassCard className="p-6 border-[var(--accent-heart)]/20">
        <h2 className="text-base font-semibold text-[var(--text-primary)] mb-4">
          How withdrawal works
        </h2>
        <ol className="space-y-4 text-sm text-[var(--text-secondary)]">
          <li className="flex gap-4">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[var(--accent-heart)]/20 text-[var(--accent-heart)] font-bold flex items-center justify-center text-xs">
              1
            </span>
            <div>
              <span className="font-medium text-[var(--text-primary)]">Request</span>
              {" "}— Enter the amount you wish to withdraw. Minimum is $100 USD ({WITHDRAW_MIN_CREDITS.toLocaleString()} credits).
            </div>
          </li>
          <li className="flex gap-4">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[var(--accent-heart)]/20 text-[var(--accent-heart)] font-bold flex items-center justify-center text-xs">
              2
            </span>
            <div>
              <span className="font-medium text-[var(--text-primary)]">Review</span>
              {" "}— Free Credits are 0% withdrawable. Only credits from deposits can be withdrawn.
            </div>
          </li>
          <li className="flex gap-4">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[var(--accent-heart)]/20 text-[var(--accent-heart)] font-bold flex items-center justify-center text-xs">
              3
            </span>
            <div>
              <span className="font-medium text-[var(--text-primary)]">Processing</span>
              {" "}— Payouts are sent via Wise. Processing typically takes <strong className="text-[var(--text-primary)]">2–7 business days</strong>.
            </div>
          </li>
          <li className="flex gap-4">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[var(--accent-heart)]/20 text-[var(--accent-heart)] font-bold flex items-center justify-center text-xs">
              4
            </span>
            <div>
              <span className="font-medium text-[var(--text-primary)]">Confirmation</span>
              {" "}— You'll receive an email when your withdrawal has been completed.
            </div>
          </li>
        </ol>
        <div className="mt-5 pt-4 border-t border-[var(--border)]">
          <p className="text-xs text-[var(--text-secondary)]">
            <strong className="text-[var(--text-primary)]">Important:</strong> Minimum withdrawal is $100 ({WITHDRAW_MIN_CREDITS.toLocaleString()} credits). 
            Processing takes 2–7 business days. Free Credits cannot be withdrawn.
          </p>
        </div>
      </GlassCard>

      {balanceData && balanceData.withdrawable > 0 && balanceData.withdrawable < WITHDRAW_MIN_CREDITS && (
        <GlassCard className="p-5 border-amber-500/30 bg-amber-500/10">
          <p className="text-sm text-amber-400">
            You have {balanceData.withdrawable.toLocaleString()} withdrawable credits (≈ ${(balanceData.withdrawable * CREDITS_TO_USD).toFixed(2)} USD). 
            Minimum withdrawal is ${WITHDRAW_MIN_USD} ({WITHDRAW_MIN_CREDITS.toLocaleString()} credits).
          </p>
          <Link
            href="/dashboard/deposit"
            className="mt-3 inline-block text-sm font-medium text-[var(--accent-heart)] hover:underline"
          >
            Deposit more to reach the minimum →
          </Link>
        </GlassCard>
      )}

      {balanceData && balanceData.withdrawable === 0 && (
        <GlassCard className="p-5 border-amber-500/30 bg-amber-500/10">
          <p className="text-sm text-amber-400">
            No withdrawable credits. Free Credits are 0% withdrawable — only deposit credits can be withdrawn.
          </p>
          <Link
            href="/dashboard/deposit"
            className="mt-3 inline-block text-sm font-medium text-[var(--accent-heart)] hover:underline"
          >
            Deposit to add withdrawable credits →
          </Link>
        </GlassCard>
      )}

      {message && (
        <GlassCard
          className={`p-4 ${
            message.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10"
              : message.type === "error"
                ? "border-red-500/30 bg-red-500/10"
                : "border-[var(--border)]"
          }`}
        >
          <p
            className={`text-sm ${
              message.type === "success"
                ? "text-emerald-400"
                : message.type === "error"
                  ? "text-red-400"
                  : "text-[var(--text-secondary)]"
            }`}
          >
            {message.text}
          </p>
        </GlassCard>
      )}

      {/* Footer disclaimer */}
      <GlassCard className="p-4 border-[var(--border)]">
        <p className="text-xs text-[var(--text-secondary)]">
          <strong className="text-[var(--text-primary)]">Withdrawal policy:</strong> Minimum ${WITHDRAW_MIN_USD} ({WITHDRAW_MIN_CREDITS.toLocaleString()} credits). 
          Processing takes 2–7 business days. Only credits from deposits are eligible; Free Credits cannot be withdrawn. 
          Funds are returned to your original payment method when available.
        </p>
      </GlassCard>
    </div>
  );
}
