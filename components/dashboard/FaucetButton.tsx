"use client";

import { useEffect, useState, useCallback } from "react";
import { safeFetchJson } from "@/lib/safeFetch";
import { FAUCET_COOLDOWN_SECONDS, FAUCET_AMOUNT } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function FaucetButton() {
  const [nextFaucetAt, setNextFaucetAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const loadNextFaucetAt = useCallback(async () => {
    const { data } = await safeFetchJson<{ success?: boolean; data?: { lastFaucetAt?: string } }>("/api/me");
    if (data?.success && data?.data?.lastFaucetAt) {
      const lastAt = new Date(data.data.lastFaucetAt).getTime();
      const nextAt = new Date(lastAt + FAUCET_COOLDOWN_SECONDS * 1000).toISOString();
      setNextFaucetAt(nextAt);
    } else {
      setNextFaucetAt(null);
    }
  }, []);

  useEffect(() => {
    loadNextFaucetAt();
    window.addEventListener("balance-updated", loadNextFaucetAt);
    return () => window.removeEventListener("balance-updated", loadNextFaucetAt);
  }, [loadNextFaucetAt]);

  const claim = useCallback(async () => {
    setMessage(null);
    setLoading(true);

    const prevNextAt = nextFaucetAt;
    const optimisticNext = new Date(Date.now() + FAUCET_COOLDOWN_SECONDS * 1000).toISOString();

    setNextFaucetAt(optimisticNext);

    try {
      const { ok, status, data } = await safeFetchJson<{
        success?: boolean;
        data?: { balance?: number; granted?: number; nextFaucetAt?: string };
        error?: string;
        nextFaucetAt?: string;
      }>("/api/faucet", { method: "POST" });

      if (data?.success && data?.data) {
        setNextFaucetAt(data.data.nextFaucetAt ?? optimisticNext);
        window.dispatchEvent(new CustomEvent("balance-updated", { detail: { balance: data.data.balance } }));
      } else if (data?.error === "FAUCET_COOLDOWN" && data?.nextFaucetAt) {
        setNextFaucetAt(data.nextFaucetAt);
        setMessage("Cooldown active — next claim available soon");
      } else if (status === 401) {
        setNextFaucetAt(prevNextAt);
        setMessage("Authentication required");
      } else if (data?.error) {
        setNextFaucetAt(prevNextAt);
        setMessage(data.error === "UNAUTHORIZED" ? "Please log in" : "Unable to claim");
      } else {
        setNextFaucetAt(prevNextAt);
        setMessage("Unable to claim");
      }
    } catch (e) {
      setNextFaucetAt(prevNextAt);
      setMessage("Network error");
      console.error("[FaucetButton] claim error:", e);
    } finally {
      setLoading(false);
    }
  }, [nextFaucetAt]);

  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const nextAt = nextFaucetAt ? new Date(nextFaucetAt) : null;
  const disabled = nextAt && now !== null ? nextAt.getTime() > now : false;
  const remainingMs = nextAt && now !== null && nextAt.getTime() > now ? nextAt.getTime() - now : 0;
  const countdownMins = Math.ceil(remainingMs / 60000);
  const countdownSecs = Math.ceil(remainingMs / 1000);
  const countdownLabel = remainingMs > 60000 ? `${countdownMins}m` : remainingMs > 0 ? `${countdownSecs}s` : "";

  return (
    <div
      className="agent-card p-5 relative overflow-visible"
      role="region"
      aria-label="Free Credits"
    >
      <div className="flex items-start gap-3 mb-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#30d158]/10 border border-[#30d158]/20 text-[#30d158]">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
        </div>

        <div className="flex-1">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            Free Credits
          </h2>
          <p className="text-xs text-[var(--text-secondary)]">
            {FAUCET_AMOUNT} credits / hour
          </p>
        </div>
      </div>

      <div className="mb-4 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
        <p className="text-xs text-[var(--text-tertiary)] flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Free Credits cannot be withdrawn — 0%
        </p>
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={claim}
          disabled={disabled || loading}
          className={cn(
            "w-full rounded-xl px-4 py-3 font-medium text-white transition-all duration-300 relative",
            disabled && "bg-[var(--text-tertiary)]/20 cursor-not-allowed",
            !disabled && "bg-[#30d158] hover:bg-[#30d158]/90 shadow-lg shadow-[#30d158]/20 hover:shadow-[#30d158]/30 active:scale-[0.98]"
          )}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2 opacity-0">
              <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Processing...
            </span>
          ) : disabled ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Next claim in {countdownLabel}
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Claim {FAUCET_AMOUNT} Credits
            </span>
          )}
        </button>
      </div>

      {message && (
        <div className="mt-3 p-3 rounded-xl bg-white/[0.03] border border-[var(--border)]">
          <p className="text-sm text-[var(--text-secondary)]">{message}</p>
        </div>
      )}
    </div>
  );
}
