"use client";

import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { ApiKeySection } from "@/components/dashboard/ApiKeySection";
import { cn } from "@/lib/utils";

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

function GlassCard({
  children,
  className,
  glow = "cyan",
}: {
  children: ReactNode;
  className?: string;
  glow?: "cyan" | "fuchsia" | "emerald" | "amber" | "slate";
}) {
  const glowClass =
    glow === "emerald"
      ? "bg-[radial-gradient(circle_at_15%_20%,rgba(16,185,129,0.22),transparent_55%),radial-gradient(circle_at_85%_0%,rgba(34,211,238,0.14),transparent_50%)]"
      : glow === "fuchsia"
        ? "bg-[radial-gradient(circle_at_15%_15%,rgba(217,70,239,0.18),transparent_55%),radial-gradient(circle_at_85%_0%,rgba(56,189,248,0.18),transparent_55%)]"
        : glow === "amber"
          ? "bg-[radial-gradient(circle_at_18%_25%,rgba(245,158,11,0.22),transparent_55%),radial-gradient(circle_at_85%_0%,rgba(56,189,248,0.14),transparent_55%)]"
          : glow === "slate"
            ? "bg-[radial-gradient(circle_at_25%_20%,rgba(148,163,184,0.18),transparent_60%),radial-gradient(circle_at_85%_0%,rgba(56,189,248,0.12),transparent_55%)]"
            : "bg-[radial-gradient(circle_at_18%_25%,rgba(34,211,238,0.22),transparent_55%),radial-gradient(circle_at_85%_0%,rgba(59,130,246,0.18),transparent_55%)]";

  return (
    <div className={cn("neural-glass relative overflow-hidden rounded-3xl", className)}>
      <div className={cn("pointer-events-none absolute inset-0 opacity-90", glowClass)} aria-hidden />
      <div className="relative">{children}</div>
    </div>
  );
}

function MetricTile({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-sm transition hover:bg-white/[0.05]",
        className
      )}
    >
      <div
        className="pointer-events-none absolute -right-20 -top-20 h-44 w-44 rounded-full bg-cyan-400/10 blur-3xl opacity-70 transition-opacity group-hover:opacity-100"
        aria-hidden
      />
      <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--text-tertiary)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--text-primary)]">{value}</p>
      {hint ? <p className="mt-2 text-sm text-[var(--text-secondary)]">{hint}</p> : null}
    </div>
  );
}

