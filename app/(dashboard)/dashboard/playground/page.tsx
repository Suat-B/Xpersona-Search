"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiKeySection } from "@/components/dashboard/ApiKeySection";

type SubscriptionStatus = "active" | "trial" | "cancelled" | "past_due" | "inactive";

interface PlaygroundUsageData {
  plan: "trial" | "starter" | "builder" | "studio" | null;
  status: SubscriptionStatus;
  trial?: {
    endsAt: string;
    isActive: boolean;
  } | null;
  billing?: {
    currentPeriodEndsAt: string;
    cancelAtPeriodEnd: boolean;
  } | null;
  limits: {
    contextHardCap: number;
    maxInputTokensPerRequest: number;
    maxOutputTokens: number;
    maxRequestsPerCycle: number;
    maxTotalTokensPerCycle: number;
    maxTotalTokensPerMonth: number;
  } | null;
  today: {
    requestsUsed: number;
    requestsRemaining: number;
    requestsLimit: number;
  };
  thisMonth: {
    tokensInput?: number;
    tokensOutput: number;
    tokensTotal?: number;
    tokensRemaining: number;
    tokensLimit: number;
    estimatedCostUsd?: number;
  };
  cycle: {
    requestsUsed: number;
    requestsRemaining: number;
    requestsLimit: number;
    tokensOutput: number;
    tokensRemaining: number;
    tokensLimit: number;
    estimatedCostUsd?: number;
    startsAt: string;
    endsAt: string;
  };
  last24h: {
    requests: number;
    successRate: number;
    avgLatencyMs: number | null;
  };
  statusBreakdown?: {
    success: number;
    error: number;
    rateLimited: number;
    quotaExceeded: number;
    validationError: number;
  };
  topModels?: Array<{
    model: string;
    requests: number;
    tokensOutput: number;
  }>;
  cycleTopModels?: Array<{
    model: string;
    requests: number;
    tokensOutput: number;
  }>;
  nextResetAt?: string;
}

function emptyUsageData(): PlaygroundUsageData {
  return {
    plan: null,
    status: "inactive",
    trial: null,
    billing: null,
    limits: null,
    today: {
      requestsUsed: 0,
      requestsRemaining: 0,
      requestsLimit: 0,
    },
    thisMonth: {
      tokensOutput: 0,
      tokensRemaining: 0,
      tokensLimit: 0,
      estimatedCostUsd: 0,
    },
    cycle: {
      requestsUsed: 0,
      requestsRemaining: 0,
      requestsLimit: 0,
      tokensOutput: 0,
      tokensRemaining: 0,
      tokensLimit: 0,
      estimatedCostUsd: 0,
      startsAt: new Date().toISOString(),
      endsAt: new Date().toISOString(),
    },
    last24h: {
      requests: 0,
      successRate: 0,
      avgLatencyMs: null,
    },
    statusBreakdown: {
      success: 0,
      error: 0,
      rateLimited: 0,
      quotaExceeded: 0,
      validationError: 0,
    },
    topModels: [],
    cycleTopModels: [],
    nextResetAt: undefined,
  };
}

function toneClass(status: SubscriptionStatus): string {
  if (status === "active" || status === "trial") return "text-emerald-200 border-emerald-400/40 bg-emerald-500/10";
  if (status === "past_due") return "text-amber-100 border-amber-400/40 bg-amber-500/10";
  return "text-slate-200 border-slate-400/30 bg-slate-500/10";
}

function pct(used: number, limit: number): number {
  if (!limit || limit <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((used / limit) * 100)));
}

