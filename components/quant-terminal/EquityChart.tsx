"use client";

import { useRef, useState } from "react";

interface DataPoint {
  time: number;
  value: number;
  pnl: number;
}

interface EquityChartProps {
  data: DataPoint[];
}

export function EquityChart({ data }: EquityChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Chart dimensions
  const width = 800;
  const height = 400;
  const padding = { top: 40, right: 20, bottom: 50, left: 70 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Calculate scales
  const values = data.map((d) => d.value);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const dataRange = dataMax - dataMin;
  
  // Add padding to range (min 10% of value or at least $1)
  const minPadding = Math.max(dataRange * 0.1, 1);
  const chartMin = Math.max(0, dataMin - minPadding);
  const chartMax = dataMax + minPadding;
  const chartRange = chartMax - chartMin || 1;

  // Scale functions
  const xScale = (index: number) => {
    if (data.length <= 1) return padding.left + chartWidth / 2;
    return padding.left + (index / (data.length - 1)) * chartWidth;
  };
  
  const yScale = (value: number) => {
    return padding.top + chartHeight - ((value - chartMin) / chartRange) * chartHeight;
  };

  // Generate path
  const linePath = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${xScale(i)} ${yScale(d.value)}`)
    .join(" ");

  const areaPath = `${linePath} L ${xScale(data.length - 1)} ${padding.top + chartHeight} L ${padding.left} ${padding.top + chartHeight} Z`;

  // Handle mouse move
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || data.length === 0) return;
    
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    
    // Calculate which data point is closest
    const relativeX = (x - padding.left) / chartWidth;
    const index = Math.round(relativeX * (data.length - 1));
    const clampedIndex = Math.max(0, Math.min(data.length - 1, index));
    
    setHoverIndex(clampedIndex);
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  // Format time
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toISOString().split("T")[1].split(".")[0];
  };

  // Format currency
  const formatCurrency = (value: number) => {
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
    return `$${value.toFixed(0)}`;
  };

  // Generate Y-axis tick values
  const yTicks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="relative w-full h-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-full"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Gradient Definition */}
        <defs>
          <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--quant-accent)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--quant-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Background Grid */}
        <rect
          x={padding.left}
          y={padding.top}
          width={chartWidth}
          height={chartHeight}
          fill="var(--quant-bg-card)"
          rx="4"
          opacity="0.3"
        />

        {/* Horizontal Grid Lines */}
        {yTicks.map((tick) => {
          const y = padding.top + chartHeight * tick;
          return (
            <line
              key={`h-${tick}`}
              x1={padding.left}
              y1={y}
              x2={padding.left + chartWidth}
              y2={y}
              stroke="var(--quant-border)"
              strokeWidth="1"
              opacity="0.5"
            />
          );
        })}

        {/* Vertical Grid Lines */}
        {[0, 0.5, 1].map((tick) => {
          const x = padding.left + chartWidth * tick;
          return (
            <line
              key={`v-${tick}`}
              x1={x}
              y1={padding.top}
              x2={x}
              y2={padding.top + chartHeight}
              stroke="var(--quant-border)"
              strokeWidth="1"
              opacity="0.3"
            />
          );
        })}

        {/* Area Fill */}
        {data.length > 1 && (
          <path d={areaPath} fill="url(#chartGradient)" />
        )}

        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke="var(--quant-accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data Points */}
        {data.map((d, i) => (
          <circle
            key={i}
            cx={xScale(i)}
            cy={yScale(d.value)}
            r={i === hoverIndex ? "5" : "3"}
            fill={i === hoverIndex ? "white" : "var(--quant-accent)"}
            stroke="var(--quant-accent)"
            strokeWidth="2"
            style={{ transition: "all 0.2s ease" }}
          />
        ))}

        {/* Y-Axis Labels */}
        {yTicks.map((tick) => {
          const value = chartMin + chartRange * (1 - tick);
          return (
            <text
              key={`y-${tick}`}
              x={padding.left - 10}
              y={padding.top + chartHeight * tick + 4}
              textAnchor="end"
              fill="var(--quant-neutral)"
              fontSize="10"
              fontFamily="var(--font-mono)"
            >
              {formatCurrency(value)}
            </text>
          );
        })}

        {/* X-Axis Labels */}
        {data.length > 0 && [0, 0.5, 1].map((tick) => {
          const index = Math.round((data.length - 1) * tick);
          if (!data[index]) return null;
          return (
            <text
              key={`x-${tick}`}
              x={padding.left + chartWidth * tick}
              y={padding.top + chartHeight + 25}
              textAnchor="middle"
              fill="var(--quant-neutral)"
              fontSize="10"
              fontFamily="var(--font-mono)"
            >
              {formatTime(data[index].time)}
            </text>
          );
        })}

        {/* Crosshair */}
        {hoverIndex !== null && (
          <>
            <line
              x1={xScale(hoverIndex)}
              y1={padding.top}
              x2={xScale(hoverIndex)}
              y2={padding.top + chartHeight}
              stroke="var(--quant-accent)"
              strokeWidth="1"
              strokeDasharray="4,4"
              opacity="0.5"
            />
            <line
              x1={padding.left}
              y1={yScale(data[hoverIndex].value)}
              x2={padding.left + chartWidth}
              y2={yScale(data[hoverIndex].value)}
              stroke="var(--quant-accent)"
              strokeWidth="1"
              strokeDasharray="4,4"
              opacity="0.3"
            />
          </>
        )}
      </svg>

      {/* Tooltip */}
      {hoverIndex !== null && data[hoverIndex] && (
        <div
          className="absolute pointer-events-none bg-[var(--quant-bg-surface)] border border-[var(--quant-border-strong)] rounded px-3 py-2 text-xs z-10 shadow-xl"
          style={{
            left: Math.min(xScale(hoverIndex) + 10, width - 150),
            top: Math.max(yScale(data[hoverIndex].value) - 60, 10),
          }}
        >
          <div className="font-mono text-[var(--quant-neutral)] text-[10px] mb-1">
            {formatTime(data[hoverIndex].time)}
          </div>
          <div className="font-mono font-bold text-[13px] text-white">
            ${data[hoverIndex].value.toFixed(2)}
          </div>
          <div className={`font-mono text-[11px] ${data[hoverIndex].pnl >= 0 ? "text-bullish" : "text-bearish"}`}>
            {data[hoverIndex].pnl >= 0 ? "+" : ""}${data[hoverIndex].pnl.toFixed(2)}
          </div>
        </div>
      )}

      {/* Empty State */}
      {data.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-[var(--quant-neutral)] text-sm">No data available</p>
        </div>
      )}
    </div>
  );
}
