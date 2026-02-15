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

type Listener = (payload: BetEventPayload) => void;

const listenersByUserId = new Map<string, Set<Listener>>();

/**
 * Subscribe to bet events for a user. Returns an unsubscribe function.
 */
export function subscribeToBetEvents(
  userId: string,
  listener: Listener
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
