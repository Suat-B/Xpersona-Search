"use client";

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

type DiceConfig = { amount: number; target: number; condition: "over" | "under" };

const STRATEGIES: {
  id: string;
  name: string;
  desc: string;
  risk: "LOW" | "MEDIUM" | "HIGH" | "CALCULATED";
  config: DiceConfig;
  icon: string;
}[] = [
  { id: "martingale", name: "Martingale", desc: "Double bet after each loss, reset on win. High variance.", risk: "HIGH", config: { amount: 10, target: 50, condition: "over" }, icon: "📈" },
  { id: "paroli", name: "Paroli", desc: "Triple bet on win, reset after 3 wins. Capitalizes on hot streaks.", risk: "LOW", config: { amount: 10, target: 50, condition: "over" }, icon: "🔥" },
  { id: "dalembert", name: "D'Alembert", desc: "Increase bet by 1 on loss, decrease on win. Gentle progression.", risk: "MEDIUM", config: { amount: 10, target: 50, condition: "over" }, icon: "⚖️" },
  { id: "fibonacci", name: "Fibonacci", desc: "Follow Fibonacci sequence. Classic progression system.", risk: "MEDIUM", config: { amount: 10, target: 50, condition: "over" }, icon: "🐚" },
  { id: "labouchere", name: "Labouchere", desc: "Line-based betting. Cancel numbers on win.", risk: "HIGH", config: { amount: 10, target: 50, condition: "over" }, icon: "📋" },
  { id: "oscar", name: "Oscar's Grind", desc: "Add 1 unit on win only. Very conservative.", risk: "LOW", config: { amount: 10, target: 50, condition: "over" }, icon: "🎯" },
  { id: "kelly", name: "Kelly Criterion", desc: "Math-optimal bet sizing. Maximizes long-term growth.", risk: "CALCULATED", config: { amount: 10, target: 50, condition: "over" }, icon: "📐" },
  { id: "flat", name: "Flat / Simple", desc: "Constant bet every round. Lowest variance.", risk: "LOW", config: { amount: 10, target: 50, condition: "over" }, icon: "📊" },
  { id: "high-roller", name: "High Roller", desc: "Big bets on 75% Over. Chase big wins.", risk: "HIGH", config: { amount: 50, target: 75, condition: "over" }, icon: "💎" },
  { id: "conservative", name: "Conservative", desc: "Small bets, 50 Under. Steady, low-risk play.", risk: "LOW", config: { amount: 5, target: 50, condition: "under" }, icon: "🛡️" },
  { id: "lucky-7", name: "Lucky 7", desc: "Bet on 7% Under. Long odds, high payout.", risk: "HIGH", config: { amount: 10, target: 7, condition: "under" }, icon: "🍀" },
  { id: "center", name: "Center Strike", desc: "50% target, balanced Over. RTP-focused.", risk: "MEDIUM", config: { amount: 20, target: 50, condition: "over" }, icon: "⭕" },
];

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
  rounds: number;
  totalPnl: number;
  recentResults: RollResult[];
  amount: number;
  target: number;
  condition: "over" | "under";
  onLoadConfig: (config: DiceConfig) => void;
}

export function DiceStatisticsPanel({
  rounds,
  totalPnl,
  recentResults,
  onLoadConfig,
}: DiceStatisticsPanelProps) {
  const wins = recentResults.filter((r) => r.win).length;
  const winRate = recentResults.length > 0 ? (wins / recentResults.length) * 100 : 0;

  return (
    <div className="flex-shrink-0 space-y-4" data-agent="statistics-panel">
      {/* Session stats — machine-readable for agents */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 space-y-3" data-agent="session-stats">
        <h4 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">Your session</h4>
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

      {/* Agent API — for AI agents to fetch stats programmatically */}
      <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4 space-y-2">
        <h4 className="text-xs font-semibold text-violet-300 uppercase tracking-wider flex items-center gap-1.5">
          <span aria-hidden>🤖</span> Agent API
        </h4>
        <p className="text-xs text-[var(--text-secondary)]">
          Fetch session stats for your AI agent:
        </p>
        <pre className="text-[10px] font-mono bg-black/30 rounded p-2 overflow-x-auto text-emerald-400 whitespace-pre">
{`GET /api/me/session-stats
?gameType=dice&limit=50

→ balance, rounds, sessionPnl, winRate, recentBets`}
        </pre>
        <p className="text-[10px] text-[var(--text-secondary)]">
          Use <code className="bg-white/10 px-1 rounded">Authorization: Bearer {'<API_KEY>'}</code> or session cookie.
        </p>
      </div>

      {/* Strategy cards */}
      <div>
        <h4 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-3">
          Creative dice strategies
        </h4>
        <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
          {STRATEGIES.map((s) => (
            <div
              key={s.id}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3 hover:border-[var(--accent-heart)]/40 transition-colors"
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
                    {s.config.amount} cr · {s.config.target}% {s.config.condition}
                  </p>
                </div>
                <button
                  onClick={() => onLoadConfig(s.config)}
                  className="flex-shrink-0 px-2 py-1 text-[10px] font-medium rounded-md border border-[var(--accent-heart)]/40 bg-[var(--accent-heart)]/10 text-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/20 transition-colors"
                >
                  Apply
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
