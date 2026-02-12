"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { CREATIVE_DICE_STRATEGIES } from "@/lib/dice-strategies";
import type { CreativeStrategy, DiceConfig } from "@/lib/dice-strategies";
import type { DiceStrategyConfig } from "@/lib/strategies";

function riskColor(risk: string): string {
  switch (risk) {
    case "LOW": return "text-emerald-400 bg-emerald-500/10";
    case "MEDIUM": return "text-amber-400 bg-amber-500/10";
    case "HIGH": return "text-red-400 bg-red-500/10";
    case "CALCULATED": return "text-violet-400 bg-violet-500/10";
    default: return "text-[var(--text-secondary)] bg-white/5";
  }
}

function toApiConfig(c: CreativeStrategy["config"]): DiceStrategyConfig {
  return {
    amount: c.amount,
    target: c.target,
    condition: c.condition,
    progressionType: c.progressionType ?? "flat",
  };
}

type CreativeDiceStrategiesSectionProps = {
  activeStrategyName?: string | null;
  onLoadConfig: (config: DiceConfig & { progressionType?: string }, strategyName?: string) => void;
  onStartStrategyRun?: (config: DiceStrategyConfig, maxRounds: number, strategyName: string) => void;
};

const APPLY_FEEDBACK_MS = 2500;

export function CreativeDiceStrategiesSection({
  activeStrategyName,
  onLoadConfig,
  onStartStrategyRun,
}: CreativeDiceStrategiesSectionProps) {
  const [lastApplied, setLastApplied] = useState<string | null>(null);

  const handleApply = useCallback(
    (s: CreativeStrategy) => {
      onLoadConfig(s.config, s.name);
      setLastApplied(s.name);
    },
    [onLoadConfig]
  );

  const handleRunStrategy = (s: CreativeStrategy) => {
    onStartStrategyRun?.(toApiConfig(s.config), 20, s.name);
    window.dispatchEvent(new Event("balance-updated"));
  };

  useEffect(() => {
    if (!lastApplied) return;
    const id = setTimeout(() => setLastApplied(null), APPLY_FEEDBACK_MS);
    return () => clearTimeout(id);
  }, [lastApplied]);

  return (
    <div>
      <h4 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-3">
        Creative dice strategies
      </h4>
      {lastApplied && (
        <div
          role="status"
          className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400 animate-in fade-in slide-in-from-top-1"
        >
          ✓ Applied <span className="font-semibold">{lastApplied}</span> — bet, target & condition updated
        </div>
      )}
      <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
        {CREATIVE_DICE_STRATEGIES.map((s) => (
          <div
            key={s.id}
            className={`rounded-lg border p-3 transition-colors ${
              activeStrategyName === s.name
                ? "border-[var(--accent-heart)]/60 bg-[var(--accent-heart)]/10 hover:border-[var(--accent-heart)]/70"
                : "border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--accent-heart)]/40"
            }`}
            data-agent="strategy-card"
            data-strategy-id={s.id}
            data-config={JSON.stringify(s.config)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-base" aria-hidden>{s.icon}</span>
                  <span className="text-sm font-semibold text-[var(--text-primary)]">{s.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${riskColor(s.risk)}`}>
                    {s.risk}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">{s.desc}</p>
                <p className="text-[10px] text-[var(--text-secondary)]/80 mt-1 font-mono">
                  {s.config.amount} credits · {s.config.target}% {s.config.condition}
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleApply(s);
                  }}
                  className="px-2 py-1 text-[10px] font-medium rounded-md border border-[var(--accent-heart)]/40 bg-[var(--accent-heart)]/10 text-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/20 transition-colors"
                >
                  Apply
                </button>
                {onStartStrategyRun && (
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleRunStrategy(s); }}
                    className="px-2 py-1 text-[10px] font-medium rounded-md border border-green-500/40 bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors"
                  >
                    Run
                  </button>
                )}
                <Link
                  href="/dashboard/strategies"
                  className="px-2 py-1 text-[10px] font-medium rounded-md border border-[var(--border)] text-[var(--text-secondary)] hover:bg-white/5 transition-colors"
                  title="Open strategies page"
                >
                  →
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
