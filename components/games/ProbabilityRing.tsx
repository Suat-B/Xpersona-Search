"use client";

import { useId, useMemo } from "react";

interface ProbabilityRingProps {
  winProbability: number;
  /** Hero mode: thicker stroke, tick marks, glow filter */
  hero?: boolean;
}

export function ProbabilityRing({ winProbability, hero = false }: ProbabilityRingProps) {
  const id = useId();
  const baseId = id.replace(/:/g, "");
  const gradId = `prob-ring-grad-${baseId}`;
  const glowId = `prob-ring-glow-${baseId}`;
  const pct = Math.max(0, Math.min(100, winProbability));
  const radius = hero ? 56 : 52;
  const circumference = 2 * Math.PI * radius;
  const strokeDash = (pct / 100) * circumference;
  const strokeWidth = hero ? 5 : 4;
  const viewBox = hero ? "0 0 130 130" : "0 0 120 120";
  const cx = hero ? 65 : 60;
  const cy = hero ? 65 : 60;

  const tickMarks = useMemo(() => {
    if (!hero) return null;
    const ticks = [25, 50, 75];
    return ticks.map((tickPct) => {
      const angle = (tickPct / 100) * 360 - 90;
      const rad = (angle * Math.PI) / 180;
      const innerR = radius - 8;
      const outerR = radius + 8;
      const x1 = cx + innerR * Math.cos(rad);
      const y1 = cy + innerR * Math.sin(rad);
      const x2 = cx + outerR * Math.cos(rad);
      const y2 = cy + outerR * Math.sin(rad);
      return (
        <line
          key={tickPct}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="rgba(255,255,255,0.15)"
          strokeWidth={1}
          strokeLinecap="round"
        />
      );
    });
  }, [hero, radius, cx, cy]);

  const probColor = pct >= 60 ? "#30d158" : pct >= 40 ? "#0ea5e9" : pct >= 20 ? "#ff9f0a" : "#ff453a";

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={probColor} stopOpacity={0.4} />
          <stop offset="100%" stopColor={probColor} stopOpacity={0.9} />
        </linearGradient>
        {hero && (
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>

      {/* Background arc */}
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={strokeWidth}
      />

      {/* Tick marks at 25%, 50%, 75% */}
      {tickMarks}

      {/* Filled probability arc */}
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth={strokeWidth}
        strokeDasharray={`${strokeDash} ${circumference}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        filter={hero ? `url(#${glowId})` : undefined}
        style={{
          transition: "stroke-dasharray 0.5s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      />

      {/* Probability percentage label (hero only) */}
      {hero && (
        <text
          x={cx}
          y={cy + radius + 18}
          textAnchor="middle"
          fill="rgba(255,255,255,0.4)"
          fontSize="9"
          fontFamily="ui-monospace, monospace"
          fontWeight="600"
        >
          {pct.toFixed(1)}% WIN
        </text>
      )}
    </svg>
  );
}
