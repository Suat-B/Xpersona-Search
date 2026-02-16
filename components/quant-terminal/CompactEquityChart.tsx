"use client";

import { useRef, useState } from "react";

interface DataPoint {
  time: number;
  value: number;
  pnl: number;
}

interface CompactEquityChartProps {
  data: DataPoint[];
}

export function CompactEquityChart({ data }: CompactEquityChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Compact chart dimensions
  const width = 400;
  const height = 100;
  const padding = { top: 10, right: 10, bottom: 20, left: 50 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Handle empty data
  if (data.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <span className="text-[var(--quant-neutral)] text-xs">No data</span>
      </div>
    );
  }

  // Calculate scales with better handling for flat lines
  const values = data.map((d) => d.value);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const dataRange = dataMax - dataMin;
  
  // When all values are the same, create a range around it
  let chartMin, chartMax, chartRange;
  if (dataRange === 0) {
    // Create ±10% range around the single value
    const padding = Math.max(dataMin * 0.1, 10); // At least 10% or $10
    chartMin = Math.max(0, dataMin - padding);
    chartMax = dataMax + padding;
  } else {
    // Add 5% padding on both ends
    const padding = dataRange * 0.05;
    chartMin = Math.max(0, dataMin - padding);
    chartMax = dataMax + padding;
  }
  chartRange = chartMax - chartMin || 1;

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
    
    const relativeX = (x - padding.left) / chartWidth;
    const index = Math.round(relativeX * (data.length - 1));
    const clampedIndex = Math.max(0, Math.min(data.length - 1, index));
    
    setHoverIndex(clampedIndex);
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  // Format currency with no duplicates
  const formatCurrency = (value: number) => {
    if (value >= 10000) return `$${(value / 1000).toFixed(0)}k`;
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
    return `$${value.toFixed(0)}`;
  };

  // Only show 3 Y-axis labels (top, middle, bottom) with distinct values
  const yLabels = [chartMax, (chartMax + chartMin) / 2, chartMin];

  return (
    <div className="relative w-full h-full flex items-center">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-full"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="miniChartGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--quant-accent)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--quant-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Y-Axis Labels */}
        {yLabels.map((value, i) => (
          <text
            key={`y-${i}`}
            x={padding.left - 5}
            y={yScale(value) + 3}
            textAnchor="end"
            fill="var(--quant-neutral)"
            fontSize="8"
            fontFamily="var(--font-mono)"
          >
            {formatCurrency(value)}
          </text>
        ))}

        {/* Grid Line (middle only) */}
        <line
          x1={padding.left}
          y1={yScale(yLabels[1])}
          x2={padding.left + chartWidth}
          y2={yScale(yLabels[1])}
          stroke="var(--quant-border)"
          strokeWidth="1"
          opacity="0.3"
        />

        {/* Area Fill */}
        <path d={areaPath} fill="url(#miniChartGradient)" />

        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke="var(--quant-accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Current value indicator */}
        <circle
          cx={xScale(data.length - 1)}
          cy={yScale(data[data.length - 1].value)}
          r="4"
          fill="var(--quant-accent)"
          stroke="white"
          strokeWidth="2"
        />

        {/* Hover indicator */}
        {hoverIndex !== null && (
          <>
            <line
              x1={xScale(hoverIndex)}
              y1={padding.top}
              x2={xScale(hoverIndex)}
              y2={padding.top + chartHeight}
              stroke="var(--quant-accent)"
              strokeWidth="1"
              strokeDasharray="3,3"
              opacity="0.5"
            />
            <circle
              cx={xScale(hoverIndex)}
              cy={yScale(data[hoverIndex].value)}
              r="3"
              fill="white"
            />
          </>
        )}
      </svg>

      {/* Mini Tooltip */}
      {hoverIndex !== null && data[hoverIndex] && (
        <div
          className="absolute pointer-events-none bg-[var(--quant-bg-surface)] border border-[var(--quant-border)] rounded px-2 py-1 text-[10px] z-10"
          style={{
            left: `${(xScale(hoverIndex) / width) * 100}%`,
            top: "5px",
            transform: "translateX(-50%)",
          }}
        >
          <span className={data[hoverIndex].pnl >= 0 ? "text-bullish" : "text-bearish"}>
            {data[hoverIndex].pnl >= 0 ? "+" : ""}${data[hoverIndex].pnl.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}
