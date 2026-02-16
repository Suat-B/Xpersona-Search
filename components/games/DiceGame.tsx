"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { DICE_HOUSE_EDGE } from "@/lib/constants";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { QuickBetButtons } from "@/components/ui/QuickBetButtons";
import { WinEffects } from "./WinEffects";
import { MomentumMeter } from "./MomentumMeter";
import { Dice3D } from "./Dice3D";
import { BetPercentageButtons } from "./BetPercentageButtons";
import { useKeyboardShortcuts } from "./KeyboardShortcuts";
import { createProgressionState, getNextBet, type ProgressionState, type RoundResult } from "@/lib/dice-progression";
import { createRuleEngineState, processRound } from "@/lib/dice-rule-engine";
import type { DiceStrategyConfig } from "@/lib/strategies";
import type { AdvancedDiceStrategy } from "@/lib/advanced-strategy-types";

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
  isAdvanced?: boolean;
  advancedStrategy?: AdvancedDiceStrategy;
};

const AUTO_SPEEDS = [100, 250, 500, 1000] as const;
const MAX_BET = 10000;
const MIN_BET = 1;

export type DiceGameProps = {
  amount: number;
  target: number;
  condition: "over" | "under";
  balance?: number;
  activeStrategyName?: string | null;
  progressionType?: string;
  onAmountChange: (v: number) => void;
  onTargetChange: (v: number) => void;
  onConditionChange: (v: "over" | "under") => void;
  onRoundComplete: (amount: number, payout: number) => void;
  onAutoPlayChange?: (active: boolean) => void;
  onResult?: (result: { result: number; win: boolean; payout: number; playAmount?: number; betId?: string; balance?: number; target?: number; condition?: "over" | "under" }) => void;
  livePlay?: { result: number; win: boolean; payout: number } | null;
  livePlayAnimationMs?: number;
  aiDriving?: boolean;
  strategyRun?: StrategyRunConfig | null;
  onStrategyComplete?: (sessionPnl: number, roundsPlayed: number, wins: number) => void;
  onStrategyStop?: () => void;
  onStrategyProgress?: (stats: { currentRound: number; sessionPnl: number; wins: number; totalRounds: number }) => void;
  recentResults?: { win: boolean }[];
  sessionStartTime?: number | null;
  rounds?: number;
};

