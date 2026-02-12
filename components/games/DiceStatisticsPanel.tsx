"use client";

import { SessionPnLChart, type PnLPoint } from "@/components/ui/SessionPnLChart";
import { AgentApiSection } from "./AgentApiSection";

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

interface DiceStatisticsPanelProps {
  series: PnLPoint[];
  rounds: number;
  totalPnl: number;
  wins: number;
  recentResults: RollResult[];
  amount: number;
  target: number;
  condition: "over" | "under";
  onReset: () => void;
}

export function DiceStatisticsPanel({
  series,
  rounds,
  totalPnl,
  wins,
  recentResults,
  onReset,
}: DiceStatisticsPanelProps) {
  const winRate = rounds > 0 ? (wins / rounds) * 100 : 0;

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
    </div>
  );
}
