"use client";

interface MomentumMeterProps {
  /** Last N results; true = win, false = loss. Uses last 10 for heat calculation. */
  recentResults: { win: boolean }[];
  /** Optional compact mode for tighter layout */
  compact?: boolean;
}

export function MomentumMeter({ recentResults, compact = false }: MomentumMeterProps) {
  const last10 = recentResults.slice(-10);
  const wins = last10.filter((r) => r.win).length;
  const heatPercent = last10.length === 0 ? 50 : (wins / last10.length) * 100;

  const isHot = heatPercent >= 80;
  const isCold = heatPercent <= 20 && last10.length >= 3;

  return (
    <div className={`w-full flex-shrink-0 ${compact ? "space-y-0.5" : "space-y-1.5"}`}>
      <div className="flex items-center justify-between gap-1">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
          Momentum
        </span>
        <div className="flex items-center gap-1.5">
          {isHot && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-[#0ea5e9]/20 text-[#0ea5e9] border border-[#0ea5e9]/40">
              HOT
            </span>
          )}
          {isCold && !isHot && (
            <span className="text-[9px] text-[var(--text-tertiary)] font-medium">Warming up…</span>
          )}
        </div>
      </div>
      <div className={`relative w-full rounded-full overflow-hidden bg-white/[0.06] ${compact ? "h-1.5" : "h-2"}`}>
        <div
          className="h-full rounded-full transition-all duration-500 ease-out relative overflow-hidden"
          style={{
            width: `${heatPercent}%`,
            background: "#0ea5e9",
          }}
        >
          {heatPercent > 5 && (
            <div
              className="absolute inset-0 opacity-30 animate-momentum-shimmer"
              style={{
                background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)",
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
