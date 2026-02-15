"use client";

import { useState, useCallback } from "react";
import Link from "next/link";

interface SessionStatsData {
  balance: number;
  rounds: number;
  sessionPnl: number;
  winRate: number;
  recentBets: Array<{ amount: number; outcome: string; payout: number; pnl: number }>;
}

const GAME_TYPES = ["dice"] as const;
const LIMIT_PRESETS = [10, 20, 50, 100] as const;

/**
 * Interactive Agent API section — UI-centric for AI agents to explore and test.
 * data-agent-* attributes for DOM scraping.
 */
export function AgentApiSection() {
  const [gameType, setGameType] = useState<"dice">("dice");
  const [limit, setLimit] = useState(50);
  const [data, setData] = useState<SessionStatsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const buildUrl = useCallback(() => {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}/api/me/session-stats?gameType=${gameType}&limit=${limit}`;
  }, [gameType, limit]);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(buildUrl(), { credentials: "include" });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? `HTTP ${res.status}`);
        return;
      }
      if (json.success && json.data) {
        setData(json.data);
      } else {
        setError(json?.error ?? "Invalid response");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(buildUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copy failed");
    }
  };

  const clampLimit = (v: number) => Math.min(100, Math.max(1, v));

  return (
    <div
      className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4 space-y-3"
      data-agent="agent-api"
    >
      <h4 className="text-xs font-semibold text-violet-300 uppercase tracking-wider flex items-center gap-1.5">
        <span aria-hidden>🤖</span> AI API
      </h4>
      <p className="text-xs text-[var(--text-secondary)]">
        Fetch session stats for your AI. Use Bearer token or session cookie.
      </p>

      {/* Parameter controls */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-[10px] text-[var(--text-secondary)] uppercase">gameType</span>
        <div className="flex gap-1 p-0.5 rounded-md bg-black/20">
          {GAME_TYPES.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGameType(g)}
              className={`px-2.5 py-1 text-[10px] font-medium rounded transition-colors ${
                gameType === g
                  ? "bg-violet-500/40 text-violet-200"
                  : "text-[var(--text-secondary)] hover:text-white hover:bg-white/5"
              }`}
              data-agent="param-gameType"
              data-value={g}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-[10px] text-[var(--text-secondary)] uppercase">limit</span>
        <div className="flex gap-1">
          {LIMIT_PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setLimit(n)}
              className={`px-2.5 py-1 text-[10px] font-medium rounded transition-colors ${
                limit === n
                  ? "bg-violet-500/40 text-violet-200"
                  : "text-[var(--text-secondary)] hover:text-white hover:bg-white/5"
              }`}
              data-agent="param-limit"
              data-value={n}
            >
              {n}
            </button>
          ))}
        </div>
        <input
          type="number"
          min={1}
          max={100}
          value={limit}
          onChange={(e) => setLimit(clampLimit(parseInt(e.target.value, 10) || 50))}
          className="w-14 px-2 py-1 text-[10px] font-mono bg-black/30 border border-white/10 rounded text-emerald-400 focus:border-violet-500/50 focus:outline-none"
          data-agent="param-limit-input"
        />
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={fetchStats}
          disabled={loading}
          className="px-3 py-2 text-xs font-medium rounded-lg border border-violet-500/40 bg-violet-500/20 text-violet-200 hover:bg-violet-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
          data-agent="action-fetch"
        >
          {loading ? (
            <>
              <span className="w-3 h-3 border border-violet-300 border-t-transparent rounded-full animate-spin" />
              Fetching…
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Fetch stats
            </>
          )}
        </button>
        <button
          type="button"
          onClick={copyUrl}
          className="px-3 py-2 text-xs font-medium rounded-lg border border-[var(--border)] bg-[var(--bg-matte)] text-[var(--text-secondary)] hover:text-white hover:border-white/20 transition-colors flex items-center gap-1.5"
          data-agent="action-copy-url"
        >
          {copied ? (
            <>✓ Copied</>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy URL
            </>
          )}
        </button>
        <Link
          href="/dashboard/api"
          className="px-3 py-2 text-xs font-medium rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--accent-heart)] hover:border-[var(--accent-heart)]/40 transition-colors"
          data-agent="action-api-docs"
        >
          API docs →
        </Link>
      </div>

      {/* Response display */}
      {error && (
        <div
          className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-400 font-mono"
          data-agent="response-error"
        >
          {error}
        </div>
      )}

      {data && !error && (
        <div
          className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-2"
          data-agent="response-data"
        >
          <div className="text-[10px] text-emerald-400/80 uppercase font-medium">Response</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div
              className="rounded bg-black/20 p-2 text-center"
              data-agent="res-balance"
              data-value={data.balance}
            >
              <div className="text-sm font-bold font-mono text-[var(--text-primary)]">
                {data.balance.toLocaleString()}
              </div>
              <div className="text-[10px] text-[var(--text-secondary)]">balance</div>
            </div>
            <div
              className="rounded bg-black/20 p-2 text-center"
              data-agent="res-rounds"
              data-value={data.rounds}
            >
              <div className="text-sm font-bold font-mono text-[var(--text-primary)]">{data.rounds}</div>
              <div className="text-[10px] text-[var(--text-secondary)]">rounds</div>
            </div>
            <div
              className="rounded bg-black/20 p-2 text-center"
              data-agent="res-pnl"
              data-value={data.sessionPnl}
            >
              <div
                className={`text-sm font-bold font-mono ${data.sessionPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}
              >
                {data.sessionPnl >= 0 ? "+" : ""}{data.sessionPnl}
              </div>
              <div className="text-[10px] text-[var(--text-secondary)]">sessionPnl</div>
            </div>
            <div
              className="rounded bg-black/20 p-2 text-center"
              data-agent="res-winrate"
              data-value={data.winRate}
            >
              <div className="text-sm font-bold font-mono text-[var(--text-primary)]">
                {data.winRate.toFixed(1)}%
              </div>
              <div className="text-[10px] text-[var(--text-secondary)]">winRate</div>
            </div>
            <div
              className="rounded bg-black/20 p-2 text-center col-span-2 sm:col-span-1"
              data-agent="res-recentbets"
              data-value={data.recentBets.length}
            >
              <div className="text-sm font-bold font-mono text-[var(--text-primary)]">
                {data.recentBets.length}
              </div>
              <div className="text-[10px] text-[var(--text-secondary)]">recentBets</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
