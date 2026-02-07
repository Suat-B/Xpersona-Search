"use client";

import { useEffect, useState } from "react";

export function FaucetButton() {
  const [nextFaucetAt, setNextFaucetAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const claim = async () => {
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/faucet", { method: "POST" });
    const data = await res.json();
    setLoading(false);
    if (data.success) {
      setNextFaucetAt(data.data.nextFaucetAt);
      setMessage(`Claimed ${data.data.granted} credits. Next in 1 hour.`);
      window.dispatchEvent(new Event("balance-updated"));
    } else if (data.error === "FAUCET_COOLDOWN") {
      setNextFaucetAt(data.nextFaucetAt);
      setMessage("Next faucet at " + new Date(data.nextFaucetAt).toLocaleTimeString());
    }
  };

  useEffect(() => {
    const handler = () => {
      fetch("/api/me")
        .then((r) => r.json())
        .then((d) => d.data?.lastFaucetAt && setNextFaucetAt(d.data.lastFaucetAt));
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
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-6">
      <h2 className="mb-2 text-sm font-medium text-[var(--text-secondary)]">
        Hourly faucet
      </h2>
      <button
        type="button"
        onClick={claim}
        disabled={disabled || loading}
        className="rounded bg-[var(--accent-heart)] px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {loading ? "Claiming..." : disabled ? `Next in ${countdown}m` : "Claim 50 credits"}
      </button>
      {message && <p className="mt-2 text-sm text-[var(--text-secondary)]">{message}</p>}
    </div>
  );
}
