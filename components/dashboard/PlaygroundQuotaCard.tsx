"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface UsageData {
  plan: "trial" | "paid" | null;
  status: "active" | "trial" | "cancelled" | "past_due" | "inactive";
  trial: { endsAt: string; isActive: boolean } | null;
  billing: { currentPeriodEndsAt: string; cancelAtPeriodEnd: boolean } | null;
  limits: {
    contextCap: number;
    maxOutputTokens: number;
    maxRequestsPerDay: number;
    maxOutputTokensPerMonth: number;
  } | null;
  today: {
    requestsUsed: number;
    requestsRemaining: number;
    requestsLimit: number;
  };
  thisMonth: {
    tokensOutput: number;
    tokensRemaining: number;
    tokensLimit: number;
    estimatedCostUsd: number;
  };
  nextResetAt: string;
}

interface TimeLeft {
  hours: number;
  minutes: number;
  seconds: number;
}

type ProgressColor = "green" | "yellow" | "orange" | "red" | "purple";

function AnimatedProgressBar({
  value,
  max,
  label,
  sublabel,
  color,
}: {
  value: number;
  max: number;
  label: string;
  sublabel: string;
  color: ProgressColor;
}) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  const colorClasses: Record<ProgressColor, string> = {
    green: "from-emerald-400 to-green-500",
    yellow: "from-yellow-400 to-amber-500",
    orange: "from-orange-400 to-red-500",
    red: "from-red-400 to-rose-600",
    purple: "from-purple-400 to-pink-500",
  };

  const trackColor: Record<ProgressColor, string> = {
    green: "bg-emerald-500/10",
    yellow: "bg-yellow-500/10",
    orange: "bg-orange-500/10",
    red: "bg-red-500/10",
    purple: "bg-purple-500/10",
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium tracking-wide text-[var(--text-secondary)]">{label}</span>
        <span className="font-semibold tabular-nums text-[var(--text-primary)]">
          {value.toLocaleString()}/{max.toLocaleString()}
        </span>
      </div>
      <div className={`relative h-2.5 overflow-hidden rounded-full ${trackColor[color]}`}>
        <div
          className={`relative h-full rounded-full bg-gradient-to-r ${colorClasses[color]} transition-all duration-700 ease-out`}
          style={{ width: `${percentage}%` }}
        >
          <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/30 to-transparent" />
        </div>
      </div>
      <p className="text-xs text-[var(--text-quaternary)]">{sublabel}</p>
    </div>
  );
}

function CountdownTimer({ targetDate }: { targetDate: string }) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>({ hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const target = new Date(targetDate).getTime();
      const difference = target - now;

      if (difference > 0) {
        return {
          hours: Math.floor(difference / (1000 * 60 * 60)),
          minutes: Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((difference % (1000 * 60)) / 1000),
        };
      }

      return { hours: 0, minutes: 0, seconds: 0 };
    };

    setTimeLeft(calculateTimeLeft());
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(timer);
  }, [targetDate]);

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)]/70 px-2.5 py-1 text-xs">
      <div className="animate-spin-slow">
        <svg className="h-3.5 w-3.5 text-cyan-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <span className="text-[var(--text-tertiary)]">Resets in</span>
      <span className="font-mono font-semibold tabular-nums text-cyan-300">
        {String(timeLeft.hours).padStart(2, "0")}h {String(timeLeft.minutes).padStart(2, "0")}m {String(timeLeft.seconds).padStart(2, "0")}s
      </span>
    </div>
  );
}

