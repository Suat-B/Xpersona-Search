/**
 * PlaygroundQuotaCard - Bubbly aesthetic quota monitoring component
 * 
 * Features:
 * - Soft gradient backgrounds (pink/purple/blue)
 * - Animated progress bars with color-coded states
 * - Floating bubble decorations
 * - Real-time countdown timer
 * - Glassmorphism effects
 * - CSS-based animations (no framer-motion dependency)
 */

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

// Animated progress bar component
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
    <div className="space-y-2">
      <div className="flex justify-between items-center text-sm">
        <span className="text-[var(--text-secondary)] font-medium">{label}</span>
        <span className="text-[var(--text-primary)] font-semibold">
          {value.toLocaleString()}/{max.toLocaleString()}
        </span>
      </div>
      <div className={`h-3 rounded-full ${trackColor[color]} overflow-hidden relative`}>
        <div
          className={`h-full rounded-full bg-gradient-to-r ${colorClasses[color]} relative transition-all duration-700 ease-out`}
          style={{ width: `${percentage}%` }}
        >
          {/* Shimmer effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
        </div>
      </div>
      <p className="text-xs text-[var(--text-quaternary)]">{sublabel}</p>
    </div>
  );
}

// Countdown timer component
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
    <div className="flex items-center gap-1.5 text-xs">
      <div className="animate-spin-slow">
        <svg className="w-3.5 h-3.5 text-[var(--accent-heart)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <span className="text-[var(--text-tertiary)]">Resets in</span>
      <span className="font-mono font-semibold text-[var(--accent-heart)] tabular-nums">
        {String(timeLeft.hours).padStart(2, "0")}h {String(timeLeft.minutes).padStart(2, "0")}m {String(timeLeft.seconds).padStart(2, "0")}s
      </span>
    </div>
  );
}

// Plan badge component
function PlanBadge({ plan, status }: { plan: string | null; status: string }) {
  const isTrial = plan === "trial";
  const isActive = status === "active" || status === "trial";
  
  return (
    <div
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
        isActive ? "animate-pulse-scale" : ""
      } ${
        isTrial 
          ? "bg-gradient-to-r from-amber-400/20 to-orange-400/20 text-amber-400 border border-amber-400/30"
          : "bg-gradient-to-r from-purple-400/20 to-pink-400/20 text-purple-300 border border-purple-400/30"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${isActive ? "animate-pulse" : ""} ${isTrial ? "bg-amber-400" : "bg-purple-400"}`}
      />
      {plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : "No Plan"}
      {isTrial && <span className="text-[10px] opacity-70">⭐</span>}
    </div>
  );
}

// Main component
export function PlaygroundQuotaCard() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch("/api/me/playground-usage", {
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
    // Refresh every minute
    const interval = setInterval(fetchUsage, 60000);
    return () => clearInterval(interval);
  }, [fetchUsage]);

  // Determine progress bar colors based on usage
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
      <div className="agent-card p-6 relative overflow-hidden">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-white/5 rounded w-1/3" />
          <div className="h-8 bg-white/5 rounded w-1/2" />
          <div className="h-20 bg-white/5 rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="agent-card p-6 relative overflow-hidden">
        <div className="text-center py-4">
          <p className="text-sm text-[var(--text-secondary)]">{error}</p>
          <button
            onClick={fetchUsage}
            className="mt-2 text-xs text-[var(--accent-heart)] hover:underline"
          >
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
    <div className="agent-card p-5 sm:p-6 relative overflow-hidden group">
      {/* Animated background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-pink-500/5 to-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      
      {/* Floating bubbles - simplified without framer-motion */}
      <div className="absolute top-4 right-4 w-14 h-14 rounded-full bg-purple-400/20 blur-sm animate-float-slow" />
      <div className="absolute bottom-8 right-12 w-10 h-10 rounded-full bg-pink-400/20 blur-sm animate-float-medium" />
      <div className="absolute top-12 right-20 w-8 h-8 rounded-full bg-blue-400/20 blur-sm animate-float-fast" />
      
      {/* Header */}
      <div className="relative z-10 flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-400/20 text-purple-300 transition-transform duration-300 hover:scale-105 hover:rotate-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
              AI Playground
              <span className="animate-wiggle inline-block">
                ✨
              </span>
            </h3>
            <p className="text-xs text-[var(--text-tertiary)]">
              {hasSubscription ? "Your quota & usage" : "Get started with AI"}
            </p>
          </div>
        </div>
        
        {usage && <PlanBadge plan={usage.plan} status={usage.status} />}
      </div>

      {/* Content */}
      <div className="relative z-10 space-y-5">
        {hasSubscription && usage ? (
          <>
            {/* Daily Requests */}
            <AnimatedProgressBar
              value={usage.today.requestsUsed}
              max={usage.today.requestsLimit}
              label="Daily Requests"
              sublabel={`${usage.today.requestsRemaining} remaining today`}
              color={requestColor}
            />
            
            {/* Monthly Tokens */}
            <AnimatedProgressBar
              value={usage.thisMonth.tokensOutput}
              max={usage.thisMonth.tokensLimit}
              label="Monthly Tokens"
              sublabel={`${(usage.thisMonth.tokensRemaining / 1000).toFixed(0)}K tokens remaining`}
              color={tokenColor}
            />
            
            {/* Cost estimate */}
            <div className="flex items-center justify-between text-xs">
              <CountdownTimer targetDate={usage.nextResetAt} />
              {usage.thisMonth.estimatedCostUsd > 0 && (
                <span className="text-[var(--text-quaternary)]">
                  Est. cost: <span className="text-emerald-400 font-medium">${usage.thisMonth.estimatedCostUsd.toFixed(4)}</span>
                </span>
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-4">
            <p className="text-sm text-[var(--text-secondary)] mb-3">
              No active playground subscription
            </p>
            <p className="text-xs text-[var(--text-tertiary)] mb-4">
              Get 30 free requests/day to try AI models
            </p>
          </div>
        )}

        {/* CTA Buttons */}
        <div className="flex items-center gap-3 pt-2">
          {usage?.plan === "trial" && (
            <Link
              href="/playground"
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-purple-500/20"
            >
              <span>💎</span>
              Upgrade to Paid
            </Link>
          )}
          
          {!hasSubscription && (
            <Link
              href="/playground"
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-purple-500/20"
            >
              <span>🚀</span>
              Start Free Trial
            </Link>
          )}
          
          <Link
            href="/playground"
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl border border-[var(--border)] text-[var(--text-secondary)] text-sm font-medium hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] transition-colors"
          >
            Open Playground
          </Link>
        </div>

        {/* Trial info */}
        {usage?.trial?.isActive && (
          <div className="text-xs text-center text-amber-400/80 bg-amber-400/10 rounded-lg px-3 py-2 border border-amber-400/20 animate-fade-in">
            ⏰ Trial ends {new Date(usage.trial.endsAt).toLocaleDateString()}
          </div>
        )}
      </div>
    </div>
  );
}