function formatReset(resetIso?: string | null): string {
  if (!resetIso) return "--";
  const d = new Date(resetIso);
  if (Number.isNaN(d.getTime())) return "--";
  return d.toLocaleString([], {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(iso?: string | null): string {
  if (!iso) return "--";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--";
  return d.toLocaleDateString([], {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

export default function PlaygroundDashboardPage() {
  const [data, setData] = useState<PlaygroundUsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState<string | null>(null);
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const [checkoutPlan, setCheckoutPlan] = useState<"starter" | "builder" | "studio" | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [subscriptionAction, setSubscriptionAction] = useState<"portal" | "cancel" | "resume" | null>(null);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/me/playground-usage", { credentials: "include", cache: "no-store" });
      if (!res.ok) {
        setData(emptyUsageData());
        setWarning("Live usage feed is temporarily unavailable. Showing a safe fallback snapshot.");
        return;
      }
      const json = (await res.json()) as PlaygroundUsageData;
      setData(json);
      setWarning(null);
    } catch {
      setData(emptyUsageData());
      setWarning("Network issue while loading usage. Showing fallback snapshot.");
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

  const manageSubscription = useCallback(
    async (action: "portal" | "cancel" | "resume") => {
      setSubscriptionAction(action);
      setSubscriptionError(null);

      try {
        const res = await fetch("/api/v1/me/playground-subscription", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: { url?: string };
          message?: string;
        };

        if (!res.ok || !json.success) {
          setSubscriptionError(json.message || "Could not update subscription. Please try again.");
          return;
        }

        if (action === "portal" && json.data?.url) {
          window.location.href = json.data.url;
          return;
        }

        await load();
      } catch {
        setSubscriptionError("Could not update subscription. Please try again.");
      } finally {
        setSubscriptionAction(null);
      }
    },
    [load]
  );

  useEffect(() => {
    load();
    const refreshPoll = setInterval(load, 60_000);
    return () => clearInterval(refreshPoll);
  }, [load]);

  const usage = data ?? emptyUsageData();
  const nextFiveHourReset = useMemo(
    () => formatReset(usage.nextResetAt ?? usage.cycle?.endsAt),
    [usage.nextResetAt, usage.cycle?.endsAt]
  );

  const dailyUsedPct = useMemo(() => pct(usage.cycle.requestsUsed, usage.cycle.requestsLimit), [usage.cycle.requestsUsed, usage.cycle.requestsLimit]);
  const monthlyUsedPct = useMemo(() => pct(usage.cycle.tokensOutput, usage.cycle.tokensLimit), [usage.cycle.tokensOutput, usage.cycle.tokensLimit]);
  const modelTotals = useMemo(() => {
    const list = usage.cycleTopModels ?? [];
    return list.reduce(
      (acc, item) => {
        acc.requests += item.requests;
        acc.tokens += item.tokensOutput;
        return acc;
      },
      { requests: 0, tokens: 0 }
    );
  }, [usage.topModels]);

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

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <section className="relative overflow-hidden rounded-3xl border border-cyan-300/30 bg-[radial-gradient(circle_at_12%_18%,rgba(34,211,238,0.25),transparent_42%),radial-gradient(circle_at_88%_0%,rgba(59,130,246,0.24),transparent_42%),linear-gradient(135deg,#070b16,#0b1120)] p-5 sm:p-7">
        <div className="pointer-events-none absolute -top-24 left-[-4rem] h-56 w-56 rounded-full bg-cyan-400/20 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-24 right-[-2rem] h-56 w-56 rounded-full bg-blue-500/15 blur-3xl" aria-hidden />

        <div className="relative grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-6 items-start">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-100/80">Instant API Generator</p>
            <h1 className="mt-2 text-3xl sm:text-4xl font-semibold text-white leading-tight">
              Create your Playground API key in seconds
            </h1>
            <p className="mt-3 max-w-xl text-sm text-slate-300">
              Ship faster with a key-ready setup at the top of your workflow. Generate, copy, and plug into your agents without leaving this page.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-cyan-200/35 bg-cyan-500/15 px-3 py-1 text-[11px] uppercase tracking-wide text-cyan-100">
                5-hour reset ready
              </span>
              <span className="rounded-full border border-emerald-200/35 bg-emerald-500/15 px-3 py-1 text-[11px] uppercase tracking-wide text-emerald-100">
                AI integration friendly
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-cyan-300/35 bg-black/35 p-4 sm:p-5 backdrop-blur-sm">
            <ApiKeySection />
          </div>
        </div>
      </section>

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
              <h2 className="mt-1 text-xl sm:text-2xl font-semibold text-white">Start your 2-day free trial</h2>
              <p className="mt-1 text-sm text-slate-300">Track usage in real time with a 5-hour reset rhythm for fast feedback loops.</p>
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
              { tier: "starter" as const, name: "Starter", monthly: "$2", yearly: "$20", note: "300 requests per 5-hour cycle after trial" },
              { tier: "builder" as const, name: "Builder", monthly: "$5", yearly: "$50", note: "1,000 requests per 5-hour cycle after trial" },
              { tier: "studio" as const, name: "Studio", monthly: "$10", yearly: "$100", note: "3,000 requests per 5-hour cycle after trial" },
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
                  {checkoutPlan === plan.tier ? "Starting checkout..." : "Start Free Trial"}
                </button>
              </div>
            ))}
          </div>

          <p className="mt-3 text-xs text-cyan-100/80">
            Trial cycle: 30 requests per reset window, 8K context, 256 max output. Paid packages: Starter 300 requests per
            cycle, Builder 1,000 requests per cycle, Studio 3,000 requests per cycle (16K context, 512 max output).
          </p>
          {checkoutError ? <p className="mt-2 text-xs text-rose-300">{checkoutError}</p> : null}
        </div>
      </section>

      <section className="relative overflow-hidden rounded-3xl border border-sky-300/20 bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.2),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(14,165,233,0.24),transparent_40%),linear-gradient(145deg,#090f18,#0a111d)] p-6 sm:p-8">
        <div className="absolute -top-20 -right-16 h-56 w-56 rounded-full bg-cyan-400/15 blur-3xl" aria-hidden />
        <div className="absolute -bottom-16 -left-14 h-48 w-48 rounded-full bg-sky-500/10 blur-3xl" aria-hidden />

        <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-100/80">5-Hour Reset Overview</p>
            <h1 className="mt-2 text-3xl sm:text-4xl font-semibold text-white font-display leading-tight">
              Playground Usage by Reset Cycle
            </h1>
            <p className="mt-3 max-w-xl text-sm text-slate-300">
              Stay within your plan by watching request and token usage in each 5-hour reset cycle.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs uppercase tracking-wide ${toneClass(usage.status)}`}>
                {usage.status.replaceAll("_", " ")}
              </span>
              <span className="rounded-full border border-cyan-300/35 bg-cyan-500/10 px-3 py-1 text-xs uppercase tracking-wide text-cyan-100">
                plan {usage.plan ?? "none"}
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-cyan-300/30 bg-black/30 p-5 backdrop-blur-sm space-y-4">
            <div>
              <div className="flex items-center justify-between text-xs uppercase tracking-wider text-cyan-100/80">
                <span>Cycle requests used</span>
                <span>{usage.cycle.requestsUsed}/{usage.cycle.requestsLimit}</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full bg-cyan-400" style={{ width: `${dailyUsedPct}%` }} />
              </div>
              <p className="mt-1 text-xs text-slate-300">{dailyUsedPct}% used - {usage.cycle.requestsRemaining} remaining this cycle</p>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs uppercase tracking-wider text-cyan-100/80">
                <span>Cycle output tokens used</span>
                <span>{usage.cycle.tokensOutput.toLocaleString()}/{usage.cycle.tokensLimit.toLocaleString()}</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full bg-emerald-400" style={{ width: `${monthlyUsedPct}%` }} />
              </div>
              <p className="mt-1 text-xs text-slate-300">{monthlyUsedPct}% used - {usage.cycle.tokensRemaining.toLocaleString()} tokens remaining in cycle view</p>
            </div>

            <p className="text-xs text-slate-300">
              Next 5-hour reset: {nextFiveHourReset}
            </p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="agent-card p-5">
          <p className="text-xs uppercase tracking-wider text-[var(--dash-text-secondary)]">Cycle used</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)] tabular-nums">{usage.cycle.requestsUsed.toLocaleString()}</p>
          <p className="mt-2 text-sm text-[var(--text-tertiary)]">Requests consumed this cycle</p>
        </div>
        <div className="agent-card p-5">
          <p className="text-xs uppercase tracking-wider text-[var(--dash-text-secondary)]">Cycle remaining</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)] tabular-nums">{usage.cycle.requestsRemaining.toLocaleString()}</p>
          <p className="mt-2 text-sm text-[var(--text-tertiary)]">Requests left before 5-hour reset</p>
        </div>
        <div className="agent-card p-5">
          <p className="text-xs uppercase tracking-wider text-[var(--dash-text-secondary)]">Cycle tokens used</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)] tabular-nums">{usage.cycle.tokensOutput.toLocaleString()}</p>
          <p className="mt-2 text-sm text-[var(--text-tertiary)]">Output tokens consumed in cycle view</p>
        </div>
        <div className="agent-card p-5">
          <p className="text-xs uppercase tracking-wider text-[var(--dash-text-secondary)]">Cycle tokens remaining</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)] tabular-nums">{usage.cycle.tokensRemaining.toLocaleString()}</p>
          <p className="mt-2 text-sm text-[var(--text-tertiary)]">Tokens available in cycle view</p>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="agent-card p-5 xl:col-span-2">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Usage Health</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--dash-divider)] bg-[var(--bg-elevated)] p-3 text-sm text-[var(--text-secondary)]">
              <p className="text-xs uppercase tracking-wider text-[var(--dash-text-secondary)]">Success rate (24h)</p>
              <p className="mt-2 text-xl font-semibold text-emerald-300">{(usage.last24h.successRate * 100).toFixed(0)}%</p>
            </div>
            <div className="rounded-xl border border-[var(--dash-divider)] bg-[var(--bg-elevated)] p-3 text-sm text-[var(--text-secondary)]">
              <p className="text-xs uppercase tracking-wider text-[var(--dash-text-secondary)]">Avg latency (24h)</p>
              <p className="mt-2 text-xl font-semibold text-[var(--text-primary)] tabular-nums">
                {usage.last24h.avgLatencyMs == null ? "--" : `${Math.round(usage.last24h.avgLatencyMs)} ms`}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-5">
            <div className="rounded-xl border border-[var(--dash-divider)] bg-[var(--bg-elevated)] p-3 text-xs text-[var(--text-secondary)]">
              Success: {(usage.statusBreakdown?.success ?? 0).toLocaleString()}
            </div>
            <div className="rounded-xl border border-[var(--dash-divider)] bg-[var(--bg-elevated)] p-3 text-xs text-[var(--text-secondary)]">
              Errors: {(usage.statusBreakdown?.error ?? 0).toLocaleString()}
            </div>
            <div className="rounded-xl border border-[var(--dash-divider)] bg-[var(--bg-elevated)] p-3 text-xs text-[var(--text-secondary)]">
              Rate limited: {(usage.statusBreakdown?.rateLimited ?? 0).toLocaleString()}
            </div>
            <div className="rounded-xl border border-[var(--dash-divider)] bg-[var(--bg-elevated)] p-3 text-xs text-[var(--text-secondary)]">
              Limit exceeded: {(usage.statusBreakdown?.quotaExceeded ?? 0).toLocaleString()}
            </div>
            <div className="rounded-xl border border-[var(--dash-divider)] bg-[var(--bg-elevated)] p-3 text-xs text-[var(--text-secondary)]">
              Validation errors: {(usage.statusBreakdown?.validationError ?? 0).toLocaleString()}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/playground" className="rounded-xl bg-cyan-500 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-500/90">
              Open Playground
            </Link>
          </div>
        </div>

        <div className="xl:col-span-1 space-y-4">
          <div className="agent-card p-5">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Manage Subscription</h3>
            <div className="mt-3 space-y-2">
              <div className="rounded-xl border border-[var(--dash-divider)] bg-[var(--bg-elevated)] p-3 text-xs text-[var(--text-secondary)]">
                <p>Status: <span className="font-medium text-[var(--text-primary)]">{usage.status.replaceAll("_", " ")}</span></p>
                <p className="mt-1">Plan: <span className="font-medium text-[var(--text-primary)]">{usage.plan ?? "none"}</span></p>
                <p className="mt-1">
                  Renewal date:{" "}
                  <span className="font-medium text-[var(--text-primary)]">{formatDate(usage.billing?.currentPeriodEndsAt)}</span>
                </p>
                {usage.billing?.cancelAtPeriodEnd ? (
                  <p className="mt-1 text-amber-300">
                    Cancellation scheduled for {formatDate(usage.billing.currentPeriodEndsAt)}.
                  </p>
                ) : null}
                {usage.trial?.isActive ? (
                  <p className="mt-1 text-cyan-200">
                    Trial ends on {formatDate(usage.trial.endsAt)}.
                  </p>
                ) : null}
              </div>

              <button
                onClick={() => manageSubscription("portal")}
                disabled={subscriptionAction !== null || usage.plan == null}
                className="w-full rounded-xl border border-cyan-300/40 bg-cyan-500/10 px-3 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-60"
              >
                {subscriptionAction === "portal" ? "Opening billing portal..." : "Manage Billing"}
              </button>

              {usage.billing?.cancelAtPeriodEnd ? (
                <button
                  onClick={() => manageSubscription("resume")}
                  disabled={subscriptionAction !== null}
                  className="w-full rounded-xl border border-emerald-300/40 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-60"
                >
                  {subscriptionAction === "resume" ? "Resuming..." : "Resume Renewal"}
                </button>
              ) : (
                <button
                  onClick={() => manageSubscription("cancel")}
                  disabled={subscriptionAction !== null || usage.plan == null}
                  className="w-full rounded-xl border border-rose-300/40 bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-100 hover:bg-rose-500/20 disabled:opacity-60"
                >
                  {subscriptionAction === "cancel" ? "Scheduling cancellation..." : "Cancel at Period End"}
                </button>
              )}
              {subscriptionError ? <p className="text-xs text-rose-300">{subscriptionError}</p> : null}
            </div>
          </div>

          <div className="agent-card p-5">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Model in current cycle</h3>
            <div className="mt-3 space-y-2">
              <div className="rounded-xl border border-[var(--dash-divider)] bg-[var(--bg-elevated)] p-3">
                <p className="text-xs text-[var(--text-secondary)] break-all">Playground AI</p>
                <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                  {modelTotals.requests.toLocaleString()} req - {modelTotals.tokens.toLocaleString()} tokens
                </p>
              </div>
            </div>
          </div>

          <ApiKeySection />
        </div>
      </section>
    </div>
  );
}
