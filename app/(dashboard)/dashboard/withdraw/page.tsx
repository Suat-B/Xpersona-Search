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

function WithdrawPageClient() {
  const [balanceData, setBalanceData] = useState<BalanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [wiseEmail, setWiseEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [currency, setCurrency] = useState<"USD" | "EUR" | "GBP">("USD");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  const loadBalance = useCallback(async (clearMessage = true): Promise<boolean> => {
    setLoading(true);
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
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    let fallbackId: ReturnType<typeof setTimeout> | null = null;

    const runInitialLoad = () => {
      loadBalance().then((ok) => {
        if (!mounted) return;
        if (!ok) fallbackId = setTimeout(() => loadBalance(false), 2500);
      });
    };

    // Give EnsureGuest / auth ~300ms to settle before first fetch (same as game page)
    const timeoutId = setTimeout(runInitialLoad, 300);

    const handler = () => loadBalance();
    window.addEventListener("balance-updated", handler);

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      if (fallbackId) clearTimeout(fallbackId);
      window.removeEventListener("balance-updated", handler);
    };
  }, [loadBalance]);

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
          text: "We will contact you via the Gmail linked to your account and send you the payments through Wise.",
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
              {" "}— You’ll receive an email when your withdrawal has been completed.
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
          <div className="space-y-2">
            <p className="text-sm text-[var(--text-secondary)]">Unable to load balance.</p>
            <button
              type="button"
              onClick={() => loadBalance()}
              disabled={loading}
              className="text-sm font-medium text-[var(--accent-heart)] hover:underline disabled:opacity-50"
            >
              Retry
            </button>
          </div>
        )}
      </GlassCard>

      {/* Request form */}
      {balanceData && balanceData.withdrawable >= WITHDRAW_MIN_CREDITS && (
        <GlassCard className="p-5">
          <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">
            Request Withdrawal
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            Min ${WITHDRAW_MIN_USD} ({WITHDRAW_MIN_CREDITS.toLocaleString()} credits). Processing: 2–7 business days.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                Amount (credits)
              </label>
              <input
                type="number"
                min={WITHDRAW_MIN_CREDITS}
                max={balanceData.withdrawable}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={`Min ${WITHDRAW_MIN_CREDITS.toLocaleString()} · Max ${balanceData.withdrawable.toLocaleString()}`}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-matte)] px-4 py-2.5 text-[var(--text-primary)] focus:border-[var(--accent-heart)] focus:outline-none"
              />
              {amount && !Number.isNaN(parseInt(amount, 10)) && (
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  ≈ ${((parseInt(amount, 10) || 0) * CREDITS_TO_USD).toFixed(2)} USD
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                Wise email <span className="text-amber-400">*</span>
              </label>
              <input
                type="email"
                value={wiseEmail}
                onChange={(e) => setWiseEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-matte)] px-4 py-2.5 text-[var(--text-primary)] focus:border-[var(--accent-heart)] focus:outline-none"
              />
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Email linked to your Wise account
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                Full name <span className="text-amber-400">*</span>
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="John Doe"
                required
                minLength={2}
                maxLength={255}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-matte)] px-4 py-2.5 text-[var(--text-primary)] focus:border-[var(--accent-heart)] focus:outline-none"
              />
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Name as it appears on your Wise account
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                Currency
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as "USD" | "EUR" | "GBP")}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-matte)] px-4 py-2.5 text-[var(--text-primary)] focus:border-[var(--accent-heart)] focus:outline-none"
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={submitting || !amount || !wiseEmail.trim() || fullName.trim().length < 2}
              className="rounded-lg bg-[var(--accent-heart)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {submitting ? "Processing…" : "Request Withdrawal"}
            </button>
          </form>
        </GlassCard>
      )}

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

export default function WithdrawPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6 animate-in fade-in duration-500">
          <div className="h-8 w-48 rounded bg-white/10" />
          <div className="h-32 rounded-xl bg-white/5" />
          <div className="h-24 rounded-xl bg-white/5" />
        </div>
      }
    >
      <WithdrawPageClient />
    </Suspense>
  );
}
