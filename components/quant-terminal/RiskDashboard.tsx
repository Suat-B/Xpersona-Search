"use client";

interface RiskDashboardProps {
  maxDrawdown: number;
  sharpe: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
}

export function RiskDashboard({ maxDrawdown, sharpe, winRate, avgWin, avgLoss }: RiskDashboardProps) {
  // Calculate Kelly Criterion
  const winProb = winRate / 100;
  const lossProb = 1 - winProb;
  const winLossRatio = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 1;
  const kelly = winProb > 0 && winLossRatio > 0
    ? (winProb - lossProb / winLossRatio) * 100
    : 0;

  // Calculate profit factor
  const profitFactor = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0;

  const metrics = [
    {
      label: "Max Drawdown",
      value: maxDrawdown,
      format: (v: number) => `${v >= 0 ? "" : "-"}$${Math.abs(v).toFixed(0)}`,
      color: maxDrawdown >= -500 ? "text-bullish" : maxDrawdown >= -1000 ? "text-neutral" : "text-bearish",
    },
    {
      label: "Sharpe Ratio",
      value: sharpe,
      format: (v: number) => v.toFixed(2),
      color: sharpe > 1.5 ? "text-bullish" : sharpe > 0.5 ? "text-neutral" : "text-bearish",
    },
    {
      label: "Profit Factor",
      value: profitFactor,
      format: (v: number) => v.toFixed(2),
      color: profitFactor > 1.5 ? "text-bullish" : profitFactor > 1 ? "text-neutral" : "text-bearish",
    },
    {
      label: "Kelly %",
      value: Math.max(0, kelly),
      format: (v: number) => `${v.toFixed(1)}%`,
      color: kelly > 20 ? "text-bullish" : kelly > 10 ? "text-accent" : "text-neutral",
    },
  ];

  return (
    <div className="quant-panel h-64">
      <div className="quant-panel-header">
        <span>Risk Metrics</span>
        <div className="flex items-center gap-1">
          <div className="quant-status-dot online"></div>
          <span className="text-[10px]">Active</span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-3">
          {metrics.map((metric) => (
            <div key={metric.label} className="space-y-1">
              <div className="text-[10px] text-[var(--quant-neutral)] uppercase tracking-wider">
                {metric.label}
              </div>
              <div className={`font-mono text-lg font-bold ${metric.color}`}>
                {metric.format(metric.value)}
              </div>
            </div>
          ))}
        </div>

        {/* Risk Bars */}
        <div className="space-y-2 pt-2 border-t border-[var(--quant-border)]">
          <div className="space-y-1">
            <div className="flex justify-between text-[10px]">
              <span className="text-[var(--quant-neutral)]">Win/Loss Ratio</span>
              <span className="font-mono">{winLossRatio.toFixed(2)}</span>
            </div>
            <div className="h-1.5 bg-[var(--quant-bg-card)] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[var(--quant-bearish)] to-[var(--quant-bullish)] transition-all duration-500"
                style={{ width: `${Math.min((winLossRatio / 3) * 100, 100)}%` }}
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[10px]">
              <span className="text-[var(--quant-neutral)]">Risk Level</span>
              <span className={`font-mono ${maxDrawdown < -1000 ? "text-bearish" : "text-bullish"}`}>
                {maxDrawdown < -1000 ? "HIGH" : maxDrawdown < -500 ? "MEDIUM" : "LOW"}
              </span>
            </div>
            <div className="h-1.5 bg-[var(--quant-bg-card)] rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  maxDrawdown < -1000
                    ? "bg-[var(--quant-bearish)]"
                    : maxDrawdown < -500
                    ? "bg-[var(--quant-warning)]"
                    : "bg-[var(--quant-bullish)]"
                }`}
                style={{ width: `${Math.min((Math.abs(maxDrawdown) / 2000) * 100, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Win/Loss Comparison */}
        <div className="pt-2 border-t border-[var(--quant-border)]">
          <div className="text-[10px] text-[var(--quant-neutral)] uppercase tracking-wider mb-2">
            Avg Win vs Loss
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <div className="flex justify-between text-[10px] mb-1">
                <span className="text-bullish">+${avgWin.toFixed(0)}</span>
                <span className="text-bearish">-${Math.abs(avgLoss).toFixed(0)}</span>
              </div>
              <div className="h-2 flex rounded-full overflow-hidden">
                <div
                  className="bg-[var(--quant-bullish)]"
                  style={{ width: `${(avgWin / (avgWin + Math.abs(avgLoss))) * 100}%` }}
                />
                <div
                  className="bg-[var(--quant-bearish)]"
                  style={{ width: `${(Math.abs(avgLoss) / (avgWin + Math.abs(avgLoss))) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