function ProgressRow({
  label,
  usedLabel,
  pctValue,
  tone = "cyan",
  footer,
}: {
  label: string;
  usedLabel: string;
  pctValue: number;
  tone?: "cyan" | "emerald";
  footer?: ReactNode;
}) {
  const barClass = tone === "emerald" ? "bg-emerald-400" : "bg-cyan-400";
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--text-tertiary)]">{label}</p>
        <p className="text-xs tabular-nums text-[var(--text-secondary)]">{usedLabel}</p>
      </div>
      <div className="mt-3 h-2.5 rounded-full bg-white/10 overflow-hidden">
        <div className={cn("h-full rounded-full transition-[width] duration-500", barClass)} style={{ width: `${pctValue}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-[var(--text-secondary)]">
        <span className="tabular-nums">{pctValue}% used</span>
        {footer ? <span className="tabular-nums">{footer}</span> : null}
      </div>
    </div>
  );
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
  }, [usage.cycleTopModels]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-44 rounded-3xl bg-white/[0.04] animate-pulse" />
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-6">
            <div className="h-56 rounded-3xl bg-white/[0.04] animate-pulse" />
            <div className="h-56 rounded-3xl bg-white/[0.04] animate-pulse" />
            <div className="h-64 rounded-3xl bg-white/[0.04] animate-pulse" />
          </div>
          <div className="space-y-6">
            <div className="h-56 rounded-3xl bg-white/[0.04] animate-pulse" />
            <div className="h-56 rounded-3xl bg-white/[0.04] animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative space-y-6 animate-in fade-in duration-300">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="absolute -top-48 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute -top-24 right-[-7rem] h-[520px] w-[520px] rounded-full bg-fuchsia-500/10 blur-3xl" />
        <div className="absolute -bottom-40 left-[-10rem] h-[560px] w-[560px] rounded-full bg-sky-400/10 blur-3xl" />
        <div className="absolute inset-0 opacity-[0.14] bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.06)_1px,transparent_0)] [background-size:26px_26px]" />
      </div>
      <GlassCard className="p-6 sm:p-8" glow="fuchsia">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
              Dashboard • Playground
            </p>
            <h1 className="mt-2 text-3xl sm:text-4xl font-semibold leading-tight text-[var(--text-primary)]">
              <span className="bg-gradient-to-r from-cyan-200 via-sky-200 to-fuchsia-200 bg-clip-text text-transparent">
                Keys, usage, and billing
              </span>{" "}
              in one place
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-[var(--text-secondary)]">
              Generate your API key, monitor the current reset cycle, and manage your subscription.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-3 py-1 text-xs uppercase tracking-wide",
                  toneClass(usage.status)
                )}
              >
                {usage.status.replaceAll("_", " ")}
              </span>
              <span className="inline-flex items-center rounded-full border border-white/12 bg-white/[0.03] px-3 py-1 text-xs uppercase tracking-wide text-[var(--text-secondary)]">
                plan {usage.plan ?? "none"}
              </span>
              <span className="inline-flex items-center rounded-full border border-white/12 bg-white/[0.03] px-3 py-1 text-xs uppercase tracking-wide text-[var(--text-secondary)]">
                next reset {nextFiveHourReset}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/playground"
              className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-cyan-500 to-sky-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition hover:from-cyan-400 hover:to-sky-400 active:scale-[0.98]"
            >
              Open Playground
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-xl border border-white/12 bg-white/[0.03] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-white/[0.06] active:scale-[0.98]"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </GlassCard>

      {warning ? (
        <GlassCard className="p-4" glow="amber">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 h-2.5 w-2.5 rounded-full bg-amber-300 shadow-[0_0_0_6px_rgba(245,158,11,0.14)]" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-medium text-amber-100">Heads up</p>
              <p className="mt-1 text-sm text-amber-100/80">{warning}</p>
            </div>
          </div>
        </GlassCard>
      ) : null}

      <GlassCard className="p-6 sm:p-7" glow="fuchsia">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--text-tertiary)]">Playground AI Access</p>
              <h2 className="mt-2 text-xl sm:text-2xl font-semibold text-[var(--text-primary)]">Start your free trial</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">Choose a billing cadence and get to building.</p>
            </div>
            <div className="inline-flex rounded-2xl border border-white/12 bg-white/[0.03] p-1">
              <button
                onClick={() => setBilling("monthly")}
                className={cn(
                  "rounded-xl px-3 py-2 text-xs font-semibold transition",
                  billing === "monthly" ? "bg-cyan-500 text-white shadow shadow-cyan-500/20" : "text-[var(--text-secondary)] hover:text-white"
                )}
                aria-label="Use monthly pricing"
              >
                Monthly
              </button>
              <button
                onClick={() => setBilling("yearly")}
                className={cn(
                  "rounded-xl px-3 py-2 text-xs font-semibold transition",
                  billing === "yearly" ? "bg-cyan-500 text-white shadow shadow-cyan-500/20" : "text-[var(--text-secondary)] hover:text-white"
                )}
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
              <div
                key={plan.tier}
                className={cn(
                  "relative overflow-hidden rounded-3xl border p-5",
                  plan.tier === "builder"
                    ? "border-cyan-300/40 bg-[linear-gradient(145deg,rgba(34,211,238,0.14),rgba(255,255,255,0.02))]"
                    : "border-white/10 bg-white/[0.02]"
                )}
              >
                <div className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-cyan-400/15 blur-3xl" aria-hidden />
                <div className="relative">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-white">{plan.name}</h3>
                  {plan.tier === "builder" ? (
                    <span className="rounded-full border border-cyan-200/40 bg-cyan-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-100">Most chosen</span>
                  ) : null}
                </div>
                <p className="mt-2 text-2xl font-semibold text-white tabular-nums">{billing === "monthly" ? plan.monthly : plan.yearly}</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">{billing === "monthly" ? "per month" : "per year"} after trial</p>
                <p className="mt-3 text-xs text-[var(--text-secondary)]">{plan.note}</p>
                <button
                  onClick={() => startCheckout(plan.tier)}
                  disabled={checkoutPlan !== null}
                  className={cn(
                    "mt-5 w-full rounded-2xl px-4 py-2.5 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-60",
                    plan.tier === "builder"
                      ? "bg-gradient-to-r from-cyan-500 to-sky-500 hover:from-cyan-400 hover:to-sky-400 shadow-lg shadow-cyan-500/15"
                      : "bg-white/[0.06] hover:bg-white/[0.1] border border-white/10"
                  )}
                >
                  {checkoutPlan === plan.tier ? "Starting checkout..." : "Start Free Trial"}
                </button>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-4 text-xs text-[var(--text-secondary)]">
            Trial cycle: 30 requests per reset window, 8K context, 256 max output. Paid packages: Starter 300 requests per
            cycle, Builder 1,000 requests per cycle, Studio 3,000 requests per cycle (16K context, 512 max output).
          </p>
          {checkoutError ? <p className="mt-2 text-xs text-rose-200">{checkoutError}</p> : null}
        </div>
      </GlassCard>

      <GlassCard className="p-6 sm:p-8" glow="cyan">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--text-tertiary)]">Reset Cycle</p>
            <h2 className="mt-2 text-2xl sm:text-3xl font-semibold text-[var(--text-primary)]">Usage overview</h2>
            <p className="mt-2 max-w-xl text-sm text-[var(--text-secondary)]">
              Requests and tokens inside the current 5‑hour window.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className={cn("rounded-full border px-3 py-1 text-xs uppercase tracking-wide", toneClass(usage.status))}>
                {usage.status.replaceAll("_", " ")}
              </span>
              <span className="rounded-full border border-white/12 bg-white/[0.03] px-3 py-1 text-xs uppercase tracking-wide text-[var(--text-secondary)]">
                plan {usage.plan ?? "none"}
              </span>
              <span className="rounded-full border border-white/12 bg-white/[0.03] px-3 py-1 text-xs uppercase tracking-wide text-[var(--text-secondary)]">
                next reset {nextFiveHourReset}
              </span>
            </div>
            <div className="mt-5 rounded-2xl border border-white/12 bg-white/[0.03] px-4 py-3 text-sm">
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--text-tertiary)]">Cycle</p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {formatReset(usage.cycle.startsAt)} → {formatReset(usage.cycle.endsAt)}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <ProgressRow
              label="Requests"
              usedLabel={`${usage.cycle.requestsUsed.toLocaleString()} / ${usage.cycle.requestsLimit.toLocaleString()}`}
              pctValue={dailyUsedPct}
              tone="cyan"
              footer={`${usage.cycle.requestsRemaining.toLocaleString()} remaining`}
            />
            <ProgressRow
              label="Output tokens"
              usedLabel={`${usage.cycle.tokensOutput.toLocaleString()} / ${usage.cycle.tokensLimit.toLocaleString()}`}
              pctValue={monthlyUsedPct}
              tone="emerald"
              footer={`${usage.cycle.tokensRemaining.toLocaleString()} remaining`}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <MetricTile label="Requests used" value={usage.cycle.requestsUsed.toLocaleString()} hint="This cycle" />
              <MetricTile label="Tokens used" value={usage.cycle.tokensOutput.toLocaleString()} hint="Output tokens" />
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--text-tertiary)]">Context cap</p>
            <p className="mt-1 text-sm font-semibold text-[var(--text-primary)] tabular-nums">
              {usage.limits?.contextHardCap?.toLocaleString?.() ?? "--"}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--text-tertiary)]">Max input</p>
            <p className="mt-1 text-sm font-semibold text-[var(--text-primary)] tabular-nums">
              {usage.limits?.maxInputTokensPerRequest?.toLocaleString?.() ?? "--"}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--text-tertiary)]">Max output</p>
            <p className="mt-1 text-sm font-semibold text-[var(--text-primary)] tabular-nums">
              {usage.limits?.maxOutputTokens?.toLocaleString?.() ?? "--"}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--text-tertiary)]">Req cap</p>
            <p className="mt-1 text-sm font-semibold text-[var(--text-primary)] tabular-nums">
              {usage.limits?.maxRequestsPerCycle?.toLocaleString?.() ?? "--"}
            </p>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="p-6" glow="slate">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--text-tertiary)]">At a glance</p>
            <h3 className="mt-2 text-lg font-semibold text-[var(--text-primary)]">Today and this month</h3>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">Fast sanity-check numbers.</p>
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricTile label="Today requests used" value={usage.today.requestsUsed.toLocaleString()} hint={`limit ${usage.today.requestsLimit.toLocaleString()}`} />
          <MetricTile label="Today requests remaining" value={usage.today.requestsRemaining.toLocaleString()} hint="resets every 5 hours" />
          <MetricTile label="Month tokens output" value={usage.thisMonth.tokensOutput.toLocaleString()} hint={`limit ${usage.thisMonth.tokensLimit.toLocaleString()}`} />
          <MetricTile label="Month tokens remaining" value={usage.thisMonth.tokensRemaining.toLocaleString()} hint="output tokens" />
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <GlassCard className="p-6 sm:p-7 xl:col-span-2" glow="emerald">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--text-tertiary)]">Health</p>
              <h2 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">Reliability and performance</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">A pulse check from the last 24 hours.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/playground"
                className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-cyan-500 to-sky-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/15 transition hover:from-cyan-400 hover:to-sky-400 active:scale-[0.98]"
              >
                Open Playground
              </Link>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <MetricTile label="Success rate (24h)" value={`${(usage.last24h.successRate * 100).toFixed(0)}%`} hint={`${usage.last24h.requests.toLocaleString()} requests`} />
            <MetricTile
              label="Avg latency (24h)"
              value={usage.last24h.avgLatencyMs == null ? "--" : `${Math.round(usage.last24h.avgLatencyMs)} ms`}
              hint="client-side avg"
            />
          </div>

          <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { label: "Success", value: usage.statusBreakdown?.success ?? 0, tone: "text-emerald-200" },
              { label: "Errors", value: usage.statusBreakdown?.error ?? 0, tone: "text-rose-200" },
              { label: "Rate limited", value: usage.statusBreakdown?.rateLimited ?? 0, tone: "text-amber-200" },
              { label: "Quota", value: usage.statusBreakdown?.quotaExceeded ?? 0, tone: "text-sky-200" },
              { label: "Validation", value: usage.statusBreakdown?.validationError ?? 0, tone: "text-slate-200" },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--text-tertiary)]">{item.label}</p>
                <p className={cn("mt-1 text-sm font-semibold tabular-nums", item.tone)}>{item.value.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </GlassCard>

        <div className="space-y-6">
          <GlassCard className="p-6" glow="cyan">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--text-tertiary)]">API Key</p>
                <h3 className="mt-2 text-lg font-semibold text-[var(--text-primary)]">Your Playground key</h3>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">Generate and copy safely.</p>
              </div>
              <div className="h-10 w-10 rounded-2xl border border-cyan-200/30 bg-cyan-500/10 flex items-center justify-center text-cyan-200" aria-hidden>
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <ApiKeySection compact />
            </div>
          </GlassCard>

          <GlassCard className="p-6" glow="slate">
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">Manage subscription</h3>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-[var(--text-secondary)]">
                <p>
                  Status: <span className="font-semibold text-[var(--text-primary)]">{usage.status.replaceAll("_", " ")}</span>
                </p>
                <p className="mt-1">
                  Plan: <span className="font-semibold text-[var(--text-primary)]">{usage.plan ?? "none"}</span>
                </p>
                <p className="mt-1">
                  Renewal date:{" "}
                  <span className="font-semibold text-[var(--text-primary)]">{formatDate(usage.billing?.currentPeriodEndsAt)}</span>
                </p>
                {usage.billing?.cancelAtPeriodEnd ? (
                  <p className="mt-2 text-amber-200">
                    Cancellation scheduled for {formatDate(usage.billing.currentPeriodEndsAt)}.
                  </p>
                ) : null}
                {usage.trial?.isActive ? <p className="mt-2 text-cyan-200">Trial ends on {formatDate(usage.trial.endsAt)}.</p> : null}
              </div>

              <button
                onClick={() => manageSubscription("portal")}
                disabled={subscriptionAction !== null || usage.plan == null}
                className="w-full rounded-2xl border border-white/12 bg-white/[0.03] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-white/[0.06] disabled:opacity-60 active:scale-[0.98]"
              >
                {subscriptionAction === "portal" ? "Opening billing portal..." : "Manage Billing"}
              </button>

              {usage.billing?.cancelAtPeriodEnd ? (
                <button
                  onClick={() => manageSubscription("resume")}
                  disabled={subscriptionAction !== null}
                  className="w-full rounded-2xl bg-emerald-500/10 border border-emerald-300/30 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15 disabled:opacity-60 active:scale-[0.98]"
                >
                  {subscriptionAction === "resume" ? "Resuming..." : "Resume Renewal"}
                </button>
              ) : (
                <button
                  onClick={() => manageSubscription("cancel")}
                  disabled={subscriptionAction !== null || usage.plan == null}
                  className="w-full rounded-2xl bg-rose-500/10 border border-rose-300/30 px-4 py-2.5 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/15 disabled:opacity-60 active:scale-[0.98]"
                >
                  {subscriptionAction === "cancel" ? "Scheduling cancellation..." : "Cancel at Period End"}
                </button>
              )}

              {subscriptionError ? <p className="text-xs text-rose-200">{subscriptionError}</p> : null}
            </div>
          </GlassCard>

          <GlassCard className="p-6" glow="cyan">
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">Top models (cycle)</h3>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {modelTotals.requests.toLocaleString()} req • {modelTotals.tokens.toLocaleString()} tokens
            </p>
            <div className="mt-4 space-y-2">
              {(usage.cycleTopModels ?? []).slice(0, 4).length ? (
                (usage.cycleTopModels ?? []).slice(0, 4).map((m) => (
                  <div key={m.model} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                    <p className="text-sm font-semibold text-[var(--text-primary)] break-all">{m.model}</p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)] tabular-nums">
                      {m.requests.toLocaleString()} req • {m.tokensOutput.toLocaleString()} tokens
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-[var(--text-secondary)]">
                  No model usage yet in this cycle.
                </div>
              )}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
