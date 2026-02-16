"use client";

interface MomentumMeterProps {
  recentResults: { win: boolean }[];
  compact?: boolean;
}

export function MomentumMeter({ recentResults, compact = false }: MomentumMeterProps) {
  const last10 = recentResults.slice(-10);
  const wins = last10.filter((r) => r.win).length;
  const heatPercent = last10.length === 0 ? 50 : (wins / last10.length) * 100;

  const isHot = heatPercent >= 80;
  const isCold = heatPercent <= 20 && last10.length >= 3;
  const isFireMode = heatPercent >= 90 && last10.length >= 5;

  return (
    <div className={`w-full flex-shrink-0 ${compact ? "space-y-1" : "space-y-1.5"}`}>
      <div className="flex items-center justify-between gap-1">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
          Momentum
        </span>
        <div className="flex items-center gap-1.5">
          {isFireMode && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-[#0ea5e9]/20 text-[#0ea5e9] border border-[#0ea5e9]/40 animate-glow-pulse">
              &#128293; FIRE
            </span>
          )}
          {isHot && !isFireMode && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-[#0ea5e9]/15 text-[#0ea5e9] border border-[#0ea5e9]/30">
              HOT
            </span>
          )}
          {isCold && !isHot && (
            <span className="text-[9px] text-[var(--text-tertiary)] font-medium">Warming up&hellip;</span>
          )}
        </div>
      </div>

      {/* Segmented dot array: last 10 results */}
      <div className="flex items-center gap-1">
        {last10.length === 0 ? (
          Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 h-2 rounded-full bg-white/[0.04]"
            />
          ))
        ) : (
          <>
            {last10.map((r, i) => (
              <div
                key={i}
                className={`flex-1 h-2 rounded-full transition-all duration-300 ${
                  r.win
                    ? isFireMode
                      ? "fire-mode-bar"
                      : "bg-[#30d158] shadow-[0_0_4px_rgba(48,209,88,0.3)]"
                    : "bg-[#ff453a]/60"
                }`}
              />
            ))}
            {Array.from({ length: Math.max(0, 10 - last10.length) }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="flex-1 h-2 rounded-full bg-white/[0.04]"
              />
            ))}
          </>
        )}
      </div>

      {/* Continuous bar underneath */}
      <div className={`relative w-full rounded-full overflow-hidden bg-white/[0.04] ${compact ? "h-1" : "h-1.5"}`}>
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out relative overflow-hidden ${
            isFireMode ? "fire-mode-bar" : ""
          }`}
          style={{
            width: `${heatPercent}%`,
            background: isFireMode ? undefined : "#0ea5e9",
            boxShadow: isHot ? "0 0 8px rgba(14, 165, 233, 0.4)" : undefined,
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
