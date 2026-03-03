"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiKeySection } from "@/components/dashboard/ApiKeySection";

interface PlaygroundUsageData {
  plan: "trial" | "paid" | null;
  status: "active" | "trial" | "cancelled" | "past_due" | "inactive";
  today: {
    requestsUsed: number;
    requestsRemaining: number;
    requestsLimit: number;
  };
  last24h: {
    requests: number;
    successRate: number;
    avgLatencyMs: number | null;
  };
}

function emptyUsageData(): PlaygroundUsageData {
  return {
    plan: null,
    status: "inactive",
    today: {
      requestsUsed: 0,
      requestsRemaining: 0,
      requestsLimit: 0,
    },
    last24h: {
      requests: 0,
      successRate: 0,
      avgLatencyMs: null,
    },
  };
}

const REFRESH_WINDOW_HOURS = 5;
const REFRESH_WINDOW_MS = REFRESH_WINDOW_HOURS * 60 * 60 * 1000;

function getNextRefresh(now: Date): Date {
  const anchor = new Date(now);
  anchor.setHours(0, 0, 0, 0);
  const elapsed = now.getTime() - anchor.getTime();
  const windowsPassed = Math.floor(elapsed / REFRESH_WINDOW_MS);
  return new Date(anchor.getTime() + (windowsPassed + 1) * REFRESH_WINDOW_MS);
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

function toneClass(status: PlaygroundUsageData["status"]): string {
  if (status === "active" || status === "trial") return "text-emerald-200 border-emerald-400/40 bg-emerald-500/10";
  if (status === "past_due") return "text-amber-100 border-amber-400/40 bg-amber-500/10";
  return "text-slate-200 border-slate-400/30 bg-slate-500/10";
}

export default function PlaygroundDashboardPage() {
  const [data, setData] = useState<PlaygroundUsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState<string | null>(null);
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const [checkoutPlan, setCheckoutPlan] = useState<"starter" | "builder" | "studio" | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/me/playground-usage", { credentials: "include", cache: "no-store" });
      if (!res.ok) {
        setData(emptyUsageData());
        setWarning("Live signal is temporarily unavailable. Showing a soft snapshot.");
        return;
      }
      const json = (await res.json()) as PlaygroundUsageData;
      setData(json);
      setWarning(null);
    } catch {
      setData(emptyUsageData());
      setWarning("Network drift detected. Showing a soft snapshot.");
    } finally {
      setLoading(false);
    }
  }, []);

  const startCheckout = useCallback(
    async (tier: "starter" | "builder" | "studio") => {
      setCheckoutPlan(tier);
      setCheckoutError(null);
      try {
        const res = await fetch("/api/v1/me/playground-checkout", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tier, billing }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: { url?: string };
          message?: string;
        };

        if (!res.ok || !json.success || !json.data?.url) {
          setCheckoutError(json.message || "Could not start checkout. Please try again.");
          return;
        }

        window.location.href = json.data.url;
      } catch {
        setCheckoutError("Could not start checkout. Please check your connection and retry.");
      } finally {
        setCheckoutPlan(null);
      }
    },
    [billing]
  );

  useEffect(() => {
    load();
    const refreshPoll = setInterval(load, 60_000);
    const clockTick = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => {
      clearInterval(refreshPoll);
      clearInterval(clockTick);
    };
  }, [load]);

  const nextRefresh = useMemo(() => getNextRefresh(new Date(nowMs)), [nowMs]);
  const countdown = formatCountdown(nextRefresh.getTime() - nowMs);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-56 rounded-2xl bg-white/[0.04] animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-white/[0.04] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="agent-card p-8 text-center">
        <p className="text-sm text-[var(--text-secondary)]">Unable to load Playground details.</p>
        <button
          onClick={load}
          className="mt-3 inline-flex items-center rounded-xl border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-primary)] hover:bg-white/[0.04]"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {warning && (
        <div className="agent-card p-4 text-sm text-amber-200 border border-amber-400/30 bg-amber-500/10">
          {warning}
        </div>
      )}

      <section className="relative overflow-hidden rounded-3xl border border-fuchsia-300/20 bg-[radial-gradient(circle_at_15%_15%,rgba(45,212,191,0.16),transparent_42%),radial-gradient(circle_at_82%_0%,rgba(59,130,246,0.2),transparent_42%),linear-gradient(140deg,#090a12,#0c1020)] p-5 sm:p-6">
        <div className="absolute -top-20 right-0 h-48 w-48 rounded-full bg-cyan-400/15 blur-3xl" aria-hidden />
        <div className="relative">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-100/80">Playground AI Access</p>
              <h2 className="mt-1 text-xl sm:text-2xl font-semibold text-white">Start your 2-day paid trial</h2>
              <p className="mt-1 text-sm text-slate-300">Unlock VS Code extension access, API routing, and higher limits.</p>
            </div>
            <div className="inline-flex rounded-xl border border-cyan-200/30 bg-black/35 p-1">
              <button
                onClick={() => setBilling("monthly")}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${billing === "monthly" ? "bg-cyan-500 text-white" : "text-slate-300 hover:text-white"}`}
                aria-label="Use monthly pricing"
              >
                Monthly
              </button>
              <button
                onClick={() => setBilling("yearly")}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${billing === "yearly" ? "bg-cyan-500 text-white" : "text-slate-300 hover:text-white"}`}
                aria-label="Use yearly pricing"
              >
                Yearly
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { tier: "starter" as const, name: "Starter", monthly: "$2", yearly: "$20", note: "Great for solo testing" },
              { tier: "builder" as const, name: "Builder", monthly: "$5", yearly: "$50", note: "Most chosen for daily coding" },
              { tier: "studio" as const, name: "Studio", monthly: "$10", yearly: "$100", note: "Teams and heavier workloads" },
            ].map((plan) => (
              <div key={plan.tier} className={`rounded-2xl border p-4 ${plan.tier === "builder" ? "border-cyan-300/50 bg-cyan-500/10" : "border-white/15 bg-black/25"}`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-white">{plan.name}</h3>
                  {plan.tier === "builder" ? (
                    <span className="rounded-full border border-cyan-200/40 bg-cyan-500/20 px-2 py-0.5 text-[10px] uppercase tracking-wider text-cyan-100">Most chosen</span>
                  ) : null}
                </div>
                <p className="mt-2 text-2xl font-semibold text-white tabular-nums">{billing === "monthly" ? plan.monthly : plan.yearly}</p>
                <p className="mt-1 text-xs text-slate-300">{billing === "monthly" ? "per month" : "per year"} after trial</p>
                <p className="mt-3 text-xs text-slate-300">{plan.note}</p>
                <button
                  onClick={() => startCheckout(plan.tier)}
                  disabled={checkoutPlan !== null}
                  className="mt-4 w-full rounded-xl bg-cyan-500 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-400 disabled:opacity-60"
                >
                  {checkoutPlan === plan.tier ? "Starting checkout..." : "Start 2-Day Trial"}
                </button>
              </div>
            ))}
          </div>

          <p className="mt-3 text-xs text-cyan-100/80">
            2-day trial on every plan with the same trial quota (30 requests/day, 8K context, 256 max output).
            Free dashboard plan API keys cannot be used in the Playground API.
          </p>
          <p className="mt-1 text-xs text-cyan-100/80">
            Card is collected during checkout. Subscription billing starts on day 3 unless canceled before trial ends.
          </p>
          {checkoutError ? <p className="mt-2 text-xs text-rose-300">{checkoutError}</p> : null}
        </div>
      </section>

      <section className="relative overflow-hidden rounded-3xl border border-sky-300/20 bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.2),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(14,165,233,0.24),transparent_40%),linear-gradient(145deg,#090f18,#0a111d)] p-6 sm:p-8">
        <div className="absolute -top-20 -right-16 h-56 w-56 rounded-full bg-cyan-400/15 blur-3xl" aria-hidden />
        <div className="absolute -bottom-16 -left-14 h-48 w-48 rounded-full bg-sky-500/10 blur-3xl" aria-hidden />

        <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-6 items-end">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-100/80">Playground Rhythm</p>
            <h1 className="mt-2 text-3xl sm:text-4xl font-semibold text-white font-display leading-tight">
              Refresh Cycle: Every 5 Hours
            </h1>
            <p className="mt-3 max-w-xl text-sm text-slate-300">
              This view is intentionally light. Check the window, keep your flow, and let the cycle do the rest.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs uppercase tracking-wide ${toneClass(data.status)}`}>
                {data.status.replaceAll("_", " ")}
              </span>
              <span className="rounded-full border border-cyan-300/35 bg-cyan-500/10 px-3 py-1 text-xs uppercase tracking-wide text-cyan-100">
                plan {data.plan ?? "none"}
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-cyan-300/30 bg-black/30 p-5 backdrop-blur-sm">
            <p className="text-xs uppercase tracking-wider text-cyan-100/80">Next refresh in</p>
            <p className="mt-2 text-4xl sm:text-5xl font-semibold tabular-nums text-white">{countdown}</p>
            <p className="mt-2 text-xs text-slate-300">
              {nextRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} local window
            </p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="agent-card p-5">
          <p className="text-xs uppercase tracking-wider text-[var(--dash-text-secondary)]">Cycle pressure</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)] tabular-nums">
            {data.today.requestsUsed.toLocaleString()}
          </p>
          <p className="mt-2 text-sm text-[var(--text-tertiary)]">Moves logged in the current day</p>
        </div>
        <div className="agent-card p-5">
          <p className="text-xs uppercase tracking-wider text-[var(--dash-text-secondary)]">Flow reserve</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)] tabular-nums">
            {data.today.requestsRemaining.toLocaleString()}
          </p>
          <p className="mt-2 text-sm text-[var(--text-tertiary)]">Remaining runway before daily reset</p>
        </div>
        <div className="agent-card p-5">
          <p className="text-xs uppercase tracking-wider text-[var(--dash-text-secondary)]">Signal quality</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-300 tabular-nums">
            {(data.last24h.successRate * 100).toFixed(0)}%
          </p>
          <p className="mt-2 text-sm text-[var(--text-tertiary)]">
            Last 24h, soft read
            {data.last24h.avgLatencyMs == null ? "" : ` • ${Math.round(data.last24h.avgLatencyMs)} ms`}
          </p>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="agent-card p-5 xl:col-span-2">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Minimal usage guidance</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              "Push when the window feels right.",
              "Watch the clock more than the details.",
              "Treat this as pulse, not precision.",
            ].map((line) => (
              <div key={line} className="rounded-xl border border-[var(--dash-divider)] bg-[var(--bg-elevated)] p-3 text-sm text-[var(--text-secondary)]">
                {line}
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/playground" className="rounded-xl bg-cyan-500 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-500/90">
              Open Playground
            </Link>
          </div>
        </div>

        <div className="xl:col-span-1">
          <ApiKeySection />
        </div>
      </section>
    </div>
  );
}
