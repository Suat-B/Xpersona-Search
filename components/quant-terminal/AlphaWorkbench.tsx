"use client";

import { useState } from "react";
import { SavedStrategiesWorkbenchPanel } from "./SavedStrategiesWorkbenchPanel";
import type { AdvancedDiceStrategy } from "@/lib/advanced-strategy-types";

interface AlphaWorkbenchProps {
  currentTarget: number;
  currentSize: number;
  currentDirection: "over" | "under";
  onTargetChange: (target: number) => void;
  onSizeChange: (size: number) => void;
  onDirectionChange: (direction: "over" | "under") => void;
  onExecute: () => void;
  isLoading?: boolean;
  lastResult?: { exit: number; win: boolean } | null;
  /** Run saved advanced strategy by ID */
  onRunStrategy?: (strategyId: string, maxRounds: number) => void;
  /** Load strategy base config into manual mode */
  onLoadToManual?: (strategy: AdvancedDiceStrategy) => void;
  /** ID of strategy currently running (only that Run button shows "Running…") */
  runningStrategyId?: string | null;
}

export function AlphaWorkbench({
  currentTarget,
  currentSize,
  currentDirection,
  onTargetChange,
  onSizeChange,
  onDirectionChange,
  onExecute,
  isLoading = false,
  lastResult,
  onRunStrategy,
  onLoadToManual,
  runningStrategyId = null,
}: AlphaWorkbenchProps) {
  const [activeTab, setActiveTab] = useState<"manual" | "strategy">("manual");

  const probability = currentDirection === "over" ? (100 - currentTarget) / 100 : currentTarget / 100;
  const multiplier = 1 / probability;
  const payout = currentSize * multiplier * 0.99;

  const quickSizes = [10, 25, 50, 100, 250, 500];

  return (
    <div className="quant-panel h-full flex flex-col">
      <div className="quant-panel-header">
        <div className="flex items-center gap-4">
          <span>Alpha Workbench</span>
          <div className="flex items-center gap-1">
            {["manual", "strategy"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as "manual" | "strategy")}
                className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                  activeTab === tab
                    ? "bg-[var(--quant-accent)] text-black font-bold"
                    : "text-[var(--quant-neutral)] hover:text-white"
                }`}
              >
                {tab.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 p-4">
        {activeTab === "manual" ? (
          <div className="h-full flex flex-col gap-4">
            {/* Exit Number — subtle result display */}
            {lastResult && (
              <div
                className="flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-[var(--quant-bg-card)] border border-[var(--quant-border)] animate-count-up"
              >
                <span className="text-xs text-[var(--quant-neutral)]">
                  Exit
                </span>
                <span
                  className={`text-lg font-mono font-medium tabular-nums ${lastResult.win ? "text-bullish" : "text-bearish"}`}
                >
                  {lastResult.exit.toFixed(2)}
                </span>
              </div>
            )}

            {/* Direction Toggle */}
            <div className="flex gap-2">
              {(["over", "under"] as const).map((dir) => (
                <button
                  key={dir}
                  onClick={() => onDirectionChange(dir)}
                  className={`flex-1 py-2 px-4 rounded text-sm font-bold transition-all ${
                    currentDirection === dir
                      ? dir === "over"
                        ? "bg-[var(--quant-accent)] text-black"
                        : "bg-[var(--quant-purple)] text-white"
                      : "bg-[var(--quant-bg-card)] text-[var(--quant-neutral)] hover:text-white"
                  }`}
                >
                  {dir === "over" ? "LONG" : "SHORT"}
                </button>
              ))}
            </div>

            {/* Target Control */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-[10px] uppercase tracking-wider text-[var(--quant-neutral)]">
                  Target Threshold
                </label>
                <span className="font-mono text-sm font-bold">{currentTarget.toFixed(2)}%</span>
              </div>
              <input
                type="range"
                min="0.01"
                max="99.99"
                step="0.01"
                value={currentTarget}
                onChange={(e) => onTargetChange(parseFloat(e.target.value))}
                className="w-full h-2 bg-[var(--quant-bg-card)] rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, var(--quant-accent) 0%, var(--quant-accent) ${currentTarget}%, var(--quant-bg-card) ${currentTarget}%, var(--quant-bg-card) 100%)`,
                }}
              />
              <div className="flex justify-between text-[10px] text-[var(--quant-neutral)]">
                <span>0.01%</span>
                <span>99.99%</span>
              </div>
            </div>

            {/* Size Control */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-[10px] uppercase tracking-wider text-[var(--quant-neutral)]">
                  Position Size
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={currentSize}
                    onChange={(e) => onSizeChange(Math.max(1, parseInt(e.target.value) || 0))}
                    className="quant-input w-24 text-right"
                  />
                  <span className="text-sm text-[var(--quant-neutral)]">U</span>
                </div>
              </div>
              <div className="flex gap-1">
                {quickSizes.map((size) => (
                  <button
                    key={size}
                    onClick={() => onSizeChange(size)}
                    className={`flex-1 py-1.5 px-2 text-[11px] rounded transition-colors ${
                      currentSize === size
                        ? "bg-[var(--quant-accent)] text-black font-bold"
                        : "bg-[var(--quant-bg-card)] text-[var(--quant-neutral)] hover:text-white"
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* Trade Summary */}
            <div className="mt-auto p-3 bg-[var(--quant-bg-card)] rounded border border-[var(--quant-border)]">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-[var(--quant-neutral)]">Probability:</span>
                  <div className="font-mono font-bold text-accent">{(probability * 100).toFixed(1)}%</div>
                </div>
                <div>
                  <span className="text-[var(--quant-neutral)]">Multiplier:</span>
                  <div className="font-mono font-bold">{multiplier.toFixed(2)}x</div>
                </div>
                <div>
                  <span className="text-[var(--quant-neutral)]">Potential Payout:</span>
                  <div className="font-mono font-bold text-bullish">${payout.toFixed(2)}</div>
                </div>
                <div>
                  <span className="text-[var(--quant-neutral)]">Max Profit:</span>
                  <div className="font-mono font-bold text-bullish">+${(payout - currentSize).toFixed(2)}</div>
                </div>
              </div>
            </div>
          </div>
        ) : onRunStrategy ? (
          <SavedStrategiesWorkbenchPanel
            onRun={onRunStrategy}
            onLoadToManual={onLoadToManual}
            runningStrategyId={runningStrategyId}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-[var(--quant-neutral)]">
            <div className="text-center">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <p className="text-sm">Strategy builder moved!</p>
              <p className="text-xs mt-1">Go to Strategies → Advanced Strategy Builder</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
