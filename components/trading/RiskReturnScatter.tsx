"use client";

interface Strategy {
  id: string;
  name: string;
  priceMonthlyCents: number;
  sharpeRatio?: number | null;
  maxDrawdownPercent?: number | null;
}

interface RiskReturnScatterProps {
  strategies: Strategy[];
  width?: number;
  height?: number;
}

export function RiskReturnScatter({
  strategies,
  width = 500,
  height = 320,
}: RiskReturnScatterProps) {
  const withMetrics = strategies.filter(
    (s) =>
      s.sharpeRatio != null &&
      s.maxDrawdownPercent != null
  );
  if (withMetrics.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--dash-divider)] p-8 text-center">
        <p className="text-[var(--dash-text-secondary)]">
          Need strategies with Sharpe and Max DD to view the risk/return map.
        </p>
      </div>
    );
  }

  const padding = { top: 24, right: 24, bottom: 36, left: 48 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const maxDD = Math.max(...withMetrics.map((s) => s.maxDrawdownPercent ?? 0), 1);
  const minDD = Math.min(...withMetrics.map((s) => s.maxDrawdownPercent ?? 0), 0);
  const maxSharpe = Math.max(...withMetrics.map((s) => s.sharpeRatio ?? 0), 0.5);
  const minSharpe = Math.min(...withMetrics.map((s) => s.sharpeRatio ?? 0), -0.5);

  const xDomain = [minDD - 2, maxDD + 2];
  const yDomain = [minSharpe - 0.2, maxSharpe + 0.2];

  const toX = (dd: number) =>
    padding.left + ((dd - xDomain[0]) / (xDomain[1] - xDomain[0])) * chartWidth;
  const toY = (sharpe: number) =>
    padding.top + chartHeight - ((sharpe - yDomain[0]) / (yDomain[1] - yDomain[0])) * chartHeight;

  return (
    <div className="rounded-xl border border-[var(--dash-divider)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--dash-divider)]">
        <h3 className="font-semibold text-[var(--text-primary)]">Risk vs Return</h3>
        <p className="text-xs text-[var(--dash-text-secondary)] mt-0.5">
          Lower risk (left) and higher return (up) is better. Click a point to view strategy.
        </p>
      </div>
      <div className="overflow-x-auto">
        <svg
          width={width}
          height={height}
          className="min-w-full"
        >
          <defs>
            <linearGradient id="pointGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#30d158" />
              <stop offset="100%" stopColor="#0ea5e9" />
            </linearGradient>
          </defs>
          {/* Axes */}
          <line
            x1={padding.left}
            y1={padding.top}
            x2={padding.left}
            y2={padding.top + chartHeight}
            stroke="var(--dash-divider)"
            strokeWidth={1}
          />
          <line
            x1={padding.left}
            y1={padding.top + chartHeight}
            x2={padding.left + chartWidth}
            y2={padding.top + chartHeight}
            stroke="var(--dash-divider)"
            strokeWidth={1}
          />
          {/* Y axis label */}
          <text
            x={12}
            y={padding.top + chartHeight / 2}
            fill="var(--dash-text-secondary)"
            fontSize={10}
            transform={`rotate(-90, 12, ${padding.top + chartHeight / 2})`}
            textAnchor="middle"
          >
            Sharpe (Return)
          </text>
          {/* X axis label */}
          <text
            x={padding.left + chartWidth / 2}
            y={height - 8}
            fill="var(--dash-text-secondary)"
            fontSize={10}
            textAnchor="middle"
          >
            Max DD % (Risk)
          </text>
          {/* Points */}
          {withMetrics.map((s) => {
            const x = toX(s.maxDrawdownPercent ?? 0);
            const y = toY(s.sharpeRatio ?? 0);
            return (
              <a
                key={s.id}
                href={`/trading/strategy/${s.id}`}
              >
                <g>
                  <circle
                    cx={x}
                    cy={y}
                    r={8}
                    fill="url(#pointGrad)"
                    fillOpacity={0.6}
                    className="cursor-pointer hover:fill-opacity-100 transition-opacity"
                  />
                  <title>
                    {s.name} — Sharpe {s.sharpeRatio?.toFixed(2)}, DD {s.maxDrawdownPercent?.toFixed(1)}%
                  </title>
                </g>
              </a>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
