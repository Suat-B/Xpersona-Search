/**
 * Bet event broadcaster for real-time live feed.
 * In-memory EventEmitter keyed by userId. Emits bet events when any bet completes
 * (UI, API, OpenClaw, run-strategy, run-advanced-strategy).
 * Single-instance only; for multi-instance deploy add Redis Pub/Sub.
 */

export type BetEventPayload = {
  userId: string;
  bet: {
    result: number;
    win: boolean;
    payout: number;
    balance: number;
    amount: number;
    target: number;
    condition: "over" | "under";
    betId?: string;
    agentId?: string | null;
  };
};

export type DepositAlertPayload = {
  userId: string;
  deposit_url: string;
  deposit_alert_message: string;
};

type BetListener = (payload: BetEventPayload) => void;
type DepositAlertListener = (payload: DepositAlertPayload) => void;

const listenersByUserId = new Map<string, Set<BetListener>>();
const depositAlertListenersByUserId = new Map<string, Set<DepositAlertListener>>();

/**
 * Subscribe to bet events for a user. Returns an unsubscribe function.
 */
export function subscribeToBetEvents(
  userId: string,
  listener: BetListener
): () => void {
  let set = listenersByUserId.get(userId);
  if (!set) {
    set = new Set();
    listenersByUserId.set(userId, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
    if (set?.size === 0) {
      listenersByUserId.delete(userId);
    }
  };
}

/**
 * Subscribe to deposit alert events for a user (e.g. when AI runs out of credits).
 * Returns an unsubscribe function.
 */
export function subscribeToDepositAlerts(
  userId: string,
  listener: DepositAlertListener
): () => void {
  let set = depositAlertListenersByUserId.get(userId);
  if (!set) {
    set = new Set();
    depositAlertListenersByUserId.set(userId, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
    if (set?.size === 0) {
      depositAlertListenersByUserId.delete(userId);
    }
  };
}

/**
 * Emit a bet event to all subscribers for the given user.
 * Call this after any successful bet (bet route, executeDiceRound).
 */
export function emitBetEvent(payload: BetEventPayload): void {
  const set = listenersByUserId.get(payload.userId);
  if (!set) return;
  for (const listener of set) {
    try {
      listener(payload);
    } catch (err) {
      console.error("[bet-events] Listener error:", err);
    }
  }
}

/**
 * Emit a deposit alert to all subscribers (e.g. when AI auto-play stops due to insufficient balance).
 * For AI assistants: tell the player to deposit or claim Free Credits.
 */
export function emitDepositAlertEvent(payload: DepositAlertPayload): void {
  const set = depositAlertListenersByUserId.get(payload.userId);
  if (!set) return;
  for (const listener of set) {
    try {
      listener(payload);
    } catch (err) {
      console.error("[bet-events] DepositAlert listener error:", err);
    }
  }
}
