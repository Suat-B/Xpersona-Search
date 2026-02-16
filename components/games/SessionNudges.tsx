"use client";

import { useEffect, useState, useRef } from "react";

export type NudgeType =
  | "first_profit"
  | "session_high"
  | "milestone_100"
  | "milestone_500"
  | "recovery_complete"
  | "loss_streak_3"
  | "loss_streak_5"
  | "new_drawdown"
  | "pnl_negative_50";

interface Nudge {
  id: string;
  type: NudgeType;
  message: string;
  variant: "positive" | "encouragement";
}

const NUDGE_MESSAGES: Record<Exclude<NudgeType, "session_high">, string> & { session_high: (amount: number) => string } = {
  first_profit: "First profit!",
  session_high: (amount: number) => `Session high! +${amount}`,
  milestone_100: "+100 milestone!",
  milestone_500: "+500 milestone!",
  recovery_complete: "Recovery complete!",
  loss_streak_3: "Variance is normal. Stay the course.",
  loss_streak_5: "67% of sessions recover from here.",
  new_drawdown: "Markets mean-revert. Patience.",
  pnl_negative_50: "Your strategy has a positive expected value. Trust the process.",
};

function getMessage(type: NudgeType, amount?: number): string {
  const msg = NUDGE_MESSAGES[type];
  return typeof msg === "function" ? msg(amount ?? 0) : msg;
}

interface SessionNudgesProps {
  /** Current session P&L */
  totalPnl: number;
  /** Number of rounds played */
  rounds: number;
  /** Session high watermark (max PnL reached) */
  sessionHigh: number;
  /** Whether we just set a new session high this update */
  isNewSessionHigh: boolean;
  /** Whether we were negative and just went positive (recovery) */
  justRecovered: boolean;
  /** Consecutive losses */
  lossStreak: number;
  /** Whether we hit a new drawdown this round */
  newDrawdown: boolean;
  /** Whether we have positive EV (for encouragement when down) */
  hasPositiveEv?: boolean;
}

export function SessionNudges({
  totalPnl,
  rounds,
  sessionHigh,
  isNewSessionHigh,
  justRecovered,
  lossStreak,
  newDrawdown,
  hasPositiveEv = true,
}: SessionNudgesProps) {
  const [nudge, setNudge] = useState<Nudge | null>(null);
  const lastTriggeredRef = useRef<Partial<Record<NudgeType, number>>>({});
  const prevPnlRef = useRef(totalPnl);
  const prevRoundsRef = useRef(rounds);

  useEffect(() => {
    const now = Date.now();
    const cooldown = 8000;
    const last = lastTriggeredRef.current;

    if (totalPnl > 0 && rounds >= 1 && !last.first_profit) {
      setNudge({ id: `first-${now}`, type: "first_profit", message: getMessage("first_profit"), variant: "positive" });
      lastTriggeredRef.current = { ...last, first_profit: now };
      return;
    }

    if (prevPnlRef.current < 100 && totalPnl >= 100 && totalPnl < 200 && !last.milestone_100) {
      setNudge({ id: `m100-${now}`, type: "milestone_100", message: getMessage("milestone_100"), variant: "positive" });
      lastTriggeredRef.current = { ...last, milestone_100: now };
      prevPnlRef.current = totalPnl;
      prevRoundsRef.current = rounds;
      return;
    }

    if (prevPnlRef.current < 500 && totalPnl >= 500 && !last.milestone_500) {
      setNudge({ id: `m500-${now}`, type: "milestone_500", message: getMessage("milestone_500"), variant: "positive" });
      lastTriggeredRef.current = { ...last, milestone_500: now };
      prevPnlRef.current = totalPnl;
      prevRoundsRef.current = rounds;
      return;
    }

    if (justRecovered && !last.recovery_complete) {
      setNudge({ id: `rec-${now}`, type: "recovery_complete", message: getMessage("recovery_complete"), variant: "positive" });
      lastTriggeredRef.current = { ...last, recovery_complete: now };
      return;
    }

    if (isNewSessionHigh && sessionHigh > 0 && rounds > 2 && (last.session_high ?? 0) < now - cooldown) {
      setNudge({ id: `high-${now}`, type: "session_high", message: getMessage("session_high", Math.round(sessionHigh)), variant: "positive" });
      lastTriggeredRef.current = { ...last, session_high: now };
      return;
    }

    if (lossStreak >= 3 && (last.loss_streak_3 ?? 0) < now - cooldown) {
      setNudge({ id: `l3-${now}`, type: "loss_streak_3", message: getMessage("loss_streak_3"), variant: "encouragement" });
      lastTriggeredRef.current = { ...last, loss_streak_3: now };
      return;
    }

    if (lossStreak >= 5 && (last.loss_streak_5 ?? 0) < now - cooldown) {
      setNudge({ id: `l5-${now}`, type: "loss_streak_5", message: getMessage("loss_streak_5"), variant: "encouragement" });
      lastTriggeredRef.current = { ...last, loss_streak_5: now };
      return;
    }

    if (newDrawdown && totalPnl < 0 && (last.new_drawdown ?? 0) < now - cooldown) {
      setNudge({ id: `dd-${now}`, type: "new_drawdown", message: getMessage("new_drawdown"), variant: "encouragement" });
      lastTriggeredRef.current = { ...last, new_drawdown: now };
      return;
    }

    if (totalPnl <= -50 && totalPnl > -60 && hasPositiveEv && (last.pnl_negative_50 ?? 0) < now - cooldown) {
      setNudge({ id: `pnl-${now}`, type: "pnl_negative_50", message: getMessage("pnl_negative_50"), variant: "encouragement" });
      lastTriggeredRef.current = { ...last, pnl_negative_50: now };
    }

    prevPnlRef.current = totalPnl;
    prevRoundsRef.current = rounds;
  }, [totalPnl, rounds, sessionHigh, isNewSessionHigh, justRecovered, lossStreak, newDrawdown, hasPositiveEv]);

  // Auto-dismiss after 3 seconds
  useEffect(() => {
    if (!nudge) return;
    const timer = setTimeout(() => setNudge(null), 3000);
    return () => clearTimeout(timer);
  }, [nudge]);

  if (!nudge) return null;

  return (
    <div
      className={`rounded-xl border px-5 py-3.5 font-medium shadow-lg ${nudge.type === "new_drawdown" ? "text-xs" : "text-sm"}`}
      role="status"
      aria-live="polite"
      style={{
        borderColor: nudge.variant === "positive" ? "rgba(48, 209, 88, 0.4)" : "rgba(14, 165, 233, 0.4)",
        backgroundColor: nudge.variant === "positive" ? "rgba(48, 209, 88, 0.1)" : "rgba(14, 165, 233, 0.08)",
        color: nudge.variant === "positive" ? "#30d158" : "#0ea5e9",
      }}
    >
      {nudge.message}
    </div>
  );
}