function PlanBadge({ plan, status }: { plan: string | null; status: string }) {
  const isTrial = plan === "trial";
  const isActive = status === "active" || status === "trial";

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
        isActive ? "animate-pulse-scale" : ""
      } ${
        isTrial
          ? "border-amber-400/30 bg-gradient-to-r from-amber-400/20 to-orange-400/20 text-amber-300"
          : "border-purple-400/30 bg-gradient-to-r from-purple-400/20 to-pink-400/20 text-purple-300"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${isActive ? "animate-pulse" : ""} ${isTrial ? "bg-amber-400" : "bg-purple-400"}`}
      />
      {plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : "No Plan"}
      {isTrial && (
        <svg className="h-3 w-3 opacity-80" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
          <path d="M10 1.5l2.3 4.66 5.2.76-3.75 3.65.88 5.16L10 13.3l-4.63 2.43.88-5.16L2.5 6.92l5.2-.76L10 1.5z" />
        </svg>
      )}
    </div>
  );
}

export function PlaygroundQuotaCard() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/me/playground-usage", {
        credentials: "include",
        cache: "no-store",
      });

      if (!res.ok) {
        if (res.status === 401) {
          setError("Please sign in to view your quota");
        } else {
          setError("Failed to load usage data");
        }
        return;
      }

      const data = await res.json();
      setUsage(data);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsage();
    const interval = setInterval(fetchUsage, 60000);
    return () => clearInterval(interval);
  }, [fetchUsage]);

  const getRequestColor = (used: number, limit: number): ProgressColor => {
    const pct = used / limit;
    if (pct >= 0.9) return "red";
    if (pct >= 0.75) return "orange";
    if (pct >= 0.5) return "yellow";
    return "green";
  };

  const getTokenColor = (used: number, limit: number): ProgressColor => {
    const pct = used / limit;
    if (pct >= 0.9) return "red";
    if (pct >= 0.75) return "orange";
    if (pct >= 0.5) return "yellow";
    return "purple";
  };

  if (loading) {
    return (
      <div className="agent-card relative overflow-hidden p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 w-1/3 rounded bg-white/5" />
          <div className="h-8 w-1/2 rounded bg-white/5" />
          <div className="h-20 rounded bg-white/5" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="agent-card relative overflow-hidden p-6">
        <div className="py-4 text-center">
          <p className="text-sm text-[var(--text-secondary)]">{error}</p>
          <button onClick={fetchUsage} className="mt-2 text-xs text-cyan-300 hover:underline">
            Try again
          </button>
        </div>
      </div>
    );
  }

  const hasSubscription = usage?.plan !== null;
  const requestColor = getRequestColor(usage?.today.requestsUsed || 0, usage?.today.requestsLimit || 30);
  const tokenColor = getTokenColor(usage?.thisMonth.tokensOutput || 0, usage?.thisMonth.tokensLimit || 50000);

  return (
    <div className="agent-card relative overflow-hidden border border-[var(--border)] bg-gradient-to-br from-[var(--bg-card)] via-[var(--bg-card)] to-cyan-900/10 p-5 transition-colors hover:border-cyan-400/30 sm:p-6">
      <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-cyan-400/10 blur-2xl" aria-hidden />

      <div className="relative z-10 mb-5 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-500/10 text-cyan-300">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h3 className="flex items-center gap-2 font-semibold text-[var(--text-primary)]">
              AI Playground
              <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-cyan-300" aria-hidden />
            </h3>
            <p className="text-xs tracking-wide text-[var(--text-tertiary)]">
              {hasSubscription ? "Your quota and usage" : "Get started with AI"}
            </p>
          </div>
        </div>

        {usage && <PlanBadge plan={usage.plan} status={usage.status} />}
      </div>

      <div className="relative z-10 space-y-5">
        {hasSubscription && usage ? (
          <>
            <AnimatedProgressBar
              value={usage.today.requestsUsed}
              max={usage.today.requestsLimit}
              label="Daily Requests"
              sublabel={`${usage.today.requestsRemaining} remaining today`}
              color={requestColor}
            />

            <AnimatedProgressBar
              value={usage.thisMonth.tokensOutput}
              max={usage.thisMonth.tokensLimit}
              label="Monthly Tokens"
              sublabel={`${(usage.thisMonth.tokensRemaining / 1000).toFixed(0)}K tokens remaining`}
              color={tokenColor}
            />

            <div className="flex items-center justify-between text-xs">
              <CountdownTimer targetDate={usage.nextResetAt} />
              {usage.thisMonth.estimatedCostUsd > 0 && (
                <span className="text-[var(--text-quaternary)]">
                  Est. cost: <span className="font-medium text-emerald-400">${usage.thisMonth.estimatedCostUsd.toFixed(4)}</span>
                </span>
              )}
            </div>
          </>
        ) : (
          <div className="py-4 text-center">
            <p className="mb-3 text-sm text-[var(--text-secondary)]">No active playground subscription</p>
            <p className="mb-4 text-xs text-[var(--text-tertiary)]">Get 30 free requests/day to try AI models</p>
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          {usage?.plan === "trial" && (
            <Link
              href="/playground"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-400"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                <path d="M9.2 2.7a1 1 0 011.6 0l2.4 3.2 3.9 1.2a1 1 0 01.5 1.6l-2.5 3.2.1 4a1 1 0 01-1.4 1l-3.6-1.4-3.6 1.4a1 1 0 01-1.4-1l.1-4L1.8 8.7a1 1 0 01.5-1.6l3.9-1.2 2.4-3.2z" />
              </svg>
              Upgrade to Paid
            </Link>
          )}

          {!hasSubscription && (
            <Link
              href="/playground"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-400"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Start Free Trial
            </Link>
          )}

          <Link
            href="/dashboard/playground"
            className="inline-flex items-center justify-center rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
          >
            Manage Subscription
          </Link>
        </div>

        {usage?.trial?.isActive && (
          <div className="animate-fade-in rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-center text-xs text-amber-300">
            Trial ends {new Date(usage.trial.endsAt).toLocaleDateString()}
          </div>
        )}
      </div>
    </div>
  );
}
