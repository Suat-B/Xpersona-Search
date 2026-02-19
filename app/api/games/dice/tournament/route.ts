import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  aiTournamentSessions,
  aiTournamentParticipants,
} from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { simulateStrategy } from "@/lib/dice-rule-engine";
import { DICE_HOUSE_EDGE } from "@/lib/constants";
import { CREATIVE_DICE_STRATEGIES } from "@/lib/dice-strategies";
import type { AdvancedDiceStrategy } from "@/lib/advanced-strategy-types";

const TOURNAMENT_ROUNDS = 100;
const STARTING_BALANCE = 1000;

function toAdvancedStrategy(
  name: string,
  amount: number,
  target: number,
  condition: "over" | "under"
): AdvancedDiceStrategy {
  return {
    name,
    baseConfig: { amount, target, condition },
    rules: [
      {
        id: "noop",
        order: 0,
        enabled: true,
        trigger: { type: "balance_above", value: 999999 },
        action: { type: "set_bet_absolute", value: amount },
      },
    ],
    executionMode: "sequential",
  };
}

/**
 * POST /api/games/dice/tournament
 * Create and run an AI vs AI tournament. Returns session with ranked participants.
 */
export async function POST() {
  try {
    const strategies = CREATIVE_DICE_STRATEGIES.slice(0, 6).map((s) => ({
      id: s.id,
      name: s.name,
      snapshot: toAdvancedStrategy(
        s.name,
        s.config.amount,
        s.config.target,
        s.config.condition
      ),
    }));

    const [session] = await db
      .insert(aiTournamentSessions)
      .values({ status: "running" })
      .returning();

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Failed to create session" },
        { status: 500 }
      );
    }

    const results: Array<{
      id: string;
      name: string;
      snapshot: AdvancedDiceStrategy;
      finalPnL: number;
      finalSharpe: number;
      winRate: number;
    }> = [];

    for (const s of strategies) {
      const result = simulateStrategy(
        s.snapshot,
        STARTING_BALANCE,
        TOURNAMENT_ROUNDS,
        DICE_HOUSE_EDGE
      );
      const profit = result.finalBalance - STARTING_BALANCE;
      const vol = Math.sqrt(
        result.roundHistory.reduce((sum, r) => {
          const ret = (r.balance - STARTING_BALANCE) / STARTING_BALANCE;
          return sum + ret * ret;
        }, 0) / result.roundHistory.length
      ) || 0.01;
      const sharpe = vol > 0 ? (profit / STARTING_BALANCE) / vol : 0;
      const winRate =
        result.roundHistory.length > 0
          ? (result.totalWins / result.roundHistory.length) * 100
          : 0;

      const [participant] = await db
        .insert(aiTournamentParticipants)
        .values({
          sessionId: session.id,
          agentId: `aid_${s.id}`,
          strategySnapshot: s.snapshot as unknown as Record<string, unknown>,
          finalPnL: profit,
          finalSharpe: sharpe,
        })
        .returning({ id: aiTournamentParticipants.id });

      results.push({
        id: participant!.id,
        name: s.name,
        snapshot: s.snapshot,
        finalPnL: profit,
        finalSharpe: sharpe,
        winRate,
      });
    }

    results.sort((a, b) => b.finalPnL - a.finalPnL);

    for (let i = 0; i < results.length; i++) {
      await db
        .update(aiTournamentParticipants)
        .set({ rank: i + 1 })
        .where(eq(aiTournamentParticipants.id, results[i].id));
    }

    await db
      .update(aiTournamentSessions)
      .set({
        status: "completed",
        completedAt: new Date(),
        winnerParticipantId: results[0]?.id ?? null,
      })
      .where(eq(aiTournamentSessions.id, session.id));

    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.id,
        participants: results.map((r, i) => ({
          id: r.id,
          name: r.name,
          rank: i + 1,
          finalPnL: r.finalPnL,
          finalSharpe: r.finalSharpe,
          winRate: r.winRate,
          strategySnapshot: r.snapshot,
        })),
      },
    });
  } catch (err) {
    console.error("[tournament POST]", err);
    return NextResponse.json(
      { success: false, error: "INTERNAL_ERROR", message: "Tournament failed" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/games/dice/tournament?sessionId=xxx
 * Fetch tournament session and participants.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");
    if (!sessionId) {
      const [latest] = await db
        .select()
        .from(aiTournamentSessions)
        .orderBy(desc(aiTournamentSessions.createdAt))
        .limit(1);
      if (!latest) {
        return NextResponse.json({
          success: true,
          data: { session: null, participants: [] },
        });
      }
      const participants = await db
        .select()
        .from(aiTournamentParticipants)
        .where(eq(aiTournamentParticipants.sessionId, latest.id))
        .orderBy(aiTournamentParticipants.rank);
      return NextResponse.json({
        success: true,
        data: {
          session: latest,
          participants: participants.map((p) => ({
            id: p.id,
            name: p.agentId.replace("aid_", ""),
            rank: p.rank,
            finalPnL: p.finalPnL,
            finalSharpe: p.finalSharpe,
            strategySnapshot: p.strategySnapshot,
          })),
        },
      });
    }

    const [session] = await db
      .select()
      .from(aiTournamentSessions)
      .where(eq(aiTournamentSessions.id, sessionId))
      .limit(1);

    if (!session) {
      return NextResponse.json(
        { success: false, error: "NOT_FOUND", message: "Session not found" },
        { status: 404 }
      );
    }

    const participants = await db
      .select()
      .from(aiTournamentParticipants)
      .where(eq(aiTournamentParticipants.sessionId, session.id))
      .orderBy(aiTournamentParticipants.rank);

    return NextResponse.json({
      success: true,
      data: {
        session,
        participants: participants.map((p) => ({
          id: p.id,
          name: p.agentId.replace("aid_", ""),
          rank: p.rank,
          finalPnL: p.finalPnL,
          finalSharpe: p.finalSharpe,
          strategySnapshot: p.strategySnapshot,
        })),
      },
    });
  } catch (err) {
    console.error("[tournament GET]", err);
    return NextResponse.json(
      { success: false, error: "INTERNAL_ERROR", message: "Failed to fetch" },
      { status: 500 }
    );
  }
}
