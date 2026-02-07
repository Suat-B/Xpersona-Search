"use client";

interface RollResult {
  win: boolean;
  payout: number;
  betAmount?: number;
}

interface StatsSummaryProps {
  results: RollResult[];
}

export function StatsSummary({ results }: StatsSummaryProps) {
  const stats = {
    totalRolls: results.length,
    wins: results.filter(r => r.win).length,
    losses: results.filter(r => !r.win).length,
    winRate: results.length > 0 ? Math.round((results.filter(r => r.win).length / results.length) * 100) : 0,
    bestWin: results.length > 0 ? Math.max(...results.filter(r => r.win).map(r => r.payout), 0) : 0,
    worstLoss: results.length > 0 ? Math.max(...results.filter(r => !r.win).map(r => r.betAmount || 10), 0) : 0,
    avgBet: results.length > 0 ? Math.round(results.reduce((sum, r) => sum + (r.betAmount || 10), 0) / results.length) : 0,
  };

  const StatCard = ({ label, value, subtext, color = "default" }: { 
    label: string; 
    value: string | number; 
    subtext?: string;
    color?: "default" | "green" | "red" | "accent";
  }) => {
    const colorClasses = {
      default: "text-[var(--text-primary)]",
      green: "text-emerald-400",
      red: "text-red-400",
      accent: "text-[var(--accent-heart)]"
    };

    return (
      <div className="relative overflow-hidden rounded-lg bg-[var(--bg-matte)] border border-[var(--border)] p-3 group hover:border-[var(--accent-heart)]/30 transition-all">
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent-heart)]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="relative">
          <span className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">{label}</span>
          <div className={`text-lg font-bold font-mono ${colorClasses[color]}`}>
            {value}
          </div>
          {subtext && (
            <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">{subtext}</div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Session Stats
        </h3>
        {results.length > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--accent-heart)]/20 text-[var(--accent-heart)]">
            Live
          </span>
        )}
      </div>
      
      <div className="grid grid-cols-2 gap-2">
        <StatCard 
          label="Win Rate" 
          value={`${stats.winRate}%`}
          subtext={`${stats.wins}W / ${stats.losses}L`}
          color={stats.winRate >= 50 ? "green" : "default"}
        />
        <StatCard 
          label="Best Win" 
          value={`+${stats.bestWin}`}
          subtext="credits"
          color="green"
        />
        <StatCard 
          label="Total Rolls" 
          value={stats.totalRolls}
          subtext={stats.totalRolls === 1 ? "round" : "rounds"}
        />
        <StatCard 
          label="Avg Bet" 
          value={stats.avgBet}
          subtext="credits"
          color="accent"
        />
      </div>

      {/* Mini Progress Bar */}
      {results.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-[10px] text-[var(--text-secondary)]">
            <span>Wins</span>
            <span>Losses</span>
          </div>
          <div className="h-1.5 rounded-full bg-[var(--bg-matte)] overflow-hidden flex">
            <div 
              className="h-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${stats.winRate}%` }}
            />
            <div 
              className="h-full bg-red-500 transition-all duration-500"
              style={{ width: `${100 - stats.winRate}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default StatsSummary;
