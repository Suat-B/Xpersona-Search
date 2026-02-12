"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { DICE_HOUSE_EDGE } from "@/lib/constants";
import { Dice3D } from "./Dice3D";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { QuickBetButtons } from "@/components/ui/QuickBetButtons";
import { Sparkles, Confetti } from "@/components/ui/Sparkles";
import { createProgressionState, getNextBet, type ProgressionState, type RoundResult } from "@/lib/dice-progression";
import type { DiceStrategyConfig } from "@/lib/strategies";

type Result = {
  result: number;
  win: boolean;
  payout: number;
  balance: number;
} | null;

export type StrategyRunConfig = {
  config: DiceStrategyConfig;
  maxRounds: number;
  strategyName: string;
};

const AUTO_SPEEDS = [100, 250, 500, 1000] as const;
const MAX_BET = 10000;
const MIN_BET = 1;
const STRATEGY_ROUND_DELAY_MS = 400;

export type DiceGameProps = {
  amount: number;
  target: number;
  condition: "over" | "under";
  activeStrategyName?: string | null;
  progressionType?: string;
  onAmountChange: (v: number) => void;
  onTargetChange: (v: number) => void;
  onConditionChange: (v: "over" | "under") => void;
  onRoundComplete: (bet: number, payout: number) => void;
  onAutoPlayChange?: (active: boolean) => void;
  onResult?: (result: { result: number; win: boolean; payout: number; betAmount?: number }) => void;
  strategyRun?: StrategyRunConfig | null;
  onStrategyComplete?: (sessionPnl: number, roundsPlayed: number, wins: number) => void;
  onStrategyStop?: () => void;
};

