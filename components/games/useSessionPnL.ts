"use client";

import { useState, useCallback, useEffect } from "react";

export type PnLPoint = { round: number; pnl: number };

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

const DICE_BETS_LIMIT = 100;

/** Server-backed session PnL for the dice page: all dice bets (manual + strategy runs). */
export function useDiceSessionPnL() {
  const [series, setSeries] = useState<PnLPoint[]>([]);
  const [totalPnl, setTotalPnl] = useState(0);
  const [rounds, setRounds] = useState(0);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/me/bets?gameType=dice&limit=${DICE_BETS_LIMIT}`);
      const data = await res.json();
      if (!data.success || !Array.isArray(data.data?.bets)) {
        setSeries([]);
        setTotalPnl(0);
        setRounds(0);
        return;
      }
      const bets = data.data.bets as { pnl: number }[];
      const roundCount = data.data.roundCount as number | undefined;
      const sessionPnl = typeof data.data.sessionPnl === "number" ? data.data.sessionPnl : Number(data.data.sessionPnl) || 0;
      const chronological = [...bets].reverse();
      let cum = 0;
      const newSeries: PnLPoint[] = chronological.map((b, i) => {
        cum += Number(b.pnl);
        return { round: i + 1, pnl: cum };
      });
      setSeries(newSeries);
      setTotalPnl(sessionPnl);
      setRounds(roundCount ?? chronological.length);
    } catch {
      setSeries([]);
      setTotalPnl(0);
      setRounds(0);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    const onBalanceUpdated = () => {
      setTimeout(refetch, 150);
    };
    window.addEventListener("balance-updated", onBalanceUpdated);
    return () => window.removeEventListener("balance-updated", onBalanceUpdated);
  }, [refetch]);

  const reset = useCallback(() => {
    refetch();
  }, [refetch]);

  return { series, totalPnl, rounds, reset };
}
