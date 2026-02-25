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
      const res = await fetch("/api/v1/me/advanced-strategies", { credentials: "include" });
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
      <div className="rounded-sm terminal-pane p-3">
        <p className="text-xs text-[var(--text-secondary)]">Loading saved strategiesâ€¦</p>
      </div>
    );
  }

  if (strategies.length === 0) {
    return (
      <div className="rounded-sm terminal-pane border border-dashed border-white/[0.06] p-3">
        <p className="text-xs text-[var(--text-secondary)]">
          No saved strategies yet. Create via <Link href="/dashboard/strategies" className="text-emerald-400 hover:underline">Dashboard â†’ Strategies</Link> or{" "}
          <code className="bg-white/10 px-1 rounded text-[10px]">POST /api/v1/me/advanced-strategies</code> â€” then they appear here to load and run.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-sm terminal-pane p-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-1.5">
          <div className="w-0.5 h-2.5 rounded-full bg-emerald-500/60" />
          Saved Strategies
        </h4>
        <button
          type="button"
          onClick={fetchStrategies}
          className="text-[10px] text-[var(--text-secondary)] hover:text-emerald-400 transition-colors"
          title="Refresh list"
        >
          â†»
        </button>
      </div>
      <p className="text-[10px] text-[var(--text-tertiary)] mb-2">Load and run strategies. Same via REST API.</p>
      <div className="space-y-1.5">
        {strategies.map((row) => {
          const strategy = toAdvancedStrategy(row);
          const rulesCount = Array.isArray(row.rules) ? row.rules.length : 0;
          return (
            <div
              key={row.id}
              className="flex items-center justify-between gap-2 py-2 px-2.5 rounded-sm border border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04] transition-all"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{row.name}</p>
                <p className="text-[10px] text-[var(--text-secondary)] font-mono tabular-nums">
                  {rulesCount}r Â· {row.baseConfig.amount} {row.baseConfig.condition} {row.baseConfig.target}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onLoad(strategy)}
                  className="px-2 py-1 text-[10px] font-medium rounded-sm border border-white/[0.12] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-violet-500/40 transition-colors"
                >
                  Load
                </button>
                <button
                  type="button"
                  onClick={() => onRun(strategy, defaultMaxRounds)}
                  className="px-2.5 py-1 text-[10px] font-bold rounded-sm bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
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



