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
  globalLimits?: AdvancedDiceStrategy["globalLimits"];
  executionMode: string;
};

interface SavedAdvancedStrategiesListProps {
  onRun: (strategy: AdvancedDiceStrategy, maxRounds: number) => void;
  onLoad: (strategy: AdvancedDiceStrategy) => void;
  defaultMaxRounds?: number;
}

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
    globalLimits: row.globalLimits,
    executionMode: (row.executionMode as AdvancedDiceStrategy["executionMode"]) ?? "sequential",
  };
}

export function SavedAdvancedStrategiesList({
  onRun,
  onLoad,
  defaultMaxRounds = 50,
}: SavedAdvancedStrategiesListProps) {
  const [strategies, setStrategies] = useState<SavedStrategyRow[]>([]);
  const [loading, setLoading] = useState(true);

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
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
        <p className="text-xs text-[var(--text-secondary)]">Loading saved strategies…</p>
      </div>
    );
  }

  if (strategies.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-card)]/50 p-4">
        <p className="text-xs text-[var(--text-secondary)]">
          No saved strategies yet. Create via <Link href="/dashboard/strategies" className="text-emerald-400 hover:underline">Dashboard → Strategies</Link> or{" "}
          <code className="bg-white/10 px-1 rounded text-[10px]">POST /api/me/advanced-strategies</code> — then they appear here to load and run.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
          Saved Strategies
        </h4>
        <button
          type="button"
          onClick={fetchStrategies}
          className="text-[10px] text-[var(--text-secondary)] hover:text-emerald-400 transition-colors"
          title="Refresh list"
        >
          ↻
        </button>
      </div>
      <p className="text-[10px] text-[var(--text-secondary)] mb-3">
        Load and run strategies created by you or your AI. Same strategies available via REST API.
      </p>
      <div className="space-y-2">
        {strategies.map((row) => {
          const strategy = toAdvancedStrategy(row);
          const rulesCount = Array.isArray(row.rules) ? row.rules.length : 0;
          return (
            <div
              key={row.id}
              className="flex items-center justify-between gap-2 py-2 px-3 rounded-lg border border-[var(--border)] bg-[var(--bg-matte)]/50 hover:border-emerald-500/30 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--text-primary)] truncate">{row.name}</p>
                <p className="text-[10px] text-[var(--text-secondary)]">
                  {rulesCount} rule{rulesCount !== 1 ? "s" : ""} · {row.baseConfig.amount} credits on {row.baseConfig.condition} {row.baseConfig.target}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onLoad(strategy)}
                  className="px-2 py-1 text-[10px] font-medium rounded border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-heart)]/50 transition-colors"
                >
                  Load
                </button>
                <button
                  type="button"
                  onClick={() => onRun(strategy, defaultMaxRounds)}
                  className="px-2 py-1 text-[10px] font-medium rounded bg-[var(--accent-heart)]/20 border border-[var(--accent-heart)]/40 text-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/30 transition-colors"
                >
                  Run
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
