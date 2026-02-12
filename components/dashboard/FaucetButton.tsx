"use client";

import { useEffect, useState, useCallback } from "react";
import { safeFetchJson } from "@/lib/safeFetch";
import { FAUCET_COOLDOWN_SECONDS } from "@/lib/constants";

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

  const claim = async () => {
    setLoading(true);
    setMessage(null);
    const { data } = await safeFetchJson<{
      success?: boolean;
      data?: { balance?: number; granted?: number; nextFaucetAt?: string };
      error?: string;
      nextFaucetAt?: string;
    }>("/api/faucet", { method: "POST" });
    setLoading(false);
    if (data?.success && data?.data) {
      setNextFaucetAt(data.data.nextFaucetAt ?? null);
      setMessage(`Claimed ${data.data.granted ?? 100} credits. Next in 1 hour.`);
      window.dispatchEvent(new Event("balance-updated"));
    } else if (data?.error === "FAUCET_COOLDOWN" && data?.nextFaucetAt) {
      setNextFaucetAt(data.nextFaucetAt);
      setMessage("Next faucet at " + new Date(data.nextFaucetAt).toLocaleTimeString());
    } else if (data?.error) {
      setMessage("Unable to claim. Try again.");
    }
  };

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
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-6" role="region" aria-label="Faucet – claim free credits">
      <h2 className="mb-1 text-sm font-medium text-[var(--text-secondary)]">
        Claim faucet
      </h2>
      <p className="mb-3 text-xs text-[var(--text-secondary)]">
        Free credits every hour. API: <code className="bg-white/5 px-1 rounded font-mono text-[10px]">POST /api/faucet</code>
      </p>
      <p className="mb-3 text-[10px] text-amber-400/90 font-medium">
        Faucet credits cannot be withdrawn.
      </p>
      <button
        type="button"
        onClick={claim}
        disabled={disabled || loading}
        className="rounded bg-[var(--accent-heart)] px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {loading ? "Claiming..." : disabled ? `Next in ${countdownLabel}` : "Claim 100 credits"}
      </button>
      {message && <p className="mt-2 text-sm text-[var(--text-secondary)]">{message}</p>}
    </div>
  );
}
