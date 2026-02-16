"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { CREATIVE_DICE_STRATEGIES } from "@/lib/dice-strategies";
import type { CreativeStrategy, DiceConfig } from "@/lib/dice-strategies";
import type { DiceStrategyConfig } from "@/lib/strategies";

/** Human-readable labels for progression types; avoids truncation/typos like "martingal" */
const PROGRESSION_LABELS: Record<string, string> = {
  flat: "Flat",
  martingale: "Martingale",
  paroli: "Paroli",
  dalembert: "D'Alembert",
  fibonacci: "Fibonacci",
  labouchere: "Labouchere",
  oscar: "Oscar's Grind",
  kelly: "Kelly",
};

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
  onLoadConfig: (config: DiceConfig & { progressionType?: DiceStrategyConfig["progressionType"] }, strategyName?: string) => void;
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
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">
          Creative strategies
        </h4>
        <span className="text-[10px] text-[var(--text-secondary)]">
          {CREATIVE_DICE_STRATEGIES.length} presets
        </span>
      </div>

      {/* Success message */}
      {lastApplied && (
        <div
          role="status"
          className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Applied <span className="font-semibold">{lastApplied}</span>
        </div>
      )}

      {/* Strategy grid — scrollable */}
      <div className="grid grid-cols-1 gap-2 max-h-[300px] overflow-y-auto overflow-x-hidden pr-1 scroll-smooth scrollbar-sidebar">
        {CREATIVE_DICE_STRATEGIES.map((s) => (
          <div
            key={s.id}
            className={`group rounded-xl border p-3 min-h-[88px] transition-all duration-200 ${
              activeStrategyName === s.name
                ? "border-[var(--accent-heart)]/60 bg-[var(--accent-heart)]/10 shadow-lg shadow-[var(--accent-heart)]/10"
                : "border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--accent-heart)]/40 hover:bg-[var(--bg-matte)]"
            }`}
            data-agent="strategy-card"
            data-strategy-id={s.id}
            data-config={JSON.stringify(s.config)}
          >
            <div className="flex items-start gap-3">
              {/* Icon */}
              <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-xl ${
                activeStrategyName === s.name
                  ? "bg-[var(--accent-heart)]/20"
                  : "bg-[var(--bg-matte)] group-hover:bg-[var(--bg-card)]"
              }`}>
                {s.icon}
              </div>

              {/* Content — min-w-0 with min-w-[90px] ensures text never collapses; flex-[1_1_min-content] gives room */}
              <div className="flex-1 min-w-[90px] max-w-full overflow-hidden">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-[var(--text-primary)] truncate">{s.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium flex-shrink-0 ${riskColor(s.risk)}`}>
                    {s.risk}
                  </span>
                </div>
                <p
                  className="text-[11px] text-[var(--text-secondary)] leading-relaxed line-clamp-3"
                  title={s.desc}
                >
                  {s.desc}
                </p>
                
                {/* Config summary — use human-readable labels to avoid truncation like "martingal" */}
                <div className="flex flex-wrap items-center gap-1.5 mt-2 text-[10px] text-[var(--text-secondary)]">
                  <span className="px-1.5 py-0.5 rounded bg-[var(--bg-matte)] border border-[var(--border)] shrink-0">
                    {s.config.amount} credits
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-[var(--bg-matte)] border border-[var(--border)] shrink-0">
                    {s.config.target}% {s.config.condition}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-[var(--bg-matte)] border border-[var(--border)] shrink-0">
                    {PROGRESSION_LABELS[s.config.progressionType ?? "flat"] ?? (s.config.progressionType ?? "flat")}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleApply(s);
                  }}
                  className="px-3 py-1.5 text-[10px] font-medium rounded-md border border-[var(--accent-heart)]/40 bg-[var(--accent-heart)]/10 text-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/20 transition-colors"
                >
                  Apply
                </button>
                {onStartStrategyRun && (
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleRunStrategy(s); }}
                    className="px-3 py-1.5 text-[10px] font-medium rounded-md border border-green-500/40 bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors flex items-center justify-center gap-1"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Run
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer link */}
      <Link
        href="/dashboard/strategies"
        className="flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-[var(--accent-heart)] hover:underline border border-dashed border-[var(--border)] rounded-lg hover:border-[var(--accent-heart)]/30 hover:bg-[var(--accent-heart)]/5 transition-colors"
      >
        View all strategies
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </div>
  );
}
