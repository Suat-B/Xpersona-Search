"use client";

import { useEffect, useState } from "react";
import { AI_FIRST_MESSAGING } from "@/lib/ai-first-messaging";

interface DataIntelligenceBadgeProps {
  variant?: "compact" | "full";
  showCount?: boolean;
  className?: string;
}

export function DataIntelligenceBadge({
  variant = "full",
  showCount = false,
  className = "",
}: DataIntelligenceBadgeProps) {
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(showCount);

  useEffect(() => {
    if (!showCount) return;

    const fetchCount = async () => {
      try {
        const res = await fetch("/api/stats/harvest-count");
        if (res.ok) {
          const data = await res.json();
          setCount(data.count);
        }
      } catch (error) {
        console.error("Failed to fetch harvest count:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchCount();
  }, [showCount]);

  if (variant === "compact") {
    return (
      <div
        className={`flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 px-3 py-1.5 ${className}`}
      >
        <div className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </div>
        <span className="text-xs font-semibold text-emerald-400">
          {AI_FIRST_MESSAGING.dataIntelligence.badge}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 via-cyan-500/10 to-emerald-500/10 px-4 py-3 ${className}`}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500/20 to-cyan-500/20">
        <svg
          className="h-5 w-5 text-emerald-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"
          />
        </svg>
        <svg
          className="absolute h-3 w-3 text-cyan-400 animate-pulse"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
          />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-emerald-400">
          {AI_FIRST_MESSAGING.dataIntelligence.headline}
        </div>
        {showCount && (
          <div className="mt-0.5 text-xs text-cyan-400/90">
            {loading ? (
              <span className="animate-pulse">Loading...</span>
            ) : count !== null ? (
              <>
                {count.toLocaleString()}+ {AI_FIRST_MESSAGING.dataIntelligence.trust}
              </>
            ) : (
              <span>{AI_FIRST_MESSAGING.dataIntelligence.tagline}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
