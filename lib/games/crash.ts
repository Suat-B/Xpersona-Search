import { CRASH_MAX_MULTIPLIER } from "@/lib/constants";
import { db } from "@/lib/db";
import { crashRounds, crashBets, gameBets } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

/** Multiplier grows linearly: 1 + (elapsedMs/1000)*0.5, cap at CRASH_MAX. */
export function currentMultiplier(round: { startedAt: Date; crashPoint: number }): number {
  const elapsedMs = Date.now() - new Date(round.startedAt).getTime();
  const raw = 1 + (elapsedMs / 1000) * 0.5;
  return Math.min(raw, CRASH_MAX_MULTIPLIER);
}

/** Check if round should be considered crashed (multiplier >= crashPoint). */
export function shouldCrash(round: { startedAt: Date; crashPoint: number }): boolean {
  return currentMultiplier(round) >= round.crashPoint;
}

export type CrashRoundRow = {
  id: string;
  crashPoint: number;
  status: string;
  startedAt: Date;
};

/** Get the single running round, if any. */
export async function getRunningRound(): Promise<CrashRoundRow | null> {
  const rows = await db
    .select({ id: crashRounds.id, crashPoint: crashRounds.crashPoint, status: crashRounds.status, startedAt: crashRounds.startedAt })
    .from(crashRounds)
    .where(eq(crashRounds.status, "running"))
    .orderBy(desc(crashRounds.startedAt))
    .limit(1);
  return rows[0] ?? null;
}

/** Settle a crashed round: mark status crashed; insert game_bets (credits already applied on cashout). */
export async function settleRound(roundId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(crashRounds).set({ status: "crashed" }).where(eq(crashRounds.id, roundId));
    const bets = await tx.select().from(crashBets).where(eq(crashBets.crashRoundId, roundId));
    for (const bet of bets) {
      const outcome = bet.cashedOutAt != null ? "win" : "loss";
      await tx.insert(gameBets).values({
        userId: bet.userId,
        gameType: "crash",
        amount: bet.amount,
        outcome,
        payout: bet.payout,
        resultPayload: { crashRoundId: roundId, cashedOutAt: bet.cashedOutAt, payout: bet.payout },
      });
    }
  });
}
