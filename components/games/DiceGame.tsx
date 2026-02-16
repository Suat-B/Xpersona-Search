"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { DICE_HOUSE_EDGE } from "@/lib/constants";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { QuickBetButtons } from "@/components/ui/QuickBetButtons";
import { WinEffects } from "./WinEffects";
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
  /** External play to display (e.g. from API/AI live feed). Triggers dice animation. */
  livePlay?: { result: number; win: boolean; payout: number } | null;
  /** Dice animation duration in ms when showing live play (matches round speed) */
  livePlayAnimationMs?: number;
  /** When true, AI/live feed is driving control values; show violet accent and LIVE badge */
  aiDriving?: boolean;
  strategyRun?: StrategyRunConfig | null;
  onStrategyComplete?: (sessionPnl: number, roundsPlayed: number, wins: number) => void;
  onStrategyStop?: () => void;
  onStrategyProgress?: (stats: { currentRound: number; sessionPnl: number; wins: number; totalRounds: number }) => void;
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
  const ruleEngineStateRef = useRef<{ currentBet: number; currentTarget: number; currentCondition: "over" | "under"; pausedRounds: number; skipNextBet: boolean } | null>(null);
  const strategyStopRef = useRef(false);
  const lastBetResultRef = useRef<{ win: boolean; payout: number; balance: number; result: number } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const autoSpeedRef = useRef(autoSpeed);
  autoSpeedRef.current = autoSpeed;

  // Track previous values for change-detection flash
  const prevAmountRef = useRef(amount);
  const prevTargetRef = useRef(target);
  const prevConditionRef = useRef(condition);
  const [changedControl, setChangedControl] = useState<"amount" | "target" | "condition" | null>(null);
  const changeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [resultKey, setResultKey] = useState(0); // for re-triggering countup animation

  // Display external play from live feed (API/AI playing)
  useEffect(() => {
    if (!livePlay) return;
    setResult({ ...livePlay, balance: 0 });
    setResultKey((k) => k + 1);
    if (livePlay.win) {
      setShowWinEffects(true);
      setTimeout(() => setShowWinEffects(false), 3000);
    }
  }, [livePlay]);

  // Ensure play amount input reflects external updates (e.g. strategy Apply) when it has focus
  useEffect(() => {
    const el = betInputRef.current;
    if (el && document.activeElement === el && el.value !== String(amount)) {
      el.value = String(amount);
    }
  }, [amount]);

  // Detect control value changes and trigger brief "just changed" flash
  useEffect(() => {
    if (changeTimeoutRef.current) {
      clearTimeout(changeTimeoutRef.current);
      changeTimeoutRef.current = null;
    }
    let control: "amount" | "target" | "condition" | null = null;
    if (amount !== prevAmountRef.current) {
      prevAmountRef.current = amount;
      control = "amount";
    }
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

      // Show win effects
      if (newResult.win) {
        setShowWinEffects(true);
        setTimeout(() => setShowWinEffects(false), 3000);
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
          ? "Not enough credits — claim Free Credits or deposit"
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


  // Strategy run: when strategyRun is set, fetch balance and start progression loop
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
        // Use advanced rule engine
        const ruleState = createRuleEngineState(advancedStrategy, balance);
        currentBet = ruleState.currentBet;
        currentTarget = ruleState.currentTarget;
        currentCondition = ruleState.currentCondition;
        onAmountChange(currentBet);
        onTargetChange(currentTarget);
        onConditionChange(currentCondition);

        for (let i = 0; i < maxRounds; i++) {
          if (strategyStopRef.current) break;

          // Check for paused rounds
          if (ruleState.pausedRounds > 0) {
            ruleState.pausedRounds--;
            roundsPlayed += 1;
            setStrategyRoundsPlayed(roundsPlayed);
            await new Promise((r) => setTimeout(r, autoSpeedRef.current));
            continue;
          }

          // Check for skip next bet
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

          // Report progress
          onStrategyProgress?.({
            currentRound: roundsPlayed,
            sessionPnl,
            wins,
            totalRounds: maxRounds,
          });

          // Process through rule engine (use roll from lastBetResultRef; React state may not have updated yet)
          const roundResult = {
            win,
            payout,
            roll: roll ?? 0,
            betAmount: currentBet,
          };
          const engineResult = processRound(advancedStrategy, ruleState, roundResult);

          // Update state from engine
          Object.assign(ruleState, engineResult.newState);
          currentBet = engineResult.nextBet;
          currentTarget = engineResult.nextTarget;
          currentCondition = engineResult.nextCondition;

          onAmountChange(currentBet);
          onTargetChange(currentTarget);
          onConditionChange(currentCondition);

          // Check if stopped by rules
          if (engineResult.shouldStop) {
            break;
          }

          if (i < maxRounds - 1) {
            await new Promise((r) => setTimeout(r, autoSpeedRef.current));
          }
        }
      } else {
        // Use old progression system
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

          // Report progress
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

  const handleIncreaseBet = () => {
    const newAmount = Math.min(MAX_BET, amount + 1);
    onAmountChange(newAmount);
  };

  const handleDecreaseBet = () => {
    const newAmount = Math.max(MIN_BET, amount - 1);
    onAmountChange(newAmount);
  };

  // Keyboard shortcuts
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

  return (
    <div className="h-full flex flex-col min-h-0 relative" data-agent="dice-game" data-config={JSON.stringify(aiState)}>
      {/* Subtle probability arc / ambient background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <svg className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md h-1/2 opacity-[0.04]" viewBox="0 0 400 200" preserveAspectRatio="none">
          <defs>
            <linearGradient id="prob-arc-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.6" />
              <stop offset="50%" stopColor="#5e5ce6" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.6" />
            </linearGradient>
          </defs>
          <path d="M 0 200 Q 200 0 400 200" fill="none" stroke="url(#prob-arc-grad)" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>

      {/* Win Effects */}
      <WinEffects 
        active={showWinEffects} 
        win={result?.win ?? false}
        payout={result?.payout ?? 0}
        betAmount={amount}
      />
      
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
        <div className="flex-shrink-0 px-4 py-4 relative z-10" data-agent="dice-header">
          {error ? (
            <div
              className="rounded-xl border border-[#ff453a]/30 bg-[#ff453a]/5 px-4 py-3 text-sm max-w-md mx-auto"
              role="alert"
              data-deposit-alert={error.includes("Not enough credits") ? "critical" : undefined}
              data-ai-deposit-prompt={error.includes("Not enough credits") ? "Tell your player: You are out of credits. Please deposit or claim Free Credits to continue playing. deposit_url: /dashboard/deposit" : undefined}
            >
              <div className="flex items-center gap-2 text-[#ff453a]">
                <span className="text-[#ff453a] shrink-0">✗</span>
                <span className="flex-1 min-w-0">{error}</span>
              </div>
              {error.includes("Not enough credits") && (
                <div className="mt-2 pt-2 border-t border-[#ff453a]/10">
                  <Link href="/dashboard/deposit" className="text-[var(--accent-heart)] hover:underline font-medium">Deposit</Link>
                  <span className="text-[var(--text-secondary)]"> or </span>
                  <Link href="/dashboard" className="text-[var(--accent-heart)] hover:underline font-medium">claim Free Credits</Link>
                </div>
              )}
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center gap-3 text-[#0ea5e9] text-sm font-semibold px-4 py-2 rounded-xl bg-[#0ea5e9]/10 border border-[#0ea5e9]/30">
              <span className="w-2.5 h-2.5 rounded-full bg-[#0ea5e9] animate-pulse shadow-[0_0_12px_#0ea5e9]" />
              Executing...
            </div>
          ) : result ? (
            <div className="flex items-center justify-center gap-6 flex-wrap">
              <div className={`relative px-2 ${result.win ? "drop-shadow-[0_0_20px_rgba(48,209,88,0.3)]" : "drop-shadow-[0_0_20px_rgba(255,69,58,0.3)]"}`}>
                <span
                  key={resultKey}
                  className={`font-bold text-5xl tabular-nums animate-count-up bg-clip-text ${
                    result.win
                      ? "text-[#30d158] [text-shadow:0_0_30px_rgba(48,209,88,0.5)]"
                      : "text-[#ff453a] [text-shadow:0_0_30px_rgba(255,69,58,0.5)]"
                  }`}
                >
                  {result.result.toFixed(2)}
                </span>
              </div>
              <span
                className={`inline-flex items-center gap-2 text-base font-bold px-5 py-2.5 rounded-xl shadow-lg transition-all ${
                  result.win
                    ? "bg-gradient-to-br from-[#30d158]/20 to-[#30d158]/5 text-[#30d158] border border-[#30d158]/40 shadow-[0_0_20px_rgba(48,209,88,0.2)]"
                    : "bg-gradient-to-br from-[#ff453a]/20 to-[#ff453a]/5 text-[#ff453a] border border-[#ff453a]/40 shadow-[0_0_20px_rgba(255,69,58,0.2)]"
                }`}
              >
                {result.win ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
                {result.win ? `+${result.payout}` : `-${amount}`} cr
              </span>
              {strategyRun ? null : aiDriving ? (
                <span className="text-xs font-medium text-violet-400 uppercase tracking-wider">AI</span>
              ) : activeStrategyName ? (
                <span className="text-xs font-medium text-[#0ea5e9] uppercase tracking-wider">{activeStrategyName}</span>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center justify-center gap-3 text-sm text-[var(--text-tertiary)]" data-agent="dice-config" data-amount={amount} data-target={target} data-condition={condition}>
              {strategyRun ? null : aiDriving ? (
                <span className="font-medium text-violet-400">
                  AI · {amount} · {target}% {condition === "over" ? "Long" : "Short"}
                </span>
              ) : activeStrategyName ? (
                <span>
                  <span className="text-[#0ea5e9]">{activeStrategyName}</span>
                  <span className="text-white/20 mx-2">·</span>
                  <span className="tabular-nums">{amount} · {target}% {condition === "over" ? "L" : "S"}</span>
                </span>
              ) : (
                <span className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#30d158]/10 border border-[#30d158]/30 text-[#30d158] font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#30d158] animate-pulse shadow-[0_0_12px_#30d158]" aria-hidden />
                  Ready to roll
                </span>
              )}
            </div>
          )}
        </div>

        <div
          className={`flex-1 min-h-0 flex flex-col items-center px-4 py-5 space-y-5 overflow-y-auto overflow-x-hidden transition-all duration-300 ${
            autoPlay ? "justify-start" : "justify-center"
          } ${aiDriving ? "bg-gradient-to-b from-violet-500/[0.06] to-transparent" : ""}`}
        >
          {aiDriving && (
            <div className="flex-shrink-0">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-violet-400 border border-violet-500/30 rounded-xl bg-violet-500/10">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                LIVE
              </span>
            </div>
          )}

          <div className="w-full flex justify-center relative z-10 max-w-md">
          <div className="w-full shrink-0 space-y-5">
          {(() => {
            const winProb = condition === "over" ? (100 - target) / 100 : target / 100;
            const multiplier = winProb > 0 ? Math.min((1 - DICE_HOUSE_EDGE) / winProb, 10) : 0;
            const evPerTrade = amount * (winProb * multiplier - 1);
              return (
              <div className="grid grid-cols-3 gap-3">
                <div className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-gradient-to-br from-white/[0.08] to-white/[0.02] px-4 py-4 text-center backdrop-blur-sm hover:border-[#0ea5e9]/20 transition-colors group">
                  <div className="absolute inset-0 bg-gradient-to-br from-[#0ea5e9]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-1.5">Win%</div>
                  <div className="relative text-2xl font-bold text-[var(--text-primary)] tabular-nums">{(winProb * 100).toFixed(1)}<span className="text-sm text-[var(--text-tertiary)] font-medium">%</span></div>
                </div>
                <div className="relative overflow-hidden rounded-xl border-2 border-[#0ea5e9]/30 bg-gradient-to-br from-[#0ea5e9]/15 to-[#0ea5e9]/5 px-4 py-4 text-center shadow-[0_0_30px_rgba(14,165,233,0.15)] hover:shadow-[0_0_40px_rgba(14,165,233,0.2)] transition-all">
                  <div className="absolute inset-0 bg-gradient-to-r from-[#0ea5e9]/10 via-transparent to-[#0ea5e9]/10" />
                  <div className="relative text-xs font-bold text-[#0ea5e9]/80 uppercase tracking-widest mb-1.5">Payout</div>
                  <div className="relative text-2xl font-bold text-[#0ea5e9] tabular-nums drop-shadow-[0_0_10px_rgba(14,165,233,0.3)]">{multiplier.toFixed(2)}<span className="text-sm text-[#0ea5e9]/70">x</span></div>
                </div>
                <div className={`relative overflow-hidden rounded-xl border px-4 py-4 text-center transition-all ${evPerTrade >= 0 ? "border-[#30d158]/30 bg-gradient-to-br from-[#30d158]/15 to-[#30d158]/5 hover:shadow-[0_0_25px_rgba(48,209,88,0.15)]" : "border-[#ff453a]/30 bg-gradient-to-br from-[#ff453a]/15 to-[#ff453a]/5 hover:shadow-[0_0_25px_rgba(255,69,58,0.15)]"}`}>
                  <div className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-1.5">EV</div>
                  <div className={`text-2xl font-bold tabular-nums ${evPerTrade >= 0 ? "text-[#30d158] drop-shadow-[0_0_10px_rgba(48,209,88,0.3)]" : "text-[#ff453a] drop-shadow-[0_0_10px_rgba(255,69,58,0.3)]"}`}>
                    {evPerTrade >= 0 ? "+" : ""}{evPerTrade.toFixed(2)}
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Threshold</label>
              <div className={`relative transition-all duration-300 ${changedControl === "target" ? "scale-[1.02]" : ""}`}>
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
                  className={`w-full h-12 rounded-xl border px-4 text-center text-lg font-semibold tabular-nums text-[var(--text-primary)] disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]/50 focus:border-[#0ea5e9]/50 transition-all ${
                    changedControl === "target"
                      ? "border-[#0ea5e9] bg-[#0ea5e9]/15 shadow-[0_0_20px_rgba(14,165,233,0.2)]"
                      : "border-[var(--border)] bg-white/[0.04] hover:border-white/[0.1] hover:bg-white/[0.06]"
                  }`}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[var(--text-tertiary)] pointer-events-none">%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-white/[0.06] overflow-hidden shadow-inner">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#0ea5e9] to-[#5e5ce6] transition-all duration-300 shadow-[0_0_12px_rgba(14,165,233,0.4)]"
                  style={{ width: `${(condition === "over" ? 100 - target : target)}%` }}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Direction</label>
              <div className={`transition-all duration-300 ${changedControl === "condition" ? "scale-[1.02]" : ""}`}>
                <SegmentedControl
                  value={condition}
                  onChange={onConditionChange}
                  disabled={autoPlay}
                  quantLabels
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Position Size</label>
            <div className={`relative transition-all duration-300 ${changedControl === "amount" ? "scale-[1.02]" : ""}`}>
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
                placeholder="1–10,000"
                disabled={autoPlay}
                aria-label="Position size in credits"
                className={`w-full h-12 rounded-xl border px-4 pr-12 text-center text-lg font-semibold tabular-nums text-[var(--text-primary)] disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]/50 focus:border-[#0ea5e9]/50 transition-all ${
                  changedControl === "amount"
                    ? "border-[#0ea5e9] bg-[#0ea5e9]/15 shadow-[0_0_20px_rgba(14,165,233,0.2)]"
                    : "border-[var(--border)] bg-white/[0.04] hover:border-white/[0.1] hover:bg-white/[0.06]"
                }`}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[var(--text-tertiary)] pointer-events-none">cr</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 flex-wrap">
            <BetPercentageButtons
              balance={balance}
              currentBet={amount}
              onBetChange={onAmountChange}
              disabled={autoPlay}
            />
            <div className="w-px h-6 bg-white/[0.08]" />
            <QuickBetButtons
              onHalf={handleHalf}
              onDouble={handleDouble}
              onMax={handleMax}
              disabled={autoPlay}
              currentAmount={amount}
              maxAmount={MAX_BET}
            />
          </div>

          <div className="flex items-center justify-center gap-4 pt-2">
            <button
              type="button"
              onClick={handleRoll}
              disabled={loading || autoPlay || !amount || amount < MIN_BET}
              title="Execute trade (Space / Enter)"
              aria-label="Execute trade"
              className="relative group rounded-full bg-gradient-to-br from-[#0ea5e9] via-[#0ea5e9] to-[#0077b6] px-10 py-4 text-base font-bold text-white shadow-[0_0_30px_rgba(14,165,233,0.4)] hover:shadow-[0_0_50px_rgba(14,165,233,0.5)] hover:scale-[1.03] active:scale-95 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed transition-all duration-200 overflow-hidden border border-[#0ea5e9]/30"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
              <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.2)_0%,transparent_50%)]" />
              <span className="relative flex items-center gap-2.5">
                <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {loading && !autoPlay ? "Executing..." : "Execute"}
              </span>
            </button>

            <button
              type="button"
              onClick={autoPlay ? stopAuto : startAuto}
              disabled={loading && !autoPlay}
              className={`relative rounded-full border-2 px-6 py-4 text-base font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2 shrink-0 ${
                autoPlay
                  ? "border-[#ff453a]/50 bg-gradient-to-br from-[#ff453a]/20 to-[#ff453a]/5 text-[#ff453a] hover:shadow-[0_0_25px_rgba(255,69,58,0.2)] hover:scale-[1.02]"
                  : "border-[#30d158]/50 bg-gradient-to-br from-[#30d158]/20 to-[#30d158]/5 text-[#30d158] hover:shadow-[0_0_25px_rgba(48,209,88,0.2)] hover:scale-[1.02]"
              }`}
            >
              {autoPlay ? (
                <>
                  <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                  </svg>
                  <span>Stop</span>
                  <span className="text-sm opacity-80 tabular-nums">{strategyRun ? strategyRoundsPlayed : autoRounds}</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                  <span>Run Strategy</span>
                </>
              )}
            </button>
          </div>

          {autoPlay && (
            <div className="flex items-center justify-center flex-shrink-0">
              <div className="inline-flex rounded-xl bg-white/[0.04] border border-[var(--border)] p-1 gap-1">
                {AUTO_SPEEDS.map((ms) => (
                  <button
                    key={ms}
                    type="button"
                    onClick={() => setAutoSpeed(ms)}
                    className={`min-w-[52px] px-3 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                      autoSpeed === ms
                        ? "bg-[#0ea5e9]/20 text-[#0ea5e9] border border-[#0ea5e9]/30"
                        : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-white/[0.06]"
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
        </div>
      </div>
    </div>
  );
}

export default DiceGame;
