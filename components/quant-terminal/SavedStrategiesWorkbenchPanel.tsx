"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { AdvancedDiceStrategy } from "@/lib/advanced-strategy-types";

type SavedStrategyRow = {
  id: string;
  name: string;
  description?: string;
  baseConfig: { amount: number; target: number; condition: "over" | "under" };
  rules: AdvancedDiceStrategy["rules"];
  executionMode: string;
};

function toAdvancedStrategy(row: SavedStrategyRow): AdvancedDiceStrategy {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    baseConfig: row.baseConfig,
    rules: (row.rules ?? []).map((r: any) => ({
      ...r,
      trigger: { ...r.trigger, type: r.trigger?.type ?? "loss" },
      action: { ...r.action, type: r.action?.type ?? "double_bet" },
    })),
    executionMode: (row.executionMode as AdvancedDiceStrategy["executionMode"]) ?? "sequential",
  };
}

const MAX_ROUNDS_OPTIONS = [10, 20, 50, 100] as const;

interface SavedStrategiesWorkbenchPanelProps {
  onRun: (strategyId: string, maxRounds: number) => void;
  onLoadToManual?: (strategy: AdvancedDiceStrategy) => void;
  /** ID of strategy currently running — only that button shows "Running…" */
  runningStrategyId?: string | null;
}

export function SavedStrategiesWorkbenchPanel({
  onRun,
  onLoadToManual,
  runningStrategyId = null,
}: SavedStrategiesWorkbenchPanelProps) {
  const [strategies, setStrategies] = useState<SavedStrategyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [maxRounds, setMaxRounds] = useState(20);

  const fetchStrategies = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/me/advanced-strategies", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && Array.isArray(data.data?.strategies)) {
        setStrategies(data.data.strategies);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStrategies();
  }, [fetchStrategies]);

  useEffect(() => {
    const onSaved = () => fetchStrategies();
    window.addEventListener("advanced-strategies-updated", onSaved);
    return () => window.removeEventListener("advanced-strategies-updated", onSaved);
  }, [fetchStrategies]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-[var(--quant-neutral)]">
        <div className="w-8 h-8 border-2 border-[var(--quant-accent)] border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-[11px] uppercase tracking-wider">Loading strategies…</p>
      </div>
    );
  }

  if (strategies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 px-4 text-center">
        <div className="w-14 h-14 rounded-xl bg-[var(--quant-bg-card)] border border-[var(--quant-border)] flex items-center justify-center mb-3">
          <svg className="w-7 h-7 text-[var(--quant-neutral)]/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
        </div>
        <p className="text-sm font-medium text-[var(--quant-neutral)] mb-1">No saved strategies yet</p>
        <p className="text-[11px] text-[var(--quant-neutral)]/80 mb-4">Create rules & triggers in the Advanced Builder</p>
        <Link
          href="/dashboard/strategies"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--quant-accent)]/20 border border-[var(--quant-accent)]/40 text-[var(--quant-accent)] text-xs font-bold hover:bg-[var(--quant-accent)]/30 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Strategy
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header + max rounds */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--quant-neutral)] flex items-center gap-1.5">
          <span className="w-0.5 h-3 rounded-full bg-[var(--quant-accent)]" />
          Saved Strategies
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-[var(--quant-neutral)]">Rounds:</span>
          <select
            value={maxRounds}
            onChange={(e) => setMaxRounds(Number(e.target.value))}
            className="text-[10px] font-mono bg-[var(--quant-bg-card)] border border-[var(--quant-border)] rounded px-2 py-0.5 text-[var(--quant-text-primary)] focus:border-[var(--quant-accent)] focus:outline-none"
          >
            {MAX_ROUNDS_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={fetchStrategies}
            className="p-1 rounded hover:bg-[var(--quant-bg-hover)] text-[var(--quant-neutral)] hover:text-white transition-colors"
            title="Refresh"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Strategy list */}
      <div className="space-y-2 max-h-[280px] overflow-y-auto quant-scrollbar">
        {strategies.map((row) => {
          const strategy = toAdvancedStrategy(row);
          const rulesCount = Array.isArray(row.rules) ? row.rules.length : 0;
          const cfg = row.baseConfig;
          return (
            <div
              key={row.id}
              className="group rounded-lg border border-[var(--quant-border)] bg-[var(--quant-bg-card)] hover:border-[var(--quant-accent)]/40 hover:bg-[var(--quant-bg-hover)] transition-all p-3"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-white truncate">{row.name}</p>
                  <p className="text-[10px] font-mono text-[var(--quant-neutral)] mt-0.5">
                    {cfg.amount}U · {cfg.condition} {cfg.target}% · {rulesCount}r
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => onRun(row.id, maxRounds)}
                  disabled={runningStrategyId != null}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[10px] font-bold bg-[var(--quant-bullish)]/20 border border-[var(--quant-bullish)]/40 text-[var(--quant-bullish)] hover:bg-[var(--quant-bullish)]/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {runningStrategyId === row.id ? (
                    <>
                      <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Running…
                    </>
                  ) : (
                    <>
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Run
                    </>
                  )}
                </button>
                {onLoadToManual && (
                  <button
                    type="button"
                    onClick={() => onLoadToManual(strategy)}
                    className="inline-flex items-center gap-1 px-2 py-1.5 rounded text-[10px] font-medium border border-[var(--quant-border)] text-[var(--quant-neutral)] hover:text-white hover:border-[var(--quant-accent)]/40 transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Apply
                  </button>
                )}
                <Link
                  href="/dashboard/strategies"
                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded text-[10px] font-medium border border-[var(--quant-border)] text-[var(--quant-neutral)] hover:text-white hover:border-[var(--quant-accent)]/40 transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      <Link
        href="/dashboard/strategies"
        className="flex items-center justify-center gap-1.5 py-2 text-[10px] text-[var(--quant-neutral)] hover:text-[var(--quant-accent)] border border-dashed border-[var(--quant-border)] rounded hover:border-[var(--quant-accent)]/40 transition-colors"
      >
        Manage all strategies →
      </Link>
    </div>
  );
}