export function DiceGame({
  amount,
  target,
  condition,
  activeStrategyName,
  progressionType = "flat",
  onAmountChange,
  onTargetChange,
  onConditionChange,
  onRoundComplete,
  onAutoPlayChange,
  onResult,
  strategyRun,
  onStrategyComplete,
  onStrategyStop,
}: DiceGameProps) {
  const [result, setResult] = useState<Result>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoPlay, setAutoPlay] = useState(false);
  const [autoSpeed, setAutoSpeed] = useState(250);
  const [autoRounds, setAutoRounds] = useState(0);
  const [strategyRoundsPlayed, setStrategyRoundsPlayed] = useState(0);
  const [showWinEffects, setShowWinEffects] = useState(false);
  const stopRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const betInputRef = useRef<HTMLInputElement | null>(null);
  const strategyStateRef = useRef<ProgressionState | null>(null);
  const strategyStopRef = useRef(false);
  const lastBetResultRef = useRef<{ win: boolean; payout: number; balance: number } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Ensure BET input reflects external updates (e.g. strategy Apply) when it has focus
  useEffect(() => {
    const el = betInputRef.current;
    if (el && document.activeElement === el && el.value !== String(amount)) {
      el.value = String(amount);
    }
  }, [amount]);

  const runBet = useCallback(
    async (betAmountOverride?: number): Promise<boolean> => {
      const betAmount = betAmountOverride ?? amount;
      const signal = abortControllerRef.current?.signal;
      type BetRes = { success?: boolean; data?: { result: number; win: boolean; payout: number; balance: number }; error?: string; message?: string };
      let httpStatus: number;
      let data: BetRes;
      try {
        const response = await fetch("/api/games/dice/bet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ amount: betAmount, target, condition }),
          signal,
        });
        httpStatus = response.status;
        const raw = await response.text();
        try {
          data = (raw.length > 0 ? JSON.parse(raw) : {}) as BetRes;
        } catch {
          setError(response.ok ? "Invalid response" : `Bet failed (${httpStatus})`);
          return false;
        }
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return false;
        const msg = e instanceof Error ? e.message : "Connection failed";
        setError(`Network error — ${msg}`);
        if (process.env.NODE_ENV === "development") console.error("[DiceGame] Fetch error:", e);
        return false;
      }
    if (process.env.NODE_ENV === "development" && !data.success) {
      console.warn("[DiceGame] Bet failed:", { status: httpStatus, data });
    }
    if (data.success && data.data) {
      const newResult = {
        result: data.data.result,
        win: data.data.win,
        payout: data.data.payout,
        balance: data.data.balance,
      };
      setResult(newResult);
      lastBetResultRef.current = {
        win: newResult.win,
        payout: newResult.payout,
        balance: data.data.balance,
      };
      onResult?.({ ...newResult, betAmount });
      onRoundComplete(betAmount, data.data.payout);

      // Show win effects
      if (newResult.win) {
        setShowWinEffects(true);
        setTimeout(() => setShowWinEffects(false), 2000);
      }
      
      setTimeout(() => window.dispatchEvent(new Event("balance-updated")), 0);
      return true;
    }
    lastBetResultRef.current = null;
    const errCode = data.error || data.message;
    const friendlyMessage =
      errCode === "UNAUTHORIZED"
        ? "Session not ready — wait a moment and try again"
        : errCode === "INSUFFICIENT_BALANCE"
          ? "Not enough credits — claim faucet or deposit"
          : errCode === "BET_TOO_LOW"
            ? "Bet too low"
            : errCode === "BET_TOO_HIGH"
              ? "Bet too high"
              : errCode === "VALIDATION_ERROR"
                ? "Invalid bet — check amount and target"
                : errCode === "INTERNAL_ERROR"
              ? (data.message as string) || "Server error — try again shortly"
              : typeof errCode === "string"
                ? errCode
                : httpStatus === 401
                  ? "Session not ready — wait a moment and try again"
                  : httpStatus >= 500
                    ? `Server error (${httpStatus}) — try again shortly`
                    : `Something went wrong${httpStatus ? ` (${httpStatus})` : ""}`;
    setError(friendlyMessage);
    return false;
  },
  [amount, target, condition, onRoundComplete, onResult]
  );


  // Strategy run: when strategyRun is set, fetch balance and start progression loop
  useEffect(() => {
    if (!strategyRun) return;
    const config = strategyRun.config;
    const maxRounds = strategyRun.maxRounds;
    strategyStopRef.current = false;
    abortControllerRef.current = new AbortController();
    setStrategyRoundsPlayed(0);
    setAutoPlay(true);
    onAutoPlayChange?.(true);
    setError(null);

    const runStrategy = async () => {
      let balance = 0;
      try {
        const res = await fetch("/api/me/balance", { credentials: "include" });
        const data = await res.json().catch(() => ({}));
        if (data.success && typeof data.data?.balance === "number") {
          balance = data.data.balance;
        }
      } catch {
        setError("Failed to load balance");
        onStrategyComplete?.(0, 0, 0);
        onStrategyStop?.();
        setAutoPlay(false);
        onAutoPlayChange?.(false);
        return;
      }

      const initialState = createProgressionState(config, balance);
      strategyStateRef.current = initialState;
      let currentBet = initialState.currentBet;
      let sessionPnl = 0;
      let wins = 0;
      let roundsPlayed = 0;
      onAmountChange(currentBet);

      for (let i = 0; i < maxRounds; i++) {
        if (strategyStopRef.current) break;

        setLoading(true);
        setResult(null);
        lastBetResultRef.current = null;
        const ok = await runBet(currentBet);
        setLoading(false);

        if (!ok) break;
        roundsPlayed += 1;
        setStrategyRoundsPlayed(roundsPlayed);

        const lastResult = lastBetResultRef.current;
        if (!lastResult) break;
        const { win, payout, balance: newBalance } = lastResult;
        const pnl = payout - currentBet;
        sessionPnl += pnl;
        if (win) wins += 1;
        balance = newBalance;

        const state = strategyStateRef.current;
        if (state) {
          const roundResult: RoundResult = { win, payout, betAmount: currentBet };
          const { nextBet, nextState } = getNextBet(state, roundResult, config, newBalance);
          strategyStateRef.current = nextState;
          currentBet = nextBet;
          onAmountChange(currentBet);
        }

        if (i < maxRounds - 1) {
          await new Promise((r) => setTimeout(r, STRATEGY_ROUND_DELAY_MS));
        }
      }

      onStrategyComplete?.(sessionPnl, roundsPlayed, wins);
      onStrategyStop?.();
      setAutoPlay(false);
      onAutoPlayChange?.(false);
      strategyStateRef.current = null;
    };

    runStrategy();
    return () => {
      strategyStopRef.current = true;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run when strategyRun is set
  }, [strategyRun]);

  // Stop all loops on unmount (e.g. navigating away from dice page)
  useEffect(() => {
    return () => {
      stopRef.current = true;
      strategyStopRef.current = true;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      if (timeoutRef.current != null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  // Pause when tab is hidden (prevents ghost games in background)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        stopRef.current = true;
        strategyStopRef.current = true;
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        if (timeoutRef.current != null) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        setAutoPlay(false);
        onAutoPlayChange?.(false);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [onAutoPlayChange]);

  const handleRoll = useCallback(async () => {
    if (autoPlay) return;
    setLoading(true);
    setError(null);
    setResult(null);
    await runBet();
    setLoading(false);
  }, [autoPlay, runBet]);

  const startAuto = useCallback(() => {
    if (autoPlay) return;
    setAutoPlay(true);
    onAutoPlayChange?.(true);
    setError(null);
    stopRef.current = false;
    abortControllerRef.current = new AbortController();
    setAutoRounds(0);
    const loop = async () => {
      setLoading(true);
      setResult(null);
      const ok = await runBet();
      setLoading(false);
      setAutoRounds((n) => n + 1);
      if (!ok || stopRef.current) {
        setAutoPlay(false);
        onAutoPlayChange?.(false);
        timeoutRef.current = null;
        return;
      }
      timeoutRef.current = setTimeout(loop, autoSpeed);
    };
    loop();
  }, [autoPlay, autoSpeed, runBet, onAutoPlayChange]);

  const stopAuto = useCallback(() => {
    if (strategyRun) {
      strategyStopRef.current = true;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    } else {
      stopRef.current = true;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      if (timeoutRef.current != null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setAutoPlay(false);
      onAutoPlayChange?.(false);
    }
  }, [onAutoPlayChange, strategyRun]);

  // Quick bet handlers
  const handleHalf = () => {
    const newAmount = Math.max(MIN_BET, Math.floor(amount / 2));
    onAmountChange(newAmount);
  };

  const handleDouble = () => {
    const newAmount = Math.min(MAX_BET, amount * 2);
    onAmountChange(newAmount);
  };

  const handleMax = () => {
    onAmountChange(MAX_BET);
  };

  // Calculate multiplier based on target and condition (global DICE_HOUSE_EDGE)
  const getMultiplier = () => {
    const probability = condition === "over" ? (100 - target) / 100 : target / 100;
    const multiplier = (1 - DICE_HOUSE_EDGE) / probability;
    return multiplier.toFixed(2);
  };

  const aiState = { amount, target, condition, progressionType, activeStrategyName: activeStrategyName ?? undefined };

  return (
    <div className="h-full flex flex-col min-h-0" data-agent="dice-game" data-config={JSON.stringify(aiState)}>
      {/* Win Effects */}
      <Sparkles active={showWinEffects} count={25} />
      <Confetti active={showWinEffects && (result?.payout || 0) > amount * 2} />
      
      {/* Game Container */}
      <div className="flex-1 flex flex-col min-h-0 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
        
        {/* Header - Compact */}
        <div className="flex-shrink-0 px-6 pt-4 pb-3 text-center border-b border-[var(--border)]/50" data-agent="dice-header">
          {strategyRun ? (
            <div className="mb-2 text-sm font-semibold text-[var(--accent-heart)]" data-agent="strategy-running" data-value={strategyRun.strategyName}>
              Running: {strategyRun.strategyName}
            </div>
          ) : activeStrategyName ? (
            <div className="mb-2 text-xs font-medium text-[var(--text-secondary)]" data-agent="strategy-applied" data-value={activeStrategyName} data-progression={progressionType}>
              <span className="text-[var(--accent-heart)]/80">{activeStrategyName}</span>
              <span className="mx-1">·</span>
              <span className="font-mono">{amount}</span> credits
              <span className="mx-1">·</span>
              <span className="font-mono">{target}%</span> {condition}
            </div>
          ) : null}
          <div className="flex items-center justify-center gap-4 text-xs text-[var(--text-secondary)]" data-agent="dice-config" data-amount={amount} data-target={target} data-condition={condition} data-progression={progressionType}>
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Provably Fair
            </span>
            <span className="text-[var(--border)]">|</span>
            <span>3% House Edge</span>
            <span className="text-[var(--border)]">|</span>
            <span className="text-[var(--accent-heart)] font-semibold">{getMultiplier()}× Multiplier</span>
          </div>
        </div>

        {/* Main Game Area - Compact Layout */}
        <div className="flex-1 flex flex-col items-center justify-center min-h-0 py-4 relative">
          {/* Background glow */}
          <div className="absolute inset-0 bg-gradient-to-b from-[var(--accent-heart)]/5 via-transparent to-transparent pointer-events-none" />
          
          {/* Result Banner - Above dice */}
          {result && !loading && (
            <div className="mb-4 text-center animate-bounce-in">
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${
                result.win 
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" 
                  : "bg-red-500/20 text-red-400 border border-red-500/30"
              }`}>
                <span className="text-lg">
                  {result.win ? "🎉" : "😔"}
                </span>
                <span className="font-bold">
                  {result.win ? "YOU WIN!" : "You Lose"}
                </span>
                <span className="font-mono font-bold">
                  {result.win ? `+${result.payout}` : amount} credits
                </span>
              </div>
            </div>
          )}
          
          {/* 3D Dice */}
          <div className="relative z-10">
            <Dice3D 
              value={result?.result ?? null} 
              isRolling={loading}
              win={result?.win ?? null}
            />
          </div>

          {/* Empty state message */}
          {!result && !loading && (
            <div className="mt-8 text-center text-sm text-[var(--text-secondary)] animate-pulse">
              Click ROLL DICE to start
            </div>
          )}
        </div>

        {/* Controls Section - Compact */}
        <div className="flex-shrink-0 px-6 pb-5 space-y-3">
          {/* Target and Condition Row */}
          <div className="flex items-end justify-center gap-3">
            <div className="space-y-1">
              <label className="block text-[10px] font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                Target
              </label>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={99.99}
                  step={0.01}
                  value={target}
                  onChange={(e) => onTargetChange(Number(e.target.value))}
                  disabled={autoPlay}
                  className="w-24 h-12 rounded-xl border-2 border-[var(--border)] bg-[var(--bg-matte)] px-3 text-center text-xl font-mono font-bold text-[var(--text-primary)] disabled:opacity-60 focus:border-[var(--accent-heart)] focus:outline-none transition-colors"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--text-secondary)]">
                  %
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                Condition
              </label>
              <SegmentedControl
                value={condition}
                onChange={onConditionChange}
                disabled={autoPlay}
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                Bet
              </label>
              <div className="relative">
                <input
                  ref={betInputRef}
                  type="number"
                  min={MIN_BET}
                  max={MAX_BET}
                  value={amount}
                  onChange={(e) => onAmountChange(Number(e.target.value))}
                  disabled={autoPlay}
                  className="w-24 h-12 rounded-xl border-2 border-[var(--border)] bg-[var(--bg-matte)] px-3 text-center text-lg font-mono font-bold text-[var(--text-primary)] disabled:opacity-60 focus:border-[var(--accent-heart)] focus:outline-none transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Quick Bet Buttons */}
          <div className="flex justify-center">
            <QuickBetButtons
              onHalf={handleHalf}
              onDouble={handleDouble}
              onMax={handleMax}
              disabled={autoPlay}
              currentAmount={amount}
              maxAmount={MAX_BET}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleRoll}
              disabled={loading || autoPlay}
              className="relative group rounded-2xl bg-gradient-to-b from-[var(--accent-heart)] to-[#e11d48] px-10 py-3.5 text-lg font-bold text-white shadow-xl shadow-[var(--accent-heart)]/30 hover:shadow-[var(--accent-heart)]/50 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed transition-all duration-200 overflow-hidden"
            >
              {/* Shine effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
              <span className="relative flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {loading && !autoPlay ? "Rolling..." : "ROLL"}
              </span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={autoPlay ? stopAuto : startAuto}
                disabled={loading && !autoPlay}
                className={`rounded-xl border-2 px-5 py-3.5 text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2 shrink-0 ${
                  autoPlay
                    ? "border-red-500 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                    : "border-emerald-500 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                }`}
              >
                {autoPlay ? (
                  <>
                    <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                    </svg>
                    <span>STOP</span>
                    <span className="text-xs font-medium opacity-80 tabular-nums">
                      {strategyRun ? strategyRoundsPlayed : autoRounds}
                    </span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                    </svg>
                    AUTO
                  </>
                )}
              </button>

              {autoPlay && (
                <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-matte)] p-1">
                  {AUTO_SPEEDS.map((ms) => (
                    <button
                      key={ms}
                      type="button"
                      onClick={() => setAutoSpeed(ms)}
                      className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        autoSpeed === ms
                          ? "bg-[var(--accent-heart)]/20 text-[var(--accent-heart)]"
                          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5"
                      }`}
                      title={`${ms}ms between rolls`}
                    >
                      {ms === 100 ? "0.1s" : ms === 250 ? "0.25s" : ms === 500 ? "0.5s" : "1s"}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="flex items-center justify-center gap-2 text-xs text-red-400 animate-in fade-in slide-in-from-top-2" role="alert">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DiceGame;
