"use client";

import { useEffect, useState, useCallback } from "react";
import { safeFetchJson } from "@/lib/safeFetch";

type CasinoActivity = {
  totalRounds: number;
  roundsLast24h: number;
  activePlayersLast24h: number;
};

interface CasinoRoundsWidgetProps {
  variant?: "full" | "compact";
  /** Pass when on game page; otherwise widget fetches from session-stats */
  personalRounds?: number;
  className?: string;
}

const POLL_INTERVAL_MS = 25000;

export function CasinoRoundsWidget({
  variant = "full",
  personalRounds: personalRoundsProp,
  className = "",
}: CasinoRoundsWidgetProps) {
  const [activity, setActivity] = useState<CasinoActivity | null>(null);
  const [personalRounds, setPersonalRounds] = useState<number | null>(
    personalRoundsProp ?? null
  );
  const [loading, setLoading] = useState(true);

  const fetchActivity = useCallback(async () => {
    try {
      const { ok, data } = await safeFetchJson<CasinoActivity>(
        "/api/v1/stats/casino-activity",
        { credentials: "omit" }
      );
      if (ok && data) {
        setActivity({
          totalRounds: data.totalRounds ?? 0,
          roundsLast24h: data.roundsLast24h ?? 0,
          activePlayersLast24h: data.activePlayersLast24h ?? 0,
        });
      }
    } catch (err) {
      console.error("[CasinoRoundsWidget] casino-activity fetch failed", err);
    }
  }, []);

  const fetchPersonalRounds = useCallback(async () => {
    if (personalRoundsProp != null) return;
    try {
      const { ok, data } = await safeFetchJson<{
        success?: boolean;
        data?: { rounds?: number };
      }>("/api/v1/me/session-stats?gameType=dice&limit=1", {
        credentials: "include",
      });
      if (ok && data?.success && data?.data?.rounds != null) {
        setPersonalRounds(data.data.rounds);
      }
    } catch {
      // Guest or unauthenticated â€” no personal rounds
    }
  }, [personalRoundsProp]);

  useEffect(() => {
    fetchActivity();
    fetchPersonalRounds();
  }, [fetchActivity, fetchPersonalRounds]);

  useEffect(() => {
    const interval = setInterval(fetchActivity, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchActivity]);

  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === "visible") {
        fetchActivity();
        fetchPersonalRounds();
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [fetchActivity, fetchPersonalRounds]);

  useEffect(() => {
    if (personalRoundsProp != null) {
      setPersonalRounds(personalRoundsProp);
    }
  }, [personalRoundsProp]);

  const total = activity?.totalRounds ?? 0;
  const rounds24h = activity?.roundsLast24h ?? 0;
  const players24h = activity?.activePlayersLast24h ?? 0;
  const personal = personalRoundsProp ?? personalRounds ?? null;

  if (variant === "compact") {
    return (
      <div
        className={`flex items-center gap-2 rounded-lg border border-[#0ea5e9]/20 bg-[#0ea5e9]/10 px-3 py-1.5 ${className}`}
      >
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#0ea5e9] opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#0ea5e9]" />
        </span>
        <span className="text-xs font-medium text-[#0ea5e9]">
            {loading && activity == null ? (
              <span className="animate-pulse">â€”</span>
            ) : (
              <span className="tabular-nums">
                {total.toLocaleString()}
                {personal != null && (
                  <span className="ml-1.5 text-[var(--text-tertiary)]">
                    Â· yours: {personal.toLocaleString()}
                  </span>
                )}
              </span>
            )}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border border-[#0ea5e9]/30 bg-[#0ea5e9]/10 px-4 py-3 ${className}`}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#0ea5e9] opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#0ea5e9]" />
        </span>
        <span className="text-[10px] font-semibold text-[#0ea5e9] uppercase tracking-wider">
          Live
        </span>
      </div>
      <div className="space-y-1">
        <div className="text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
          {loading && activity == null ? (
            <span className="animate-pulse">â€”</span>
          ) : (
            total.toLocaleString()
          )}
        </div>
        <div className="text-xs text-[var(--text-tertiary)]">
          {loading && activity == null ? (
            <span className="animate-pulse">Loadingâ€¦</span>
          ) : (
            <>
              {rounds24h.toLocaleString()} rounds in last 24h Â· {players24h}{" "}
              players active
            </>
          )}
        </div>
        {personal != null && personal >= 0 && (
          <div className="pt-2 mt-2 border-t border-white/5">
            <span className="text-xs font-medium text-[#0ea5e9]/90">
              Your {personalRoundsProp != null ? "session" : "total"}:{" "}
              <span className="tabular-nums">{personal.toLocaleString()}</span>{" "}
              rounds
            </span>
          </div>
        )}
      </div>
    </div>
  );
}



