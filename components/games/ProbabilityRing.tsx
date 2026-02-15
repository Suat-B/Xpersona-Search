"use client";

/** SVG probability ring around the dice — win chance arc (0–100%) */
export function ProbabilityRing({ winProbability }: { winProbability: number }) {
  const pct = Math.max(0, Math.min(100, winProbability));
  const circumference = 2 * Math.PI * 52;
  const strokeDash = (pct / 100) * circumference;

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 120 120"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="prob-ring-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.4} />
          <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.9} />
        </linearGradient>
      </defs>
      {/* Background arc */}
      <circle
        cx="60"
        cy="60"
        r="52"
        fill="none"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="4"
      />
      {/* Filled probability arc */}
      <circle
        cx="60"
        cy="60"
        r="52"
        fill="none"
        stroke="url(#prob-ring-grad)"
        strokeWidth="4"
        strokeDasharray={`${strokeDash} ${circumference}`}
        strokeLinecap="round"
        transform="rotate(-90 60 60)"
      />
    </svg>
  );
}
