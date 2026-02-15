"use client";

import { useState, useCallback, useMemo } from "react";

export type PnLPoint = { round: number; pnl: number };

/** Quant metrics derived from session series and recent results */
export type QuantMetrics = {
  sharpeRatio: number | null;
  sortinoRatio: number | null;
  profitFactor: number | null;
  winRate: number;
  avgWin: number | null;
  avgLoss: number | null;
  maxDrawdown: number;
  maxDrawdownPct: number | null;
  recoveryFactor: number | null;
  kellyFraction: number | null;
  expectedValuePerTrade: number | null;
};

export function useSessionPnL() {
  const [series, setSeries] = useState<PnLPoint[]>([]);
  const [totalPnl, setTotalPnl] = useState(0);
  const [rounds, setRounds] = useState(0);

  const addRound = useCallback((bet: number, payout: number) => {
    const delta = payout - bet;
    setRounds((n) => n + 1);
    setTotalPnl((prev) => prev + delta);
    setSeries((prev) => {
      const nextPnl = prev.length > 0 ? prev[prev.length - 1].pnl + delta : delta;
      return [...prev, { round: prev.length + 1, pnl: nextPnl }];
    });
  }, []);

  const reset = useCallback(() => {
    setSeries([]);
    setTotalPnl(0);
    setRounds(0);
  }, []);

  return { series, totalPnl, rounds, addRound, reset };
}

/**
 * Session PnL for the dice page.
 * "Your session" = rounds & PnL since page load (client-side only).
 * Chart series is built purely from addRound — no server overwrite.
 * Tracks wins for full-session win rate (uncapped).
 */
export function useDiceSessionPnL() {
  const [series, setSeries] = useState<PnLPoint[]>([]);
  const [totalPnl, setTotalPnl] = useState(0);
  const [rounds, setRounds] = useState(0);
  const [wins, setWins] = useState(0);

  const addRound = useCallback((bet: number, payout: number) => {
    const delta = payout - bet;
    const isWin = payout > bet;
    setRounds((n) => n + 1);
    setWins((w) => w + (isWin ? 1 : 0));
    setTotalPnl((prev) => prev + delta);
    setSeries((prev) => {
      const nextPnl = prev.length > 0 ? prev[prev.length - 1].pnl + delta : delta;
      return [...prev, { round: prev.length + 1, pnl: nextPnl }];
    });
  }, []);

  const addBulkSession = useCallback((sessionPnl: number, roundsPlayed: number, winsCount: number) => {
    if (roundsPlayed <= 0) return;
    setRounds((n) => n + roundsPlayed);
    setWins((w) => w + winsCount);
    setTotalPnl((prev) => prev + sessionPnl);
    setSeries((prev) => {
      const nextPnl = prev.length > 0 ? prev[prev.length - 1].pnl + sessionPnl : sessionPnl;
      return [...prev, { round: prev.length + roundsPlayed, pnl: nextPnl }];
    });
  }, []);

  const reset = useCallback(() => {
    setRounds(0);
    setTotalPnl(0);
    setWins(0);
    setSeries([]);
  }, []);

  const quantMetrics = useMemo((): QuantMetrics => {
    if (series.length < 2) {
      return {
        sharpeRatio: null,
        sortinoRatio: null,
        profitFactor: null,
        winRate: rounds > 0 ? (wins / rounds) * 100 : 0,
        avgWin: null,
        avgLoss: null,
        maxDrawdown: 0,
        maxDrawdownPct: null,
        recoveryFactor: null,
        kellyFraction: null,
        expectedValuePerTrade: null,
      };
    }
    const returns = series.map((p, i) => (i === 0 ? p.pnl : p.pnl - series[i - 1]!.pnl));
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const n = returns.length;
    const variance = n > 1
      ? returns.reduce((acc, r) => acc + (r - mean) ** 2, 0) / (n - 1)
      : 0;
    const std = Math.sqrt(variance);
    const MIN_STD_FOR_SHARPE = 1e-6;
    const MIN_ROUNDS_FOR_SHARPE = 10;
    const sharpeRatio =
      n >= MIN_ROUNDS_FOR_SHARPE && std >= MIN_STD_FOR_SHARPE
        ? Math.min(mean / std, 10)
        : null;

    const negativeReturns = returns.filter((r) => r < 0);
    const downsideVariance =
      negativeReturns.length > 1
        ? negativeReturns.reduce((acc, r) => acc + r ** 2, 0) / negativeReturns.length
        : 0;
    const downsideStd = Math.sqrt(downsideVariance);
    const sortinoRatio =
      n >= MIN_ROUNDS_FOR_SHARPE && downsideStd >= MIN_STD_FOR_SHARPE
        ? Math.min(mean / downsideStd, 10)
        : null;

    const winsList = returns.filter((r) => r > 0);
    const lossesList = returns.filter((r) => r < 0);
    const grossProfit = winsList.reduce((a, b) => a + b, 0);
    const grossLoss = Math.abs(lossesList.reduce((a, b) => a + b, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : null;

    const avgWin = winsList.length > 0 ? grossProfit / winsList.length : null;
    const avgLoss = lossesList.length > 0 ? grossLoss / lossesList.length : null;

    let peak = 0;
    let maxDrawdown = 0;
    for (const p of series) {
      peak = Math.max(peak, p.pnl);
      maxDrawdown = Math.max(maxDrawdown, peak - p.pnl);
    }
    const initialPnl = series[0]?.pnl ?? 0;
    const peakVal = Math.max(0, ...series.map((p) => p.pnl));
    const maxDrawdownPct = peakVal > 0 ? (maxDrawdown / peakVal) * 100 : null;

    const recoveryFactor = maxDrawdown > 0 ? totalPnl / maxDrawdown : null;

    const winRate = rounds > 0 ? wins / rounds : 0;
    const lossRate = 1 - winRate;
    const kellyFraction =
      avgWin != null && avgWin > 0 && avgLoss != null
        ? Math.max(0, (winRate * avgWin - lossRate * avgLoss) / avgWin)
        : null;

    const evPerTrade = returns.length > 0 ? mean : null;

    return {
      sharpeRatio,
      sortinoRatio,
      profitFactor,
      winRate: rounds > 0 ? (wins / rounds) * 100 : 0,
      avgWin,
      avgLoss,
      maxDrawdown,
      maxDrawdownPct,
      recoveryFactor,
      kellyFraction: kellyFraction != null ? kellyFraction * 100 : null,
      expectedValuePerTrade: evPerTrade,
    };
  }, [series, rounds, wins, totalPnl]);

  return { series, totalPnl, rounds, wins, addRound, addBulkSession, reset, quantMetrics };
}
