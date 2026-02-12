"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Dice3D } from "@/components/games/Dice3D";
import { Sparkles, Confetti } from "@/components/ui/Sparkles";
import {
  createProgressionState,
  getNextBet,
  type ProgressionState,
  type RoundResult,
} from "@/lib/dice-progression";
import type { DiceStrategyConfig } from "@/lib/strategies";

const ROLL_DURATION_MS = 1800;
const MIN_ROUNDS = 1;
const MAX_ROUNDS = 1000;

type BetResponse = {
  success?: boolean;
  data?: { result: number; win: boolean; payout: number; balance: number };
  error?: string;
  message?: string;
};

export type StrategyRunModalProps = {
  isOpen: boolean;
  onClose: () => void;
  strategyName: string;
  config: DiceStrategyConfig;
  defaultRounds?: number;
  onComplete?: (sessionPnl: number, roundsPlayed: number, finalBalance: number) => void;
};

export function StrategyRunModal({
  isOpen,
  onClose,
  strategyName,
  config,
  defaultRounds = 20,
  onComplete,
}: StrategyRunModalProps) {
  const [roundsInput, setRoundsInput] = useState(String(defaultRounds));
  const [phase, setPhase] = useState<"setup" | "running" | "complete">("setup");
  const [balance, setBalance] = useState<number>(0);
  const [currentBet, setCurrentBet] = useState<number>(config.amount);
  const [roundIndex, setRoundIndex] = useState(0);
  const [totalRounds, setTotalRounds] = useState(20);
  const [result, setResult] = useState<{ result: number; win: boolean; payout: number } | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [showWinEffects, setShowWinEffects] = useState(false);
  const [sessionPnl, setSessionPnl] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef<ProgressionState | null>(null);
  const stopRef = useRef(false);
  const balanceRef = useRef(0);
  const sessionPnlRef = useRef(0);

  // Load initial balance when modal opens
  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      try {
        const res = await fetch("/api/me/balance", { credentials: "include" });
        const data = await res.json().catch(() => ({}));
        if (data.success && typeof data.data?.balance === "number") {
          const b = data.data.balance;
          setBalance(b);
          balanceRef.current = b;
        }
      } catch {
        // ignore
      }
    };
    load();
    setPhase("setup");
    setRoundsInput(String(defaultRounds));
    setResult(null);
    setSessionPnl(0);
    setRoundIndex(0);
    setError(null);
    stopRef.current = false;
  }, [isOpen, defaultRounds]);

  const runRound = useCallback(async (): Promise<boolean> => {
    const amount = currentBet;
    const { target, condition } = config;

    if (amount > balance || amount < 1) {
      setError("Insufficient balance");
      return false;
    }

    setIsRolling(true);
    setResult(null);
    const rollStartTime = Date.now();

    try {
      const res = await fetch("/api/games/dice/bet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ amount, target, condition }),
      });
      const data: BetResponse = await res.json().catch(() => ({}));

      if (!data.success || !data.data) {
        const msg = data.error ?? data.message ?? "Bet failed";
        setError(msg === "INSUFFICIENT_BALANCE" ? "Insufficient balance" : msg);
        setIsRolling(false);
        return false;
      }

      const { result: diceResult, win, payout } = data.data;
      const pnl = payout - amount;

      // Guarantee full dice roll animation (identical to game page experience)
      const elapsed = Date.now() - rollStartTime;
      const remaining = Math.max(0, ROLL_DURATION_MS - elapsed);
      await new Promise((r) => setTimeout(r, remaining));

      if (stopRef.current) return false;

      setResult({ result: diceResult, win, payout });
      const newBalance = data.data.balance;
      setSessionPnl((s) => {
        const next = s + pnl;
        sessionPnlRef.current = next;
        return next;
      });
      setBalance(newBalance);
      balanceRef.current = newBalance;

      if (win) {
        setShowWinEffects(true);
        setTimeout(() => setShowWinEffects(false), 2000);
      }

      // Update progression for next round
      const state = stateRef.current;
      if (state) {
        const roundResult: RoundResult = { win, payout, betAmount: amount };
        const { nextBet, nextState } = getNextBet(state, roundResult, config, data.data.balance);
        stateRef.current = nextState;
        setCurrentBet(nextBet);
      }

      window.dispatchEvent(new Event("balance-updated"));
      return true;
    } catch {
      setError("Connection failed");
      setIsRolling(false);
      return false;
    } finally {
      setIsRolling(false);
    }
  }, [currentBet, balance, config]);

  const handleStart = useCallback(async () => {
    const parsed = parseInt(roundsInput, 10);
    const rounds = Math.min(MAX_ROUNDS, Math.max(MIN_ROUNDS, Number.isNaN(parsed) ? 20 : parsed));
    setRoundsInput(String(rounds));
    setTotalRounds(rounds);
    setError(null);
    setPhase("running");
    setRoundIndex(0);
    setSessionPnl(0);
    sessionPnlRef.current = 0;
    balanceRef.current = balance;

    const initialState = createProgressionState(config, balance);
    stateRef.current = initialState;
    setCurrentBet(initialState.currentBet);

    let lastRoundPlayed = 0;
    for (let i = 0; i < rounds; i++) {
      if (stopRef.current) break;
      setRoundIndex(i + 1);
      lastRoundPlayed = i + 1;
      const ok = await runRound();
      if (!ok) break;
      if (i < rounds - 1) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }

    setPhase("complete");
    onComplete?.(sessionPnlRef.current, lastRoundPlayed, balanceRef.current);
  }, [roundsInput, balance, config, runRound, onComplete]);

  const handleStop = useCallback(() => {
    stopRef.current = true;
    setPhase("complete");
  }, []);

  const handleClose = useCallback(() => {
    stopRef.current = true;
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl overflow-hidden">
        <Sparkles active={showWinEffects} count={25} />
        <Confetti active={showWinEffects && (result?.payout ?? 0) > (currentBet || 1) * 2} />

        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">{strategyName}</h3>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-white/10 hover:text-[var(--text-primary)] transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {phase === "setup" && (
            <>
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Number of rounds</label>
                <input
                  type="number"
                  min={MIN_ROUNDS}
                  max={MAX_ROUNDS}
                  value={roundsInput}
                  onChange={(e) => setRoundsInput(e.target.value)}
                  placeholder={`${MIN_ROUNDS}–${MAX_ROUNDS}`}
                  className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--bg-matte)] px-4 py-3 text-center text-lg font-mono font-bold text-[var(--text-primary)] focus:border-[var(--accent-heart)] focus:outline-none"
                />
                <p className="mt-1 text-xs text-[var(--text-secondary)]">Custom: {MIN_ROUNDS}–{MAX_ROUNDS} rounds</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border-2 border-[var(--border)] bg-[var(--bg-matte)] p-4 text-center">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] mb-1">Current balance</div>
                  <div className="text-xl font-mono font-bold text-[var(--text-primary)]">{balance} cr</div>
                </div>
                <div className="rounded-xl border-2 border-[var(--border)] bg-[var(--bg-matte)] p-4 text-center">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] mb-1">Bet per round</div>
                  <div className="text-xl font-mono font-bold text-[var(--accent-heart)]">{config.amount ?? 10} cr</div>
                  {config.progressionType && config.progressionType !== "flat" && (
                    <p className="mt-1 text-[10px] text-[var(--text-secondary)]">(varies with progression)</p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={handleStart}
                disabled={balance < config.amount}
                className="w-full rounded-xl bg-gradient-to-b from-[var(--accent-heart)] to-[#e11d48] px-6 py-3.5 text-lg font-bold text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                Start run
              </button>
              {balance < config.amount && (
                <p className="text-xs text-amber-400 text-center">Insufficient balance to start</p>
              )}
            </>
          )}

          {(phase === "running" || phase === "complete") && (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-[var(--bg-matte)] p-2">
                  <div className="text-[10px] uppercase text-[var(--text-secondary)]">Balance</div>
                  <div className="text-lg font-mono font-bold text-[var(--text-primary)]">{balance} cr</div>
                </div>
                <div className="rounded-lg bg-[var(--bg-matte)] p-2">
                  <div className="text-[10px] uppercase text-[var(--text-secondary)]">Bet</div>
                  <div className="text-lg font-mono font-bold text-[var(--accent-heart)]">{currentBet} cr</div>
                </div>
                <div className="rounded-lg bg-[var(--bg-matte)] p-2">
                  <div className="text-[10px] uppercase text-[var(--text-secondary)]">Round</div>
                  <div className="text-lg font-mono font-bold text-[var(--text-primary)]">
                    {roundIndex} / {totalRounds}
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-center justify-center py-4">
                {result && !isRolling && (
                  <div className="mb-4 text-center animate-bounce-in">
                    <div
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${
                        result.win
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                          : "bg-red-500/20 text-red-400 border border-red-500/30"
                      }`}
                    >
                      <span className="text-lg">{result.win ? "🎉" : "😔"}</span>
                      <span className="font-bold">{result.win ? "WIN!" : "Lose"}</span>
                      <span className="font-mono font-bold">
                        {result.win ? `+${result.payout}` : currentBet} cr
                      </span>
                    </div>
                  </div>
                )}
                <div className="relative z-10">
                  <Dice3D
                    value={result?.result ?? null}
                    isRolling={isRolling}
                    win={result?.win ?? null}
                  />
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <span
                  className={`text-sm font-mono ${
                    sessionPnl >= 0 ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  Session: {sessionPnl >= 0 ? "+" : ""}
                  {sessionPnl} cr
                </span>
                {phase === "running" && (
                  <button
                    type="button"
                    onClick={handleStop}
                    className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/20"
                  >
                    Stop
                  </button>
                )}
                {phase === "complete" && (
                  <button
                    type="button"
                    onClick={handleClose}
                    className="rounded-lg bg-[var(--accent-heart)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                  >
                    Done
                  </button>
                )}
              </div>
            </>
          )}

          {error && (
            <p className="text-sm text-red-400 text-center" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
