"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { CommandCenter } from "./CommandCenter";
import { PositionLedger } from "./PositionLedger";
import { MarketDepth } from "./MarketDepth";
import { EquityChart } from "./EquityChart";
import { RiskDashboard } from "./RiskDashboard";
import { AlphaWorkbench } from "./AlphaWorkbench";
import { DataStream } from "./DataStream";
import { KeyboardShortcuts } from "./KeyboardShortcuts";
import { useKeyboardShortcuts as useKeyboard } from "./useKeyboardShortcuts";

interface Position {
  id: string;
  timestamp: number;
  direction: "over" | "under";
  size: number;
  entry: number;
  exit: number;
  pnl: number;
  status: "open" | "closed";
}

interface TerminalState {
  balance: number;
  sessionPnl: number;
  positions: Position[];
  equityData: { time: number; value: number; pnl: number }[];
  isAutoTrading: boolean;
  currentTarget: number;
  currentSize: number;
  currentDirection: "over" | "under";
}

export function QuantTerminal() {
  const [state, setState] = useState<TerminalState>({
    balance: 10000,
    sessionPnl: 0,
    positions: [],
    equityData: [{ time: Date.now(), value: 10000, pnl: 0 }],
    isAutoTrading: false,
    currentTarget: 50,
    currentSize: 100,
    currentDirection: "over",
  });

  const [logs, setLogs] = useState<Array<{ time: number; type: string; message: string }>>([]);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);

  // Add log entry
  const addLog = useCallback((type: string, message: string) => {
    setLogs((prev) => [{ time: Date.now(), type, message }, ...prev].slice(0, 100));
  }, []);

  // Execute position
  const executePosition = useCallback(async () => {
    const { currentTarget, currentSize, currentDirection, balance } = state;
    
    if (currentSize > balance) {
      addLog("error", "Insufficient balance for position");
      return;
    }

    const result = Math.random() * 100;
    const win = currentDirection === "over" ? result > currentTarget : result < currentTarget;
    const multiplier = currentDirection === "over" ? (100 - currentTarget) / currentTarget : currentTarget / (100 - currentTarget);
    const payout = win ? currentSize * (1 / (currentDirection === "over" ? (100 - currentTarget) / 100 : currentTarget / 100)) * 0.99 : 0;
    const pnl = payout - currentSize;

    const newPosition: Position = {
      id: `pos-${Date.now()}`,
      timestamp: Date.now(),
      direction: currentDirection,
      size: currentSize,
      entry: currentTarget,
      exit: result,
      pnl,
      status: "closed",
    };

    setState((prev) => ({
      ...prev,
      balance: prev.balance + pnl,
      sessionPnl: prev.sessionPnl + pnl,
      positions: [newPosition, ...prev.positions],
      equityData: [...prev.equityData, { time: Date.now(), value: prev.balance + pnl, pnl: prev.sessionPnl + pnl }],
    }));

    addLog("fill", `${currentDirection.toUpperCase()} ${currentSize}U @ ${currentTarget.toFixed(2)} → ${result.toFixed(2)} | PnL: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`);
  }, [state, addLog]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case "Enter":
            e.preventDefault();
            executePosition();
            break;
          case " ":
            e.preventDefault();
            setState((prev) => ({ ...prev, isAutoTrading: !prev.isAutoTrading }));
            break;
          case "k":
            e.preventDefault();
            setShowShortcuts(true);
            break;
        }
      } else {
        switch (e.key) {
          case "ArrowUp":
            e.preventDefault();
            setState((prev) => ({ ...prev, currentSize: prev.currentSize + (e.shiftKey ? 100 : 10) }));
            break;
          case "ArrowDown":
            e.preventDefault();
            setState((prev) => ({ ...prev, currentSize: Math.max(1, prev.currentSize - (e.shiftKey ? 100 : 10)) }));
            break;
          case "ArrowLeft":
            e.preventDefault();
            setState((prev) => ({ ...prev, currentTarget: Math.max(0.01, prev.currentTarget - (e.shiftKey ? 1 : 0.1)) }));
            break;
          case "ArrowRight":
            e.preventDefault();
            setState((prev) => ({ ...prev, currentTarget: Math.min(99.99, prev.currentTarget + (e.shiftKey ? 1 : 0.1)) }));
            break;
          case "t":
          case "T":
            e.preventDefault();
            setState((prev) => ({ ...prev, currentDirection: prev.currentDirection === "over" ? "under" : "over" }));
            break;
          case " ":
            e.preventDefault();
            executePosition();
            break;
          case "Escape":
            setShowShortcuts(false);
            break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [executePosition]);

  // Auto-trading simulation
  useEffect(() => {
    if (!state.isAutoTrading) return;

    const interval = setInterval(() => {
      executePosition();
    }, 2000);

    return () => clearInterval(interval);
  }, [state.isAutoTrading, executePosition]);

  const stats = useMemo(() => {
    const closedPositions = state.positions.filter((p) => p.status === "closed");
    const wins = closedPositions.filter((p) => p.pnl > 0).length;
    const total = closedPositions.length;
    const winRate = total > 0 ? (wins / total) * 100 : 0;
    const avgWin = total > 0 ? closedPositions.filter((p) => p.pnl > 0).reduce((a, b) => a + b.pnl, 0) / wins : 0;
    const avgLoss = total > 0 ? closedPositions.filter((p) => p.pnl < 0).reduce((a, b) => a + b.pnl, 0) / (total - wins) : 0;
    const maxDrawdown = Math.min(...state.equityData.map((d) => d.pnl), 0);
    const sharpe = total > 10 ? (state.sessionPnl / total) / (Math.sqrt(closedPositions.reduce((a, b) => a + Math.pow(b.pnl - state.sessionPnl / total, 2), 0) / total) || 1) : 0;

    return { wins, total, winRate, avgWin, avgLoss, maxDrawdown, sharpe };
  }, [state.positions, state.sessionPnl, state.equityData]);

  return (
    <div ref={terminalRef} className="quant-terminal min-h-screen flex flex-col overflow-hidden">
      {/* Command Center Header */}
      <CommandCenter
        balance={state.balance}
        sessionPnl={state.sessionPnl}
        winRate={stats.winRate}
        sharpe={stats.sharpe}
        isAutoTrading={state.isAutoTrading}
        onToggleAuto={() => setState((prev) => ({ ...prev, isAutoTrading: !prev.isAutoTrading }))}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden" style={{ gap: "var(--quant-panel-gap)" }}>
        {/* Left Panel - Position Ledger */}
        <div className="w-80 flex-shrink-0 flex flex-col" style={{ gap: "var(--quant-panel-gap)" }}>
          <PositionLedger positions={state.positions} />
          <RiskDashboard
            maxDrawdown={stats.maxDrawdown}
            sharpe={stats.sharpe}
            winRate={stats.winRate}
            avgWin={stats.avgWin}
            avgLoss={stats.avgLoss}
          />
        </div>

        {/* Center Panel - Chart & Execution */}
        <div className="flex-1 flex flex-col" style={{ gap: "var(--quant-panel-gap)" }}>
          {/* Equity Chart */}
          <div className="flex-1 quant-panel flex flex-col">
            <div className="quant-panel-header">
              <span>Equity Curve</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--quant-accent)]">PnL: {state.sessionPnl >= 0 ? "+" : ""}${state.sessionPnl.toFixed(2)}</span>
                <span className="text-xs text-[var(--quant-neutral)]">Return: {((state.sessionPnl / 10000) * 100).toFixed(2)}%</span>
              </div>
            </div>
            <div className="flex-1 quant-panel-content">
              <EquityChart data={state.equityData} />
            </div>
          </div>

          {/* Alpha Workbench */}
          <div className="h-64 quant-panel">
            <AlphaWorkbench
              currentTarget={state.currentTarget}
              currentSize={state.currentSize}
              currentDirection={state.currentDirection}
              onTargetChange={(target) => setState((prev) => ({ ...prev, currentTarget: target }))}
              onSizeChange={(size) => setState((prev) => ({ ...prev, currentSize: size }))}
              onDirectionChange={(direction) => setState((prev) => ({ ...prev, currentDirection: direction }))}
              onExecute={executePosition}
            />
          </div>
        </div>

        {/* Right Panel - Market Depth */}
        <div className="w-72 flex-shrink-0">
          <MarketDepth
            target={state.currentTarget}
            direction={state.currentDirection}
            size={state.currentSize}
            onExecute={executePosition}
          />
        </div>
      </div>

      {/* Data Stream Footer */}
      <DataStream logs={logs} />

      {/* Keyboard Shortcuts Modal */}
      {showShortcuts && <KeyboardShortcuts onClose={() => setShowShortcuts(false)} />}

      {/* Keyboard Hint */}
      <div className="fixed bottom-4 right-4 text-[10px] text-[var(--quant-neutral)] opacity-50 hover:opacity-100 transition-opacity">
        Press <kbd className="px-1 py-0.5 bg-[var(--quant-bg-card)] rounded">Ctrl+K</kbd> for shortcuts
      </div>
    </div>
  );
}
