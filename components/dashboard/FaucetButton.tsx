"use client";

import { useEffect, useState } from "react";
import { safeFetchJson } from "@/lib/safeFetch";

export function FaucetButton() {
  const [nextFaucetAt, setNextFaucetAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
    }
  };

  useEffect(() => {
    const handler = async () => {
      const { data } = await safeFetchJson<{ data?: { lastFaucetAt?: string } }>("/api/me");
      if (data?.data?.lastFaucetAt) setNextFaucetAt(data.data.lastFaucetAt);
    };
    window.addEventListener("balance-updated", handler);
    return () => window.removeEventListener("balance-updated", handler);
  }, []);

  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const nextAt = nextFaucetAt ? new Date(nextFaucetAt) : null;
  const disabled = nextAt && now !== null ? nextAt.getTime() > now : false;
  const countdown =
    nextAt && now !== null && nextAt.getTime() > now
      ? Math.ceil((nextAt.getTime() - now) / 60000)
      : 0;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-6" role="region" aria-label="Faucet – claim free credits">
      <h2 className="mb-1 text-sm font-medium text-[var(--text-secondary)]">
        Claim faucet
      </h2>
      <p className="mb-3 text-xs text-[var(--text-secondary)]">
        Free credits every hour. API: <code className="bg-white/5 px-1 rounded font-mono text-[10px]">POST /api/faucet</code>
      </p>
      <button
        type="button"
        onClick={claim}
        disabled={disabled || loading}
        className="rounded bg-[var(--accent-heart)] px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {loading ? "Claiming..." : disabled ? `Next in ${countdown}m` : "Claim 100 credits"}
      </button>
      {message && <p className="mt-2 text-sm text-[var(--text-secondary)]">{message}</p>}
    </div>
  );
}
