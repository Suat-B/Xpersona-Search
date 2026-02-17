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
import { CasinoRoundsWidget } from "@/components/dashboard/CasinoRoundsWidget";

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
  const [currentSize, setCurrentSize] = useState(10);
  const [currentDirection, setCurrentDirection] = useState<"over" | "under">("over");
  const [logs, setLogs] = useState<Array<{ time: number; type: string; message: string }>>([]);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [runningStrategyId, setRunningStrategyId] = useState<string | null>(null);
  const [nonstopStrategyId, setNonstopStrategyId] = useState<string | null>(null);
  const [isJsonRunInProgress, setIsJsonRunInProgress] = useState(false);
  const [lastResult, setLastResult] = useState<{ exit: number; win: boolean } | null>(null);
  const lastResultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nonstopAbortRef = useRef(false);

  const [aiBannerVisible, setAiBannerVisible] = useState(false);
  const [isAiRolling, setIsAiRolling] = useState(false);
  const [spectatePaused, setSpectatePaused] = useState(false);
  const [liveQueueLength, setLiveQueueLength] = useState(0);
  const spectatePausedRef = useRef(false);
  spectatePausedRef.current = spectatePaused;
  const livePlayQueueRef = useRef<
    Array<{
      result: number;
      win: boolean;
      payout: number;
      amount: number;
      target: number;
      condition: string;
      balance?: number;
      betId?: string;
      agentId?: string;
      receivedAt: number;
    }>
  >([]);
  const liveQueueProcessingRef = useRef(false);
  const liveFeedRef = useRef<EventSource | null>(null);
  const processedPlayIdsRef = useRef<Set<string>>(new Set());
  const aiBannerCooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadBalanceRef = useRef<((showLoading?: boolean) => Promise<boolean>) | null>(null);

  const MIN_LIVE_PLAY_DISPLAY_MS = 50;
  const aiDriving = aiBannerVisible && !spectatePaused;

  // Load real balance — skip if server provided it; else delay for EnsureGuest, use shared retry logic
  useEffect(() => {
    let mounted = true;

    const loadBalance = async (showLoading = true) => {
      if (showLoading) setIsLoadingBalance(true);
      try {
        const loadedBalance = await fetchBalanceWithRetry();
        if (!mounted) return false;
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

  useEffect(() => {
    return () => {
      if (lastResultTimeoutRef.current) clearTimeout(lastResultTimeoutRef.current);
    };
  }, []);

  useEffect(() => () => {
    if (aiBannerCooldownRef.current) clearTimeout(aiBannerCooldownRef.current);
  }, []);

  const handleRetryBalance = useCallback(() => {
    loadBalanceRef.current?.(true);
  }, []);

  // Add log entry
  const addLog = useCallback((type: string, message: string) => {
    setLogs((prev) => [{ time: Date.now(), type, message }, ...prev].slice(0, 100));
  }, []);

  const AI_ROLLING_ANTICIPATION_MS = 150;

  const processLivePlayQueue = useCallback(() => {
    if (liveQueueProcessingRef.current || livePlayQueueRef.current.length === 0) return;
    liveQueueProcessingRef.current = true;
    setLiveQueueLength(livePlayQueueRef.current.length);

    const playNext = () => {
      const queue = livePlayQueueRef.current;
      const next = queue.shift();
      setLiveQueueLength(queue.length);
      if (!next) {
        liveQueueProcessingRef.current = false;
        setLastResult(null);
        setIsAiRolling(false);
        if (aiBannerCooldownRef.current) clearTimeout(aiBannerCooldownRef.current);
        aiBannerCooldownRef.current = setTimeout(() => setAiBannerVisible(false), 800);
        if (queue.length > 0) processLivePlayQueue();
        return;
      }
      setIsAiRolling(true);
      setTimeout(() => {
        setIsAiRolling(false);
        const direction = (next.condition === "under" ? "under" : "over") as "over" | "under";
        const pnl = next.payout - next.amount;
        const newPosition: Position = {
          id: next.betId ?? `pos-${Date.now()}`,
          timestamp: Date.now(),
          direction,
          size: next.amount,
          entry: next.target,
          exit: next.result,
          pnl,
          status: "closed",
        };
        setPositions((prev) => [newPosition, ...prev]);
        if (typeof next.balance === "number") setBalance(next.balance);
        setSessionPnl((prev) => prev + pnl);
        setEquityData((prev) => {
          const lastPnl = prev[prev.length - 1]?.pnl ?? 0;
          return [...prev, { time: Date.now(), value: next.balance ?? 0, pnl: lastPnl + pnl }];
        });
        setLastResult({ exit: next.result, win: next.win });
        if (lastResultTimeoutRef.current) clearTimeout(lastResultTimeoutRef.current);
        lastResultTimeoutRef.current = setTimeout(() => setLastResult(null), 3500);
        addLog("fill", `AI ${direction.toUpperCase()} ${next.amount}U @ ${next.target.toFixed(2)} → ${next.result.toFixed(2)} | PnL: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`);
        setCurrentSize(next.amount);
        setCurrentTarget(next.target);
        setCurrentDirection(direction);
        if (next.betId) processedPlayIdsRef.current.add(next.betId);
        window.dispatchEvent(new Event("balance-updated"));

        const peek = queue[0];
        const displayMs = peek
          ? Math.max(MIN_LIVE_PLAY_DISPLAY_MS, peek.receivedAt - next.receivedAt)
          : MIN_LIVE_PLAY_DISPLAY_MS;
        setTimeout(playNext, displayMs);
      }, AI_ROLLING_ANTICIPATION_MS);
    };
    playNext();
  }, [addLog]);

  const stopSpectating = useCallback(() => {
    spectatePausedRef.current = true;
    setSpectatePaused(true);
    livePlayQueueRef.current = [];
    liveQueueProcessingRef.current = false;
    setLiveQueueLength(0);
    setLastResult(null);
    setIsAiRolling(false);
    setAiBannerVisible(false);
    if (aiBannerCooldownRef.current) {
      clearTimeout(aiBannerCooldownRef.current);
      aiBannerCooldownRef.current = null;
    }
  }, []);

  useEffect(() => {
    const url = typeof window !== "undefined" ? `${window.location.origin}/api/me/live-feed` : "";
    if (!url) return;
    const es = new EventSource(url, { withCredentials: true });
    liveFeedRef.current = es;
    es.onmessage = (ev) => {
      try {
        const json = JSON.parse(ev.data as string);
        if (json?.type === "deposit_alert") return;
        if (json?.type !== "bet" || !json?.bet) return;
        const bet = json.bet as { result: number; win: boolean; payout: number; balance: number; amount: number; target: number; condition: string; betId?: string; agentId?: string };
        if (bet.betId && processedPlayIdsRef.current.has(bet.betId)) return;
        const fromApi = !!bet.agentId;
        if (fromApi) {
          if (spectatePausedRef.current) return;
          if (aiBannerCooldownRef.current) {
            clearTimeout(aiBannerCooldownRef.current);
            aiBannerCooldownRef.current = null;
          }
          setAiBannerVisible(true);
          livePlayQueueRef.current.push({
            result: bet.result,
            win: bet.win,
            payout: bet.payout,
            amount: bet.amount,
            target: bet.target,
            condition: bet.condition,
            balance: bet.balance,
            betId: bet.betId,
            agentId: bet.agentId,
            receivedAt: Date.now(),
          });
          if (!liveQueueProcessingRef.current) processLivePlayQueue();
        } else {
          const direction = (bet.condition === "under" ? "under" : "over") as "over" | "under";
          const pnl = bet.payout - bet.amount;
          const newPosition: Position = {
            id: bet.betId ?? `pos-${Date.now()}`,
            timestamp: Date.now(),
            direction,
            size: bet.amount,
            entry: bet.target,
            exit: bet.result,
            pnl,
            status: "closed",
          };
          setPositions((prev) => [newPosition, ...prev]);
          if (typeof bet.balance === "number") setBalance(bet.balance);
          setSessionPnl((prev) => prev + pnl);
          setEquityData((prev) => {
            const lastPnl = prev[prev.length - 1]?.pnl ?? 0;
            return [...prev, { time: Date.now(), value: bet.balance ?? 0, pnl: lastPnl + pnl }];
          });
          setLastResult({ exit: bet.result, win: bet.win });
          if (lastResultTimeoutRef.current) clearTimeout(lastResultTimeoutRef.current);
          lastResultTimeoutRef.current = setTimeout(() => setLastResult(null), 3500);
          addLog("fill", `${direction.toUpperCase()} ${bet.amount}U @ ${bet.target.toFixed(2)} → ${bet.result.toFixed(2)} | PnL: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`);
          setCurrentSize(bet.amount);
          setCurrentTarget(bet.target);
          setCurrentDirection(direction);
          if (bet.betId) processedPlayIdsRef.current.add(bet.betId);
          window.dispatchEvent(new Event("balance-updated"));
        }
      } catch {}
    };
    es.onerror = () => {
      es.close();
      liveFeedRef.current = null;
    };
    return () => {
      es.close();
      liveFeedRef.current = null;
    };
  }, [addLog, processLivePlayQueue]);

  // Execute position via API
  const executePosition = useCallback(async () => {
    if (aiDriving) return;
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

        setLastResult({ exit: result, win });
        if (lastResultTimeoutRef.current) clearTimeout(lastResultTimeoutRef.current);
        lastResultTimeoutRef.current = setTimeout(() => setLastResult(null), 3500);

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
  }, [currentTarget, currentSize, currentDirection, balance, sessionPnl, isLoading, addLog, aiDriving]);

  // Run one batch of strategy rounds (used by both Run and Nonstop)
  const runStrategyBatch = useCallback(
    async (strategyId: string, maxRounds: number): Promise<{ ok: boolean; stoppedReason?: string; finalBalance?: number; sessionPnl?: number; roundsPlayed?: number; winRate?: number }> => {
      const res = await fetch("/api/games/dice/run-advanced-strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ strategyId, maxRounds }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        return { ok: true, ...data.data };
      }
      return { ok: false };
    },
    []
  );

  // Run saved advanced strategy (single batch)
  const runStrategy = useCallback(
    async (strategyId: string, maxRounds: number) => {
      if (runningStrategyId || isJsonRunInProgress) return;
      setRunningStrategyId(strategyId);
      addLog("info", `Starting strategy run (${maxRounds} rounds)…`);
      try {
        const result = await runStrategyBatch(strategyId, maxRounds);
        if (result.ok && result.finalBalance != null && result.sessionPnl != null) {
          const { sessionPnl: stratPnl, finalBalance, roundsPlayed, stoppedReason, winRate } = result;
          setBalance(finalBalance);
          setSessionPnl((prev) => prev + stratPnl);
          setEquityData((prev) => [...prev, { time: Date.now(), value: finalBalance, pnl: sessionPnl + stratPnl }]);
          addLog(
            "fill",
            `Strategy complete: ${roundsPlayed ?? 0}r | PnL ${stratPnl >= 0 ? "+" : ""}$${stratPnl.toFixed(2)} | ${stoppedReason ?? "done"}${winRate != null ? ` | WR ${Number(winRate).toFixed(1)}%` : ""}`
          );
          window.dispatchEvent(new Event("balance-updated"));
        } else {
          addLog("error", "Strategy run failed");
        }
      } catch (err) {
        addLog("error", "Network error - check connection");
      } finally {
        setRunningStrategyId(null);
      }
    },
    [runningStrategyId, isJsonRunInProgress, sessionPnl, addLog, runStrategyBatch]
  );

  // Nonstop autoplay: run strategy in batches until stopped, balance depleted, or stop condition
  const runStrategyNonstop = useCallback(
    async (strategyId: string, roundsPerBatch: number) => {
      if (runningStrategyId) return;
      nonstopAbortRef.current = false;
      setNonstopStrategyId(strategyId);
      setRunningStrategyId(strategyId);
      addLog("info", `Nonstop autoplay started (${roundsPerBatch} rounds per batch)…`);
      try {
        let accumulatedPnl = 0;
        let totalRounds = 0;
        let batchCount = 0;
        for (;;) {
          if (nonstopAbortRef.current) {
            addLog("info", "Nonstop stopped by user");
            break;
          }
          const result = await runStrategyBatch(strategyId, roundsPerBatch);
          if (!result.ok) {
            addLog("error", "Strategy batch failed");
            break;
          }
          const { finalBalance, sessionPnl: batchPnl, roundsPlayed, stoppedReason } = result;
          if (finalBalance != null) setBalance(finalBalance);
          if (batchPnl != null) {
            accumulatedPnl += batchPnl;
            setSessionPnl((prev) => prev + batchPnl);
          }
          totalRounds += roundsPlayed ?? 0;
          batchCount += 1;
          setEquityData((prev) => {
            const lastPnl = prev[prev.length - 1]?.pnl ?? 0;
            return [...prev, { time: Date.now(), value: finalBalance ?? 0, pnl: lastPnl + (batchPnl ?? 0) }];
          });
          addLog("fill", `Nonstop batch ${batchCount}: ${roundsPlayed ?? 0}r | PnL ${(batchPnl ?? 0) >= 0 ? "+" : ""}$${(batchPnl ?? 0).toFixed(2)} | ${stoppedReason ?? "done"}`);
          window.dispatchEvent(new Event("balance-updated"));

          if (nonstopAbortRef.current) break;
          if (stoppedReason === "insufficient_balance" || (finalBalance != null && finalBalance <= 0)) {
            addLog("info", "Nonstop stopped: insufficient balance");
            break;
          }
          if (stoppedReason && stoppedReason !== "max_rounds") {
            addLog("info", `Nonstop stopped: ${stoppedReason}`);
            break;
          }
        }
        addLog("fill", `Nonstop complete: ${totalRounds}r total`);
      } catch (err) {
        addLog("error", "Network error - check connection");
      } finally {
        setRunningStrategyId(null);
        setNonstopStrategyId(null);
      }
    },
    [runningStrategyId, sessionPnl, addLog, runStrategyBatch]
  );

  const stopNonstop = useCallback(() => {
    nonstopAbortRef.current = true;
  }, []);

  // Load strategy base config into manual mode
  const loadStrategyToManual = useCallback(
    (strategy: { baseConfig: { amount: number; target: number; condition: "over" | "under" } }) => {
      const { amount, target, condition } = strategy.baseConfig;
      setCurrentSize(amount);
      setCurrentTarget(target);
      setCurrentDirection(condition);
      addLog("info", `Loaded config: ${amount}U ${condition} ${target}%`);
    },
    [addLog]
  );

  // Run basic config from JSON tab (inline)
  const runBasicConfig = useCallback(
    async (config: { amount: number; target: number; condition: "over" | "under" }, maxRounds: number) => {
      if (runningStrategyId || isJsonRunInProgress) return;
      setIsJsonRunInProgress(true);
      addLog("info", `JSON basic run (${maxRounds} rounds)…`);
      try {
        const res = await fetch("/api/games/dice/run-strategy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ config, maxRounds }),
        });
        const data = await res.json().catch(() => ({}));
        if (data.success && data.data) {
          const { sessionPnl: stratPnl, finalBalance, roundsPlayed, stoppedReason, winRate } = data.data;
          setBalance(finalBalance);
          setSessionPnl((prev) => prev + stratPnl);
          setEquityData((prev) => [...prev, { time: Date.now(), value: finalBalance, pnl: sessionPnl + stratPnl }]);
          addLog("fill", `JSON basic: ${roundsPlayed ?? 0}r | PnL ${stratPnl >= 0 ? "+" : ""}$${stratPnl.toFixed(2)} | ${stoppedReason ?? "done"}${winRate != null ? ` | WR ${Number(winRate).toFixed(1)}%` : ""}`);
          window.dispatchEvent(new Event("balance-updated"));
        } else {
          addLog("error", data.message ?? data.error ?? "Strategy run failed");
        }
      } catch (err) {
        addLog("error", "Network error - check connection");
      } finally {
        setIsJsonRunInProgress(false);
      }
    },
    [runningStrategyId, isJsonRunInProgress, sessionPnl, addLog]
  );

  // Run advanced strategy from JSON tab (inline)
  const runAdvancedStrategyInline = useCallback(
    async (
      strategy: {
        name: string;
        baseConfig: { amount: number; target: number; condition: "over" | "under" };
        rules: unknown[];
      },
      maxRounds: number
    ) => {
      if (runningStrategyId || isJsonRunInProgress) return;
      setIsJsonRunInProgress(true);
      addLog("info", `JSON advanced run: ${strategy.name} (${maxRounds} rounds)…`);
      try {
        const res = await fetch("/api/games/dice/run-advanced-strategy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ strategy, maxRounds }),
        });
        const data = await res.json().catch(() => ({}));
        if (data.success && data.data) {
          const { sessionPnl: stratPnl, finalBalance, roundsPlayed, stoppedReason, winRate } = data.data;
          setBalance(finalBalance);
          setSessionPnl((prev) => prev + stratPnl);
          setEquityData((prev) => [...prev, { time: Date.now(), value: finalBalance, pnl: sessionPnl + stratPnl }]);
          addLog("fill", `JSON advanced: ${roundsPlayed ?? 0}r | PnL ${stratPnl >= 0 ? "+" : ""}$${stratPnl.toFixed(2)} | ${stoppedReason ?? "done"}${winRate != null ? ` | WR ${Number(winRate).toFixed(1)}%` : ""}`);
          window.dispatchEvent(new Event("balance-updated"));
        } else {
          addLog("error", data.message ?? data.error ?? "Strategy run failed");
        }
      } catch (err) {
        addLog("error", "Network error - check connection");
      } finally {
        setIsJsonRunInProgress(false);
      }
    },
    [runningStrategyId, isJsonRunInProgress, sessionPnl, addLog]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && aiDriving) {
        e.preventDefault();
        stopSpectating();
        return;
      }
      if (aiDriving) return;
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
  }, [executePosition, aiDriving, stopSpectating]);

  // Auto-trading simulation
  useEffect(() => {
    if (!isAutoTrading) return;

    const interval = setInterval(() => {
      executePosition();
    }, 600);

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
      {aiBannerVisible && !spectatePaused && (
        <div
          className="fixed top-0 left-0 right-0 z-[60] overflow-hidden bg-gradient-to-r from-violet-950/95 via-violet-900/90 to-violet-950/95 border-b border-violet-500/40 backdrop-blur-md shadow-[0_0_30px_rgba(139,92,246,0.15)] animate-ai-banner-in"
          role="status"
          aria-live="polite"
          aria-label="AI is playing"
        >
          <div className="absolute inset-0 h-full opacity-[0.03] pointer-events-none">
            <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(139,92,246,0.15)_2px,rgba(139,92,246,0.15)_4px)] animate-scanline" />
          </div>
          <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-3 px-4 sm:px-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-violet-400 animate-pulse shrink-0 shadow-[0_0_8px_rgba(139,92,246,0.6)]" aria-hidden />
                <h2 className="text-sm sm:text-base font-bold uppercase tracking-widest text-violet-200">
                  AI is playing
                </h2>
                <span className="hidden sm:inline text-violet-500/80">·</span>
                <span className="text-sm font-medium text-violet-300/90">
                  on your behalf
                </span>
              </div>
              <p className="text-xs text-violet-400/80 pl-4 sm:pl-0">
                Spectate live — each roll shown one by one
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {liveQueueLength > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-500/25 border border-violet-500/50 text-violet-300 text-xs font-mono font-semibold tabular-nums">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                  {liveQueueLength} in queue
                </span>
              )}
              <span className="flex items-center gap-1.5 text-[10px] font-mono text-violet-400/70 tabular-nums">
                <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                LIVE
              </span>
              <button
                type="button"
                onClick={stopSpectating}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 border border-violet-400/40 text-violet-200 text-sm font-medium transition-colors"
                aria-label="Stop watching AI play"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Stop watching
              </button>
            </div>
          </div>
        </div>
      )}

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
        aiDriving={aiDriving}
        aiRolling={isAiRolling}
      />

      {/* Main Content Area - NEW LAYOUT */}
      <div className="flex-1 flex overflow-hidden p-1" style={{ gap: "var(--quant-panel-gap)" }}>
        
        {/* LEFT PANEL - Position Ledger */}
        <div className="w-96 flex-shrink-0 flex flex-col min-w-0" style={{ gap: "var(--quant-panel-gap)" }}>
          <PositionLedger positions={positions} aiModeActive={aiDriving} />
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
              lastResult={lastResult}
              onRunStrategy={runStrategy}
              onRunNonstop={runStrategyNonstop}
              onStopNonstop={stopNonstop}
              onLoadToManual={loadStrategyToManual}
              runningStrategyId={runningStrategyId}
              nonstopStrategyId={nonstopStrategyId}
              aiDriving={aiDriving}
              onRunBasicConfig={runBasicConfig}
              onRunAdvancedStrategyInline={runAdvancedStrategyInline}
              isJsonRunInProgress={isJsonRunInProgress}
            />
          </div>
        </div>

        {/* RIGHT PANEL - Market Depth + Compact Chart */}
        <div className="w-80 flex-shrink-0 flex flex-col min-w-0" style={{ gap: "var(--quant-panel-gap)" }}>
          {/* Market Depth */}
          <div className="flex-1 min-h-0 quant-panel flex flex-col">
            <div className="quant-panel-header">
              <span>Market Depth</span>
              <span className="text-[10px] text-[var(--quant-neutral)]">{currentDirection.toUpperCase()}</span>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <MarketDepth
                target={currentTarget}
                direction={currentDirection}
                size={currentSize}
                onExecute={executePosition}
                isLoading={isLoading}
                aiDriving={aiDriving}
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

      {/* Keyboard Hint + Casino Rounds Ticker */}
      <div className="fixed bottom-4 right-4 flex flex-col items-end gap-2 z-50">
        <CasinoRoundsWidget
          variant="compact"
          personalRounds={stats.total}
        />
        <div className="text-[10px] text-[var(--quant-neutral)] opacity-50 hover:opacity-100 transition-opacity">
          Press <kbd className="px-1 py-0.5 bg-[var(--quant-bg-card)] rounded">Ctrl+K</kbd> for shortcuts
        </div>
      </div>
    </div>
  );
}
