"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { fetchBalanceWithRetry } from "@/lib/safeFetch";
import { CommandCenter } from "./CommandCenter";
import { PositionLedger } from "./PositionLedger";
import { MarketDepth } from "./MarketDepth";
import { CompactEquityChart } from "./CompactEquityChart";
import { RiskDashboard } from "./RiskDashboard";
import { AlphaWorkbench } from "./AlphaWorkbench";
import { DataStream } from "./DataStream";
import { KeyboardShortcuts } from "./KeyboardShortcuts";

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

interface QuantDiceGameProps {
  /** Server-hydrated balance for instant NAV display; client will refresh. */
  initialBalance?: number | null;
}

export function QuantDiceGame({ initialBalance: serverBalance }: QuantDiceGameProps) {
  // Use server-provided balance immediately if available, else null until client fetch
  const [balance, setBalance] = useState<number | null>(serverBalance ?? null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(serverBalance == null);
  const [sessionPnl, setSessionPnl] = useState(0);
  const [positions, setPositions] = useState<Position[]>([]);
  const [equityData, setEquityData] = useState<{ time: number; value: number; pnl: number }[]>(
    serverBalance != null ? [{ time: Date.now(), value: serverBalance, pnl: 0 }] : []
  );
  const [isAutoTrading, setIsAutoTrading] = useState(false);
  const [currentTarget, setCurrentTarget] = useState(50);
  const [currentSize, setCurrentSize] = useState(100);
  const [currentDirection, setCurrentDirection] = useState<"over" | "under">("over");
  const [logs, setLogs] = useState<Array<{ time: number; type: string; message: string }>>([]);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const loadBalanceRef = useRef<((showLoading?: boolean) => Promise<boolean>) | null>(null);

  // Load real balance — skip if server provided it; else delay for EnsureGuest, use shared retry logic
  useEffect(() => {
    let mounted = true;

    const loadBalance = async (showLoading = true) => {
      if (showLoading) setIsLoadingBalance(true);
      try {
        const loadedBalance = await fetchBalanceWithRetry();
        if (!mounted) return;
        if (loadedBalance != null) {
          setBalance(loadedBalance);
          setEquityData((prev) =>
            prev.length
              ? [...prev.slice(0, -1), { time: Date.now(), value: loadedBalance, pnl: prev[prev.length - 1]?.pnl ?? 0 }]
              : [{ time: Date.now(), value: loadedBalance, pnl: 0 }]
          );
          setIsLoadingBalance(false);
          return true;
        }
        if (showLoading) setIsLoadingBalance(false);
        return false;
      } catch {
        if (mounted && showLoading) setIsLoadingBalance(false);
        return false;
      }
    };

    const runInitialLoad = () => {
      loadBalance(serverBalance == null).then((ok) => {
        if (mounted && !ok) setTimeout(() => loadBalance(true), 2500);
      });
    };

    loadBalanceRef.current = loadBalance;

    if (serverBalance != null) {
      // Server gave us balance — refresh in background, listen for updates
      const t = setTimeout(() => loadBalance(false), 500);
      const handleBalanceUpdate = () => loadBalance(false);
      window.addEventListener("balance-updated", handleBalanceUpdate);
      return () => {
        mounted = false;
        loadBalanceRef.current = null;
        clearTimeout(t);
        window.removeEventListener("balance-updated", handleBalanceUpdate);
      };
    }

    // No server balance — give EnsureGuest ~300ms, then fetch with retry
    const timeoutId = setTimeout(runInitialLoad, 300);
    const safetyTimeout = setTimeout(() => {
      if (mounted) setIsLoadingBalance(false);
    }, 12000);

    const handleBalanceUpdate = () => {
      loadBalance(false).then((gotBalance) => {
        if (mounted && gotBalance) setIsLoadingBalance(false);
      });
    };
    window.addEventListener("balance-updated", handleBalanceUpdate);

    return () => {
      mounted = false;
      loadBalanceRef.current = null;
      clearTimeout(timeoutId);
      clearTimeout(safetyTimeout);
      window.removeEventListener("balance-updated", handleBalanceUpdate);
    };
  }, [serverBalance]);

  const handleRetryBalance = useCallback(() => {
    loadBalanceRef.current?.(true);
  }, []);

  // Add log entry
  const addLog = useCallback((type: string, message: string) => {
    setLogs((prev) => [{ time: Date.now(), type, message }, ...prev].slice(0, 100));
  }, []);

  // Execute position via API
  const executePosition = useCallback(async () => {
    if (isLoading) return;
    
    if (balance === null) {
      addLog("error", "Balance not loaded yet");
      return;
    }
    
    if (currentSize > balance) {
      addLog("error", "Insufficient balance for position");
      return;
    }

    setIsLoading(true);
    
    try {
      const response = await fetch("/api/games/dice/round", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          amount: currentSize,
          target: currentTarget,
          condition: currentDirection,
        }),
      });

      const data = await response.json();

      if (data.success && data.data) {
        const { result, win, payout, balance: newBalance } = data.data;
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

        setBalance(newBalance);
        setSessionPnl((prev) => prev + pnl);
        setPositions((prev) => [newPosition, ...prev]);
        setEquityData((prev) => [...prev, { time: Date.now(), value: newBalance, pnl: sessionPnl + pnl }]);

        addLog("fill", `${currentDirection.toUpperCase()} ${currentSize}U @ ${currentTarget.toFixed(2)} → ${result.toFixed(2)} | PnL: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`);
        
        window.dispatchEvent(new Event("balance-updated"));
      } else {
        addLog("error", data.error || data.message || "Execution failed");
      }
    } catch (err) {
      addLog("error", "Network error - check connection");
    } finally {
      setIsLoading(false);
    }
  }, [currentTarget, currentSize, currentDirection, balance, sessionPnl, isLoading, addLog]);

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
            setIsAutoTrading((prev) => !prev);
            break;
          case "k":
          case "K":
            e.preventDefault();
            setShowShortcuts(true);
            break;
        }
      } else {
        switch (e.key) {
          case "ArrowUp":
            e.preventDefault();
            setCurrentSize((prev) => prev + (e.shiftKey ? 100 : 10));
            break;
          case "ArrowDown":
            e.preventDefault();
            setCurrentSize((prev) => Math.max(1, prev - (e.shiftKey ? 100 : 10)));
            break;
          case "ArrowLeft":
            e.preventDefault();
            setCurrentTarget((prev) => Math.max(0.01, prev - (e.shiftKey ? 1 : 0.1)));
            break;
          case "ArrowRight":
            e.preventDefault();
            setCurrentTarget((prev) => Math.min(99.99, prev + (e.shiftKey ? 1 : 0.1)));
            break;
          case "t":
          case "T":
            e.preventDefault();
            setCurrentDirection((prev) => (prev === "over" ? "under" : "over"));
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
    if (!isAutoTrading) return;

    const interval = setInterval(() => {
      executePosition();
    }, 2000);

    return () => clearInterval(interval);
  }, [isAutoTrading, executePosition]);

  // Calculate stats
  const stats = useMemo(() => {
    const closedPositions = positions.filter((p) => p.status === "closed");
    const wins = closedPositions.filter((p) => p.pnl > 0).length;
    const total = closedPositions.length;
    const winRate = total > 0 ? (wins / total) * 100 : 0;
    const avgWin = total > 0 && wins > 0 
      ? closedPositions.filter((p) => p.pnl > 0).reduce((a, b) => a + b.pnl, 0) / wins 
      : 0;
    const avgLoss = total > 0 && total - wins > 0 
      ? closedPositions.filter((p) => p.pnl < 0).reduce((a, b) => a + b.pnl, 0) / (total - wins) 
      : 0;
    const maxDrawdown = Math.min(...equityData.map((d) => d.pnl), 0);
    const sharpe = total > 10 
      ? (sessionPnl / total) / (Math.sqrt(closedPositions.reduce((a, b) => a + Math.pow(b.pnl - sessionPnl / total, 2), 0) / total) || 1) 
      : 0;

    return { wins, total, winRate, avgWin, avgLoss, maxDrawdown, sharpe };
  }, [positions, sessionPnl, equityData]);

  return (
    <div className="quant-terminal min-h-screen flex flex-col overflow-hidden bg-[var(--quant-bg-primary)]">
      {/* Command Center Header */}
      <CommandCenter
        balance={balance}
        isLoadingBalance={isLoadingBalance}
        onRetryBalance={handleRetryBalance}
        sessionPnl={sessionPnl}
        winRate={stats.winRate}
        sharpe={stats.sharpe}
        isAutoTrading={isAutoTrading}
        onToggleAuto={() => setIsAutoTrading((prev) => !prev)}
      />

      {/* Main Content Area - NEW LAYOUT */}
      <div className="flex-1 flex overflow-hidden p-1" style={{ gap: "var(--quant-panel-gap)" }}>
        
        {/* LEFT PANEL - Position Ledger */}
        <div className="w-96 flex-shrink-0 flex flex-col min-w-0" style={{ gap: "var(--quant-panel-gap)" }}>
          <PositionLedger positions={positions} />
          <RiskDashboard
            maxDrawdown={stats.maxDrawdown}
            sharpe={stats.sharpe}
            winRate={stats.winRate}
            avgWin={stats.avgWin}
            avgLoss={stats.avgLoss}
          />
        </div>

        {/* CENTER PANEL - Alpha Workbench (EXPANDED FULL HEIGHT) */}
        <div className="flex-1 flex flex-col min-w-0 quant-panel">
          <div className="quant-panel-header">
            <span>Alpha Workbench</span>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-[var(--quant-neutral)]">
                Target: <span className="text-white">{currentTarget.toFixed(2)}%</span>
              </span>
              <span className="text-[10px] text-[var(--quant-neutral)]">
                Size: <span className="text-white">{currentSize} U</span>
              </span>
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            <AlphaWorkbench
              currentTarget={currentTarget}
              currentSize={currentSize}
              currentDirection={currentDirection}
              onTargetChange={setCurrentTarget}
              onSizeChange={setCurrentSize}
              onDirectionChange={setCurrentDirection}
              onExecute={executePosition}
              isLoading={isLoading}
            />
          </div>
        </div>

        {/* RIGHT PANEL - Market Depth + Compact Chart */}
        <div className="w-80 flex-shrink-0 flex flex-col min-w-0" style={{ gap: "var(--quant-panel-gap)" }}>
          {/* Market Depth */}
          <div className="flex-1 quant-panel flex flex-col">
            <div className="quant-panel-header">
              <span>Market Depth</span>
              <span className="text-[10px] text-[var(--quant-neutral)]">{currentDirection.toUpperCase()}</span>
            </div>
            <div className="flex-1 overflow-auto">
              <MarketDepth
                target={currentTarget}
                direction={currentDirection}
                size={currentSize}
                onExecute={executePosition}
                isLoading={isLoading}
              />
            </div>
          </div>

          {/* Compact Equity Chart */}
          <div className="h-32 quant-panel flex flex-col">
            <div className="quant-panel-header">
              <span>Equity Curve</span>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${sessionPnl >= 0 ? "text-bullish" : "text-bearish"}`}>
                  {sessionPnl >= 0 ? "+" : ""}${sessionPnl.toFixed(0)}
                </span>
                <span className="text-[10px] text-[var(--quant-neutral)]">
                  {balance != null && balance > 0
                    ? ((sessionPnl / balance) * 100).toFixed(1)
                    : "0.0"}%
                </span>
              </div>
            </div>
            <div className="flex-1 p-2">
              <CompactEquityChart data={equityData} />
            </div>
          </div>
        </div>
      </div>

      {/* Data Stream Footer */}
      <DataStream logs={logs} />

      {/* Keyboard Shortcuts Modal */}
      {showShortcuts && <KeyboardShortcuts onClose={() => setShowShortcuts(false)} />}

      {/* Keyboard Hint */}
      <div className="fixed bottom-4 right-4 text-[10px] text-[var(--quant-neutral)] opacity-50 hover:opacity-100 transition-opacity z-50">
        Press <kbd className="px-1 py-0.5 bg-[var(--quant-bg-card)] rounded">Ctrl+K</kbd> for shortcuts
      </div>
    </div>
  );
}
