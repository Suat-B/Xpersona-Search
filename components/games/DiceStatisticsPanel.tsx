"use client";

import { SessionPnLChart, type PnLPoint } from "@/components/ui/SessionPnLChart";
import { QuantStatsCharts } from "./QuantStatsCharts";
import { QuantChartsAesthetic } from "./QuantChartsAesthetic";
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
  /** "analytics" = chart-focused for center panel; default = full panel */
  layout?: "analytics" | "default";
}

export function DiceStatisticsPanel({
  series,
  rounds,
  totalPnl,
  wins,
  recentResults,
  onReset,
  layout = "default",
}: DiceStatisticsPanelProps) {
  const winRate = rounds > 0 ? (wins / rounds) * 100 : 0;

  const isAnalytics = layout === "analytics";

  return (
    <div className="flex-shrink-0 space-y-4" data-agent="statistics-panel">
      <SessionPnLChart series={series} totalPnl={totalPnl} rounds={rounds} onReset={onReset} layout={isAnalytics ? "large" : "default"} />

      <QuantStatsCharts recentResults={recentResults} layout={isAnalytics ? "analytics" : "default"} />

      <QuantChartsAesthetic
        recentResults={recentResults}
        series={series}
        winRate={winRate}
        totalPnl={totalPnl}
        rounds={rounds}
        layout={isAnalytics ? "analytics" : "default"}
      />

      {!isAnalytics && (
        <>
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[var(--bg-card)] to-[var(--bg-matte)]/30 p-4 space-y-3 shadow-md" data-agent="session-stats">
            <h4 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-widest">This session</h4>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-[var(--bg-matte)]/80 p-3 text-center ring-1 ring-white/5 hover:ring-white/10 transition-all" data-agent="stat-rounds" data-value={rounds}>
                <div className="text-lg font-bold font-mono text-[var(--text-primary)]">{rounds}</div>
                <div className="text-[10px] text-[var(--text-secondary)] uppercase">Rounds</div>
              </div>
              <div className="rounded-xl bg-[var(--bg-matte)]/80 p-3 text-center ring-1 ring-white/5 hover:ring-white/10 transition-all" data-agent="stat-pnl" data-value={totalPnl}>
                <div className={`text-lg font-bold font-mono ${totalPnl >= 0 ? "text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]" : "text-red-400 drop-shadow-[0_0_8px_rgba(239,68,68,0.3)]"}`}>
                  {totalPnl >= 0 ? "+" : ""}{totalPnl}
                </div>
                <div className="text-[10px] text-[var(--text-secondary)] uppercase">P&L</div>
              </div>
              <div className="rounded-xl bg-[var(--bg-matte)]/80 p-3 text-center ring-1 ring-white/5 hover:ring-white/10 transition-all" data-agent="stat-winrate" data-value={winRate.toFixed(1)}>
                <div className="text-lg font-bold font-mono text-[var(--text-primary)]">{winRate.toFixed(0)}%</div>
                <div className="text-[10px] text-[var(--text-secondary)] uppercase">Win rate</div>
              </div>
            </div>
          </div>
          <AgentApiSection />
        </>
      )}
    </div>
  );
}
