"use client";

import { useState, useCallback } from "react";

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

/**
 * Session PnL for the dice page.
 * "Your session" = rounds & PnL since page load (client-side only).
 * Chart series is built purely from addRound — no server overwrite.
 */
export function useDiceSessionPnL() {
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
    setRounds(0);
    setTotalPnl(0);
    setSeries([]);
  }, []);

  return { series, totalPnl, rounds, addRound, reset };
}