export function DiceGame({
  amount,
  target,
  condition,
  balance = 0,
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
  onStrategyProgress,
  livePlay,
  livePlayAnimationMs = 450,
  aiDriving = false,
  recentResults = [],
  sessionStartTime = null,
  rounds = 0,
}: DiceGameProps) {
  const [result, setResult] = useState<Result>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoPlay, setAutoPlay] = useState(false);
  const [autoSpeed, setAutoSpeed] = useState(250);
  const [autoRounds, setAutoRounds] = useState(0);
  const [strategyRoundsPlayed, setStrategyRoundsPlayed] = useState(0);
  const [showWinEffects, setShowWinEffects] = useState(false);
  const [showNearMissEffects, setShowNearMissEffects] = useState(false);
  const stopRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const betInputRef = useRef<HTMLInputElement | null>(null);
  const strategyStateRef = useRef<ProgressionState | null>(null);
  const ruleEngineStateRef = useRef<{ currentBet: number; currentTarget: number; currentCondition: "over" | "under"; pausedRounds: number; skipNextBet: boolean } | null>(null);
  const strategyStopRef = useRef(false);
  const lastBetResultRef = useRef<{ win: boolean; payout: number; balance: number; result: number } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const autoSpeedRef = useRef(autoSpeed);
  autoSpeedRef.current = autoSpeed;

  const prevAmountRef = useRef(amount);
  const prevTargetRef = useRef(target);
  const prevConditionRef = useRef(condition);
  const [changedControl, setChangedControl] = useState<"amount" | "target" | "condition" | null>(null);
  const changeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [resultKey, setResultKey] = useState(0);

  useEffect(() => {
    if (!livePlay) return;
    setResult({ ...livePlay, balance: 0 });
    setResultKey((k) => k + 1);
    if (livePlay.win) {
      setShowWinEffects(true);
      setTimeout(() => setShowWinEffects(false), 3000);
    } else if (Math.abs(livePlay.result - target) < 2.0) {
      setShowNearMissEffects(true);
      setTimeout(() => setShowNearMissEffects(false), 800);
    }
  }, [livePlay, target]);

  useEffect(() => {
    const el = betInputRef.current;
    if (el && document.activeElement === el && el.value !== String(amount)) {
      el.value = String(amount);
    }
  }, [amount]);

  useEffect(() => {
    if (changeTimeoutRef.current) {
      clearTimeout(changeTimeoutRef.current);
      changeTimeoutRef.current = null;
    }
    let control: "amount" | "target" | "condition" | null = null;
    prevAmountRef.current = amount;
    if (target !== prevTargetRef.current) {
      prevTargetRef.current = target;
      control = "target";
    }
    if (condition !== prevConditionRef.current) {
      prevConditionRef.current = condition;
      control = "condition";
    }
    if (control !== null) {
      setChangedControl(control);
      changeTimeoutRef.current = setTimeout(() => {
        setChangedControl(null);
        changeTimeoutRef.current = null;
      }, 500);
    }
    return () => {
      if (changeTimeoutRef.current) {
        clearTimeout(changeTimeoutRef.current);
      }
    };
  }, [amount, target, condition]);

  const runBet = useCallback(
    async (betAmountOverride?: number): Promise<boolean> => {
      const betAmount = betAmountOverride ?? amount;
      const signal = abortControllerRef.current?.signal;
      type BetRes = { success?: boolean; data?: { result: number; win: boolean; payout: number; balance: number; betId?: string }; error?: string; message?: string };
      let httpStatus: number;
      let data: BetRes;
      try {
        const response = await fetch("/api/games/dice/round", {
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
          setError(response.ok ? "Invalid response" : `Play failed (${httpStatus})`);
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
      console.warn("[DiceGame] Play failed:", { status: httpStatus, data });
    }
    if (data.success && data.data) {
      const newResult = {
        result: data.data.result,
        win: data.data.win,
        payout: data.data.payout,
        balance: data.data.balance,
      };
      setResult(newResult);
      setResultKey((k) => k + 1);
      lastBetResultRef.current = {
        win: newResult.win,
        payout: newResult.payout,
        balance: data.data.balance,
        result: data.data.result,
      };
      onResult?.({ ...newResult, playAmount: betAmount, betId: data.data.betId, balance: data.data.balance, target, condition });
      onRoundComplete(betAmount, data.data.payout);

      if (newResult.win) {
        setShowWinEffects(true);
        setTimeout(() => setShowWinEffects(false), 3000);
      } else if (Math.abs(newResult.result - target) < 2.0) {
        setShowNearMissEffects(true);
        setTimeout(() => setShowNearMissEffects(false), 800);
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
          ? "Insufficient balance — add capital or claim demo funds"
          : errCode === "BET_TOO_LOW"
            ? "Play too low"
            : errCode === "BET_TOO_HIGH"
              ? "Play too high"
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


  useEffect(() => {
    if (!strategyRun) return;
    const config = strategyRun.config;
    const maxRounds = strategyRun.maxRounds;
    const isAdvanced = strategyRun.isAdvanced;
    const advancedStrategy = strategyRun.advancedStrategy;
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

      let currentBet: number;
      let currentTarget: number;
      let currentCondition: "over" | "under";
      let sessionPnl = 0;
      let wins = 0;
      let roundsPlayed = 0;

      if (isAdvanced && advancedStrategy) {
        const ruleState = createRuleEngineState(advancedStrategy, balance);
        currentBet = ruleState.currentBet;
        currentTarget = ruleState.currentTarget;
        currentCondition = ruleState.currentCondition;
        onAmountChange(currentBet);
        onTargetChange(currentTarget);
        onConditionChange(currentCondition);

        for (let i = 0; i < maxRounds; i++) {
          if (strategyStopRef.current) break;

          if (ruleState.pausedRounds > 0) {
            ruleState.pausedRounds--;
            roundsPlayed += 1;
            setStrategyRoundsPlayed(roundsPlayed);
            await new Promise((r) => setTimeout(r, autoSpeedRef.current));
            continue;
          }

          if (ruleState.skipNextBet) {
            ruleState.skipNextBet = false;
            roundsPlayed += 1;
            setStrategyRoundsPlayed(roundsPlayed);
            await new Promise((r) => setTimeout(r, autoSpeedRef.current));
            continue;
          }

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
          const { win, payout, balance: newBalance, result: roll } = lastResult;
          const pnl = payout - currentBet;
          sessionPnl += pnl;
          if (win) wins += 1;
          balance = newBalance;

          onStrategyProgress?.({
            currentRound: roundsPlayed,
            sessionPnl,
            wins,
            totalRounds: maxRounds,
          });

          const roundResult = {
            win,
            payout,
            roll: roll ?? 0,
            betAmount: currentBet,
          };
          const engineResult = processRound(advancedStrategy, ruleState, roundResult);

          Object.assign(ruleState, engineResult.newState);
          currentBet = engineResult.nextBet;
          currentTarget = engineResult.nextTarget;
          currentCondition = engineResult.nextCondition;

          onAmountChange(currentBet);
          onTargetChange(currentTarget);
          onConditionChange(currentCondition);

          if (engineResult.shouldStop) {
            break;
          }

          if (i < maxRounds - 1) {
            await new Promise((r) => setTimeout(r, autoSpeedRef.current));
          }
        }
      } else {
        const initialState = createProgressionState(config, balance);
        strategyStateRef.current = initialState;
        currentBet = initialState.currentBet;
        currentTarget = config.target;
        currentCondition = config.condition;
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
          const { win, payout, balance: newBalance, result: roll } = lastResult;
          const pnl = payout - currentBet;
          sessionPnl += pnl;
          if (win) wins += 1;
          balance = newBalance;

          onStrategyProgress?.({
            currentRound: roundsPlayed,
            sessionPnl,
            wins,
            totalRounds: maxRounds,
          });

          const state = strategyStateRef.current;
          if (state) {
            const roundResult: RoundResult = { win, payout, betAmount: currentBet };
            const { nextBet, nextState } = getNextBet(state, roundResult, config, newBalance);
            strategyStateRef.current = nextState;
            currentBet = nextBet;
            onAmountChange(currentBet);
          }

          if (i < maxRounds - 1) {
            await new Promise((r) => setTimeout(r, autoSpeedRef.current));
          }
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
      if (changeTimeoutRef.current != null) {
        clearTimeout(changeTimeoutRef.current);
        changeTimeoutRef.current = null;
      }
    };
  }, []);

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

  const handleIncreaseBet = () => {
    const newAmount = Math.min(MAX_BET, amount + 1);
    onAmountChange(newAmount);
  };

  const handleDecreaseBet = () => {
    const newAmount = Math.max(MIN_BET, amount - 1);
    onAmountChange(newAmount);
  };

  useKeyboardShortcuts({
    onRoll: handleRoll,
    onIncreaseBet: handleIncreaseBet,
    onDecreaseBet: handleDecreaseBet,
    onHalfBet: handleHalf,
    onDoubleBet: handleDouble,
    onMaxBet: handleMax,
    disabled: autoPlay || loading,
  });

  const aiState = { amount, target, condition, progressionType, activeStrategyName: activeStrategyName ?? undefined };

  const winProb = condition === "over" ? (100 - target) / 100 : target / 100;
  const multiplier = winProb > 0 ? Math.min((1 - DICE_HOUSE_EDGE) / winProb, 10) : 0;
  const evPerTrade = amount * (winProb * multiplier - 1);

  const { currentStreak, isWinStreak } = (() => {
    if (recentResults.length === 0) return { currentStreak: 0, isWinStreak: false };
    let streak = 0;
    const last = recentResults[recentResults.length - 1]?.win ?? null;
    for (let i = recentResults.length - 1; i >= 0; i--) {
      if (recentResults[i]?.win === last) streak++;
      else break;
    }
    return { currentStreak: streak, isWinStreak: last === true };
  })();

  const sessionMinutes = sessionStartTime ? Math.floor((Date.now() - sessionStartTime) / 60000) : 0;

  return (
    <div className="h-full flex flex-col min-h-0 relative" data-agent="dice-game" data-config={JSON.stringify(aiState)}>
      <WinEffects active={showWinEffects || showNearMissEffects} win={result?.win ?? false} nearMiss={showNearMissEffects} payout={result?.payout ?? 0} betAmount={amount} streakCount={isWinStreak ? currentStreak : 0} />

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
        {/* Error banner */}
        {error && (
          <div className="flex-shrink-0 px-4 py-2 border-b border-white/[0.06] z-10">
            <div
              className="rounded-xl border border-[#ff453a]/30 bg-[#ff453a]/5 px-3 py-2 text-xs"
              role="alert"
              data-deposit-alert={error.includes("Insufficient balance") ? "critical" : undefined}
            >
              <div className="flex items-center gap-2 text-[#ff453a]">
                <span className="shrink-0">&#x2717;</span>
                <span className="flex-1 min-w-0">{error}</span>
              </div>
              {error.includes("Insufficient balance") && (
                <div className="mt-1.5 pt-1.5 border-t border-[#ff453a]/10 text-[10px]">
                  <Link href="/dashboard/deposit" className="text-[var(--accent-heart)] hover:underline">Add capital</Link>
                  <span className="text-[var(--text-secondary)]"> or </span>
                  <Link href="/dashboard" className="text-[var(--accent-heart)] hover:underline">claim demo funds</Link>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ 3-Zone Cockpit Layout ═══ */}
        <div className={`flex-1 min-h-0 flex overflow-hidden ${aiDriving ? "bg-gradient-to-b from-violet-500/[0.03] to-transparent" : ""}`}>

          {/* ── LEFT ZONE: Controls Instrument Panel ── */}
          <div className="w-[240px] flex-shrink-0 flex flex-col p-3 gap-2 border-r border-white/[0.04] overflow-y-auto scrollbar-sidebar">
            {/* Status header */}
            <div className="flex items-center gap-2 pb-1.5 border-b border-white/[0.06]">
              <span className={`w-2 h-2 rounded-full shrink-0 ${loading || autoPlay ? "bg-[#0ea5e9] animate-pulse" : "bg-[#30d158] animate-breathing"}`} />
              <span className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                {loading ? "Executing" : strategyRun ? "Strategy" : aiDriving ? "LIVE" : activeStrategyName ?? "Ready"}
              </span>
              {aiDriving && (
                <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-400 border border-violet-500/30 rounded-full bg-violet-500/10">
                  <span className="w-1 h-1 rounded-full bg-violet-400 animate-pulse" />
                  LIVE
                </span>
              )}
            </div>

            {/* Threshold */}
            <div className="space-y-1">
              <label className="block text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Threshold</label>
              <div className="relative">
                <input
                  type="number"
                  min={0.01}
                  max={99.99}
                  step={0.01}
                  value={target}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    if (value > 0 && value < 100) onTargetChange(value);
                  }}
                  disabled={autoPlay}
                  aria-label="Threshold percentage"
                  className={`terminal-input w-full h-10 rounded-xl pr-8 text-center text-sm ${
                    changedControl === "target" ? "border-[#0ea5e9] bg-[#0ea5e9]/10" : ""
                  }`}
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--text-tertiary)]">%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#0ea5e9] transition-all duration-300"
                  style={{ width: `${(condition === "over" ? 100 - target : target)}%` }}
                />
              </div>
            </div>

            {/* Direction */}
            <div className="space-y-1">
              <label className="block text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Direction</label>
              <SegmentedControl value={condition} onChange={onConditionChange} disabled={autoPlay} quantLabels />
            </div>

            {/* Position Size */}
            <div className="space-y-1">
              <label className="block text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Position Size</label>
              <div className="relative">
                <input
                  ref={betInputRef}
                  type="number"
                  min={MIN_BET}
                  max={MAX_BET}
                  value={amount}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "") { onAmountChange(MIN_BET); return; }
                    const num = Number(v);
                    if (!Number.isNaN(num) && num >= 0) {
                      onAmountChange(Math.min(MAX_BET, Math.max(MIN_BET, Math.floor(num))));
                    }
                  }}
                  placeholder="1-10,000"
                  disabled={autoPlay}
                  aria-label="Position size in units"
                  className="terminal-input w-full h-10 rounded-xl pr-8 text-center text-sm"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--text-tertiary)]">U</span>
              </div>
            </div>

            {/* Quick bet buttons */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <BetPercentageButtons balance={balance} currentBet={amount} onBetChange={onAmountChange} disabled={autoPlay} />
            </div>
            <div className="flex items-center gap-1.5">
              <QuickBetButtons onHalf={handleHalf} onDouble={handleDouble} onMax={handleMax} disabled={autoPlay} currentAmount={amount} maxAmount={MAX_BET} />
            </div>

            {/* Inline metrics */}
            <div className="mt-auto pt-2 border-t border-white/[0.06] space-y-1.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-[var(--text-tertiary)]">Win Prob</span>
                <span className="text-[var(--text-primary)] font-semibold tabular-nums">{(winProb * 100).toFixed(1)}%</span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-[var(--text-tertiary)]">Multiplier</span>
                <span className="text-[#0ea5e9] font-semibold tabular-nums">{multiplier.toFixed(2)}x</span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-[var(--text-tertiary)]">EV/Trade</span>
                <span className={`font-semibold tabular-nums ${evPerTrade >= 0 ? "text-[#30d158]" : "text-[#ff453a]"}`}>
                  {evPerTrade >= 0 ? "+" : ""}{evPerTrade.toFixed(2)}
                </span>
              </div>

              <MomentumMeter recentResults={recentResults} compact />

              {sessionStartTime != null && rounds > 0 && (
                <div className="text-[9px] text-[var(--text-tertiary)] font-medium pt-1 border-t border-white/[0.06]">
                  <span className="tabular-nums">{sessionMinutes}m</span> invested &middot; <span className="tabular-nums">{rounds}</span> rounds
                </div>
              )}
            </div>
          </div>

          {/* ── CENTER ZONE: Dice Hero Stage ── */}
          <div className="flex-1 min-w-0 flex flex-col items-center justify-center relative overflow-hidden">
            {/* Dice visual with probability ring */}
            <div className="relative flex items-center justify-center" style={{ minHeight: 280 }}>
              <Dice3D
                value={result?.result ?? null}
                isRolling={loading}
                win={result?.win ?? null}
                animationDurationMs={livePlayAnimationMs}
                winProbability={winProb * 100}
                hero
              />
            </div>

            {/* Streak display */}
            {currentStreak >= 2 && (
              <div className="mt-2">
                <div
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold tabular-nums ${
                    isWinStreak
                      ? currentStreak >= 8
                        ? "bg-[#0ea5e9]/20 text-[#0ea5e9] border border-[#0ea5e9]/40"
                        : currentStreak >= 5
                          ? "bg-[#0ea5e9]/15 text-[#0ea5e9] border border-[#0ea5e9]/30"
                          : "bg-[#30d158]/15 text-[#30d158] border border-[#30d158]/30"
                      : "bg-[#ff453a]/15 text-[#ff453a] border border-[#ff453a]/30"
                  }`}
                >
                  {isWinStreak ? (
                    <>
                      {currentStreak >= 5 && <span>&#128293;</span>}
                      <span>W{currentStreak}</span>
                      {currentStreak >= 8 && <span className="text-[9px] uppercase">LEGENDARY</span>}
                      {currentStreak >= 5 && currentStreak < 8 && <span className="text-[9px] uppercase">ON FIRE</span>}
                    </>
                  ) : (
                    <>
                      <span>L{currentStreak}</span>
                      {currentStreak >= 3 && <span className="text-[9px] opacity-80">Due for reversal</span>}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Result badge (last play) */}
            {result && !loading && (
              <div className="mt-3">
                <div
                  key={resultKey}
                  className={`result-reveal inline-flex items-center gap-3 px-5 py-2.5 rounded-xl text-sm font-semibold tabular-nums ${
                    result.win ? "bg-[#30d158]/15 text-[#30d158] border border-[#30d158]/30" : "bg-[#ff453a]/15 text-[#ff453a] border border-[#ff453a]/30"
                  }`}
                >
                  <span className="text-lg font-bold">{result.result.toFixed(2)}</span>
                  <span className="w-px h-4 bg-current opacity-20" />
                  <span>{result.win ? `+${result.payout}` : `-${amount}`} U</span>
                </div>
                {!result.win && Math.abs(result.result - target) < 2.0 && (
                  <div className="mt-1.5 text-center">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#0ea5e9]/15 text-[#0ea5e9] border border-[#0ea5e9]/30">
                      SO CLOSE &middot; {Math.abs(result.result - target).toFixed(2)} away
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Execute + Auto controls */}
            <div className="mt-4 w-full max-w-[360px] px-4 space-y-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRoll}
                  disabled={loading || autoPlay || !amount || amount < MIN_BET}
                  title="Place order (Space / Enter)"
                  aria-label="Place order"
                  className="execute-btn flex-1 h-12 rounded-xl bg-[#0ea5e9] hover:bg-[#0ea5e9]/90 text-white text-sm font-bold flex items-center justify-center gap-2 border border-[#0ea5e9]/50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  {loading && !autoPlay ? "Executing..." : "Execute"}
                </button>

                <button
                  type="button"
                  onClick={autoPlay ? stopAuto : startAuto}
                  disabled={loading && !autoPlay}
                  className={`h-12 rounded-xl px-4 min-w-[110px] text-sm font-bold flex items-center justify-center gap-2 border disabled:opacity-50 disabled:cursor-not-allowed transition-all shrink-0 ${
                    autoPlay
                      ? "border-[#ff453a]/50 bg-[#ff453a]/10 text-[#ff453a] hover:bg-[#ff453a]/15"
                      : "border-[#30d158]/50 bg-[#30d158]/10 text-[#30d158] hover:bg-[#30d158]/15"
                  }`}
                >
                  {autoPlay ? (
                    <>
                      <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                      </svg>
                      Stop <span className="tabular-nums min-w-[2.5ch] inline-block text-right">{strategyRun ? strategyRoundsPlayed : autoRounds}</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                      </svg>
                      Auto
                    </>
                  )}
                </button>
              </div>

              {autoPlay && (
                <div className="flex justify-center">
                  <div className="inline-flex rounded-full bg-white/[0.04] border border-[var(--border)] p-0.5 gap-0.5">
                    {AUTO_SPEEDS.map((ms) => (
                      <button
                        key={ms}
                        type="button"
                        onClick={() => setAutoSpeed(ms)}
                        className={`min-w-[44px] h-7 px-2 rounded-full text-[10px] font-semibold transition-all flex items-center justify-center ${
                          autoSpeed === ms ? "bg-[#0ea5e9]/20 text-[#0ea5e9] border border-[#0ea5e9]/30" : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-white/[0.06] border border-transparent"
                        }`}
                      >
                        {ms === 100 ? "0.1s" : ms === 250 ? "0.25s" : ms === 500 ? "0.5s" : "1s"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT ZONE: Quick Stats Panel ── */}
          <div className="w-[180px] flex-shrink-0 flex flex-col p-3 gap-3 border-l border-white/[0.04] overflow-y-auto scrollbar-sidebar">
            {/* Recent results dots */}
            <div className="space-y-1">
              <span className="text-[9px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Last 20</span>
              <div className="flex flex-wrap gap-1">
                {recentResults.slice(-20).map((r, i) => (
                  <div
                    key={i}
                    className={`w-2.5 h-2.5 rounded-full transition-all ${
                      r.win
                        ? "bg-[#30d158] shadow-[0_0_6px_rgba(48,209,88,0.4)]"
                        : "bg-[#ff453a] shadow-[0_0_6px_rgba(255,69,58,0.3)]"
                    }`}
                  />
                ))}
                {recentResults.length === 0 && (
                  <span className="text-[9px] text-[var(--text-quaternary)]">No plays yet</span>
                )}
              </div>
            </div>

            {/* Quick stats */}
            <div className="space-y-2 text-[10px]">
              <div className="cockpit-panel p-2.5 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-tertiary)]">Balance</span>
                  <span className="text-[var(--text-primary)] font-semibold tabular-nums">{balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-tertiary)]">Rounds</span>
                  <span className="text-[var(--text-primary)] font-semibold tabular-nums">{rounds}</span>
                </div>
              </div>

              {/* Potential payout */}
              <div className="cockpit-panel p-2.5 rounded-xl">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-tertiary)]">If Win</span>
                  <span className="text-[#30d158] font-semibold tabular-nums">+{(amount * multiplier - amount).toFixed(0)} U</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[var(--text-tertiary)]">If Lose</span>
                  <span className="text-[#ff453a] font-semibold tabular-nums">-{amount} U</span>
                </div>
              </div>

              {/* Keyboard hint */}
              <div className="pt-1 text-[9px] text-[var(--text-quaternary)] space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <kbd className="inline-flex items-center justify-center w-5 h-4 rounded bg-white/[0.06] text-[8px] font-mono">&#x23CE;</kbd>
                  <span>Execute</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <kbd className="inline-flex items-center justify-center w-5 h-4 rounded bg-white/[0.06] text-[8px] font-mono">&#x2191;</kbd>
                  <kbd className="inline-flex items-center justify-center w-5 h-4 rounded bg-white/[0.06] text-[8px] font-mono">&#x2193;</kbd>
                  <span>Adjust size</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DiceGame;
