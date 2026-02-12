"use client";

import Link from "next/link";
import { SessionPnLChart, type PnLPoint } from "@/components/ui/SessionPnLChart";
import { AgentApiSection } from "./AgentApiSection";
import { CREATIVE_DICE_STRATEGIES } from "@/lib/dice-strategies";
import type { DiceConfig, CreativeStrategy } from "@/lib/dice-strategies";
import type { DiceStrategyConfig } from "@/lib/strategies";

/**
 * Statistics panel for dice game — designed for AI agentic consumption.
 * Key elements have data-agent-* attributes for DOM scraping.
 * Use GET /api/me/session-stats for programmatic access.
 */

interface RollResult {
  result: number;
  win: boolean;
  payout: number;
  betAmount?: number;
}

function riskColor(risk: string): string {
  switch (risk) {
    case "LOW": return "text-emerald-400 bg-emerald-500/10";
    case "MEDIUM": return "text-amber-400 bg-amber-500/10";
    case "HIGH": return "text-red-400 bg-red-500/10";
    case "CALCULATED": return "text-violet-400 bg-violet-500/10";
    default: return "text-[var(--text-secondary)] bg-white/5";
  }
}

interface DiceStatisticsPanelProps {
  series: PnLPoint[];
  rounds: number;
  totalPnl: number;
  wins: number;
  recentResults: RollResult[];
  amount: number;
  target: number;
  condition: "over" | "under";
  onLoadConfig: (config: DiceConfig) => void;
  onReset: () => void;
  onStrategyComplete?: (sessionPnl: number, roundsPlayed: number, wins: number) => void;
  onStartStrategyRun?: (config: DiceStrategyConfig, maxRounds: number, strategyName: string) => void;
}

function toApiConfig(c: CreativeStrategy["config"]): DiceStrategyConfig {
  return {
    amount: c.amount,
    target: c.target,
    condition: c.condition,
    progressionType: c.progressionType ?? "flat",
  };
}

export function DiceStatisticsPanel({
  series,
  rounds,
  totalPnl,
  wins,
  recentResults,
  onLoadConfig,
  onReset,
  onStrategyComplete,
  onStartStrategyRun,
}: DiceStatisticsPanelProps) {
  const winRate = rounds > 0 ? (wins / rounds) * 100 : 0;

  const handleRunStrategy = (s: CreativeStrategy) => {
    onStartStrategyRun?.(toApiConfig(s.config), 20, s.name);
    window.dispatchEvent(new Event("balance-updated"));
  };

  return (
    <div className="flex-shrink-0 space-y-4" data-agent="statistics-panel">
      {/* PnL chart */}
      <SessionPnLChart series={series} totalPnl={totalPnl} rounds={rounds} onReset={onReset} />

      {/* Session stats — machine-readable for agents */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 space-y-3" data-agent="session-stats">
        <h4 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">This session (since page load)</h4>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-[var(--bg-matte)] p-3 text-center" data-agent="stat-rounds" data-value={rounds}>
            <div className="text-lg font-bold font-mono text-[var(--text-primary)]">{rounds}</div>
            <div className="text-[10px] text-[var(--text-secondary)] uppercase">Rounds</div>
          </div>
          <div className="rounded-lg bg-[var(--bg-matte)] p-3 text-center" data-agent="stat-pnl" data-value={totalPnl}>
            <div className={`text-lg font-bold font-mono ${totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {totalPnl >= 0 ? "+" : ""}{totalPnl}
            </div>
            <div className="text-[10px] text-[var(--text-secondary)] uppercase">PnL</div>
          </div>
          <div className="rounded-lg bg-[var(--bg-matte)] p-3 text-center" data-agent="stat-winrate" data-value={winRate.toFixed(1)}>
            <div className="text-lg font-bold font-mono text-[var(--text-primary)]">{winRate.toFixed(0)}%</div>
            <div className="text-[10px] text-[var(--text-secondary)] uppercase">Win rate</div>
          </div>
        </div>
      </div>

      {/* Agent API — interactive UI for AI agents to explore and test */}
      <AgentApiSection />

      {/* Strategy cards */}
      <div>
        <h4 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-3">
          Creative dice strategies
        </h4>
        <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
          {CREATIVE_DICE_STRATEGIES.map((s) => (
            <div
              key={s.id}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3 hover:border-[var(--accent-heart)]/40 transition-colors"
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
                      onLoadConfig(s.config);
                    }}
                    className="px-2 py-1 text-[10px] font-medium rounded-md border border-[var(--accent-heart)]/40 bg-[var(--accent-heart)]/10 text-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/20 transition-colors"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleOpenRun(s); }}
                    className="px-2 py-1 text-[10px] font-medium rounded-md border border-green-500/40 bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors"
                  >
                    Run
                  </button>
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
    </div>
  );
}
