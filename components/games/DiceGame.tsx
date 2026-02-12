"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Dice3D } from "./Dice3D";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { QuickBetButtons } from "@/components/ui/QuickBetButtons";
import { Sparkles, Confetti } from "@/components/ui/Sparkles";

type Result = {
  result: number;
  win: boolean;
  payout: number;
  balance: number;
} | null;

const AUTO_SPEEDS = [100, 250, 500, 1000] as const;
const MAX_BET = 10000;
const MIN_BET = 1;

export type DiceGameProps = {
  amount: number;
  target: number;
  condition: "over" | "under";
  onAmountChange: (v: number) => void;
  onTargetChange: (v: number) => void;
  onConditionChange: (v: "over" | "under") => void;
  onRoundComplete: (bet: number, payout: number) => void;
  onAutoPlayChange?: (active: boolean) => void;
  onResult?: (result: { result: number; win: boolean; payout: number; betAmount?: number }) => void;
};

export function DiceGame({
  amount,
  target,
  condition,
  onAmountChange,
  onTargetChange,
  onConditionChange,
  onRoundComplete,
  onAutoPlayChange,
  onResult,
}: DiceGameProps) {
  const [result, setResult] = useState<Result>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoPlay, setAutoPlay] = useState(false);
  const [autoSpeed, setAutoSpeed] = useState(250);
  const [autoRounds, setAutoRounds] = useState(0);
  const [showWinEffects, setShowWinEffects] = useState(false);
  const stopRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const betInputRef = useRef<HTMLInputElement | null>(null);

  // Ensure BET input reflects external updates (e.g. strategy Apply) when it has focus
  useEffect(() => {
    const el = betInputRef.current;
    if (el && document.activeElement === el && el.value !== String(amount)) {
      el.value = String(amount);
    }
  }, [amount]);

  const runBet = useCallback(async (): Promise<boolean> => {
    type BetRes = { success?: boolean; data?: { result: number; win: boolean; payout: number; balance: number }; error?: string; message?: string };
    let httpStatus: number;
    let data: BetRes;
    try {
      const response = await fetch("/api/games/dice/bet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ amount, target, condition }),
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
      onResult?.({ ...newResult, betAmount: amount });
      onRoundComplete(amount, data.data.payout);
      
      // Show win effects
      if (newResult.win) {
        setShowWinEffects(true);
        setTimeout(() => setShowWinEffects(false), 2000);
      }
      
      setTimeout(() => window.dispatchEvent(new Event("balance-updated")), 0);
      return true;
    }
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
  }, [amount, target, condition, onRoundComplete, onResult]);

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
    stopRef.current = true;
    if (timeoutRef.current != null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setAutoPlay(false);
    onAutoPlayChange?.(false);
  }, [onAutoPlayChange]);

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

  // Calculate multiplier based on target and condition
  const getMultiplier = () => {
    const probability = condition === "over" ? (100 - target) / 100 : target / 100;
    const multiplier = 0.97 / probability; // 3% house edge
    return multiplier.toFixed(2);
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Win Effects */}
      <Sparkles active={showWinEffects} count={25} />
      <Confetti active={showWinEffects && (result?.payout || 0) > amount * 2} />
      
      {/* Game Container */}
      <div className="flex-1 flex flex-col min-h-0 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
        
        {/* Header - Compact */}
        <div className="flex-shrink-0 px-6 pt-4 pb-3 text-center border-b border-[var(--border)]/50">
          <div className="flex items-center justify-center gap-4 text-xs text-[var(--text-secondary)]">
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

            <button
              type="button"
              onClick={autoPlay ? stopAuto : startAuto}
              disabled={loading && !autoPlay}
              className={`rounded-xl border-2 px-4 py-3.5 text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-1.5 ${
                autoPlay
                  ? "border-red-500 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                  : "border-emerald-500 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
              }`}
            >
              {autoPlay ? (
                <>
                  <svg className="w-4 h-4 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                  </svg>
                  STOP
                  <span className="text-xs opacity-70">({autoRounds})</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                  AUTO
                </>
              )}
            </button>

            {autoPlay && (
              <select
                value={autoSpeed}
                onChange={(e) => setAutoSpeed(Number(e.target.value))}
                className="rounded-xl border-2 border-[var(--border)] bg-[var(--bg-matte)] px-3 py-3 text-sm font-medium text-[var(--text-primary)] focus:border-[var(--accent-heart)] focus:outline-none"
              >
                {AUTO_SPEEDS.map((ms) => (
                  <option key={ms} value={ms}>
                    {ms === 100 ? "⚡" : ms === 250 ? "▶" : ms === 500 ? "◐" : "◐"}
                  </option>
                ))}
              </select>
            )}
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
