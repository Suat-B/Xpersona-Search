"use client";

import { useMemo } from "react";

interface MarketDepthProps {
  target: number;
  direction: "over" | "under";
  size: number;
  onExecute: () => void;
  isLoading?: boolean;
  /** When true, AI is driving — disable Execute */
  aiDriving?: boolean;
}

export function MarketDepth({ target, direction, size, onExecute, isLoading = false, aiDriving = false }: MarketDepthProps) {
  const probabilityData = useMemo(() => {
    const steps = 10; // Reduced from 20 to fit better
    const data = [];
    
    for (let i = 0; i <= steps; i++) {
      const threshold = (i / steps) * 100;
      const prob = direction === "over" 
        ? (100 - threshold) / 100 
        : threshold / 100;
      
      data.push({
        threshold: threshold.toFixed(0),
        probability: prob,
        isCurrent: Math.abs(threshold - target) < 5,
      });
    }
    
    return data;
  }, [target, direction]);

  const maxProb = Math.max(...probabilityData.map((d) => d.probability));
  const currentProb = direction === "over" ? (100 - target) / 100 : target / 100;
  const expectedValue = size * (currentProb * (1 / currentProb) * 0.99 - 1);

  return (
    <div className="quant-panel h-full flex flex-col">
      <div className="quant-panel-header">
        <span>Market Depth</span>
        <span className="text-[10px] text-[var(--quant-neutral)]">{direction === "over" ? "LONG" : "SHORT"}</span>
      </div>

      <div className="flex-1 min-h-0 p-4 flex flex-col gap-4 overflow-hidden">
        {/* Probability Visualization — scrolls when space is tight */}
        <div className="flex-1 min-h-0 flex flex-col gap-1 overflow-auto">
          <div className="flex justify-between text-[10px] text-[var(--quant-neutral)] mb-1">
            <span>{direction === "over" ? "0%" : "100%"}</span>
            <span>Probability Distribution</span>
            <span>{direction === "over" ? "100%" : "0%"}</span>
          </div>

          <div className="flex-1 flex flex-col justify-center gap-0.5">
            {probabilityData.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="w-6 text-[9px] text-[var(--quant-neutral)] font-mono">
                  {item.threshold}%
                </span>
                <div className="flex-1 h-3 bg-[var(--quant-bg-card)] rounded-sm overflow-hidden relative">
                  <div
                    className={`h-full transition-all duration-300 ${
                      item.isCurrent
                        ? "bg-[var(--quant-accent)]"
                        : "bg-[var(--quant-neutral)]/30"
                    }`}
                    style={{ width: `${(item.probability / maxProb) * 100}%` }}
                  />
                  {item.isCurrent && (
                    <div className="absolute inset-0 animate-pulse bg-[var(--quant-accent)]/30" />
                  )}
                </div>
                <span className="w-10 text-[9px] font-mono text-right">
                  {(item.probability * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Current Settings + Execute — always visible, never shrinks */}
        <div className="flex-shrink-0 space-y-2 pt-3 border-t border-[var(--quant-border)]">
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
            <div>
              <span className="text-[var(--quant-neutral)] text-[10px]">Target:</span>
              <div className="font-mono font-bold text-[11px]">{target.toFixed(2)}%</div>
            </div>
            <div>
              <span className="text-[var(--quant-neutral)] text-[10px]">Size:</span>
              <div className="font-mono font-bold text-[11px]">{size} U</div>
            </div>
            <div>
              <span className="text-[var(--quant-neutral)] text-[10px]">Prob:</span>
              <div className="font-mono font-bold text-accent text-[11px]">{(currentProb * 100).toFixed(1)}%</div>
            </div>
            <div>
              <span className="text-[var(--quant-neutral)] text-[10px]">EV:</span>
              <div className={`font-mono font-bold text-[11px] ${expectedValue >= 0 ? "text-bearish" : "text-neutral"}`}>
                {expectedValue >= 0 ? "" : "-"}${Math.abs(expectedValue).toFixed(2)}
              </div>
            </div>
          </div>

          {/* Execute Button */}
          <button
            onClick={onExecute}
            disabled={isLoading || aiDriving}
            className="w-full quant-btn quant-btn-primary h-10 text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
            title={aiDriving ? "AI is playing — watch only" : "Execute position"}
          >
            {aiDriving ? (
              <>
                <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse mr-2" />
                LIVE — AI playing
              </>
            ) : isLoading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                STARTING...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                START STRATEGY
              </>
            )}
          </button>

          <p className="text-[9px] text-center text-[var(--quant-neutral)]">
            Press <kbd className="px-1 bg-[var(--quant-bg-card)] rounded">Space</kbd> or <kbd className="px-1 bg-[var(--quant-bg-card)] rounded">Ctrl+Enter</kbd>
          </p>
        </div>
      </div>
    </div>
  );
}
