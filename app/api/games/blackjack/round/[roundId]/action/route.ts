import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { users, blackjackRounds, gameBets } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { blackjackActionSchema } from "@/lib/validation";
import {
  handValue,
  dealerPlay,
  settleBlackjack,
} from "@/lib/games/blackjack";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ roundId: string }> }
) {
  const authResult = await getAuthUser(request as any);
  if ("error" in authResult) {
    return NextResponse.json({ success: false, error: authResult.error }, { status: 401 });
  }
  const { roundId } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = blackjackActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }
  const action = parsed.data.action;
  const [round] = await db
    .select()
    .from(blackjackRounds)
    .where(eq(blackjackRounds.id, roundId))
    .limit(1);
  if (!round) {
    return NextResponse.json({ success: false, error: "ROUND_NOT_FOUND" }, { status: 404 });
  }
  if (round.userId !== authResult.user.id) {
    return NextResponse.json({ success: false, error: "ROUND_NOT_YOURS" }, { status: 403 });
  }
  if (round.status !== "active") {
    return NextResponse.json({ success: false, error: "ROUND_ENDED" }, { status: 400 });
  }
  const playerHands = round.playerHands as string[][];
  const deck = round.deck as string[];
  const dealerHand = round.dealerHand as string[];
  let newPlayerHands = playerHands;
  let newDeck = deck;
  let newStatus = round.status;

  if (action === "hit") {
    const currentHand = newPlayerHands[newPlayerHands.length - 1];
    const card = newDeck[0];
    newDeck = newDeck.slice(1);
    newPlayerHands = [...newPlayerHands.slice(0, -1), [...currentHand, card]];
    if (handValue(newPlayerHands[newPlayerHands.length - 1]) > 21) {
      newStatus = "bust";
    }
  } else if (action === "stand") {
    newStatus = "stood";
  } else if (action === "double") {
    const currentHand = newPlayerHands[newPlayerHands.length - 1];
    if (currentHand.length !== 2) {
      return NextResponse.json({ success: false, error: "VALIDATION_ERROR" }, { status: 400 });
    }
    const [userRow] = await db.select({ credits: users.credits }).from(users).where(eq(users.id, authResult.user.id)).limit(1);
    if (!userRow || userRow.credits < round.betAmount) {
      return NextResponse.json({ success: false, error: "INSUFFICIENT_BALANCE" }, { status: 400 });
    }
    await db.update(users).set({ credits: userRow.credits - round.betAmount }).where(eq(users.id, authResult.user.id));
    await db.update(blackjackRounds).set({ betAmount: round.betAmount * 2, updatedAt: new Date() }).where(eq(blackjackRounds.id, roundId));
    const card = newDeck[0];
    newDeck = newDeck.slice(1);
    newPlayerHands = [...newPlayerHands.slice(0, -1), [...currentHand, card]];
    newStatus = "stood";
    round.betAmount = round.betAmount * 2;
  } else if (action === "split") {
    const currentHand = newPlayerHands[newPlayerHands.length - 1];
    if (currentHand.length !== 2 || currentHand[0].slice(0, -1) !== currentHand[1].slice(0, -1)) {
      return NextResponse.json({ success: false, error: "VALIDATION_ERROR" }, { status: 400 });
    }
    const c1 = newDeck[0];
    const c2 = newDeck[1];
    newDeck = newDeck.slice(2);
    newPlayerHands = [[currentHand[0], c1], [currentHand[1], c2]];
  }

  await db
    .update(blackjackRounds)
    .set({
      playerHands: newPlayerHands,
      deck: newDeck,
      status: newStatus,
      updatedAt: new Date(),
    })
    .where(eq(blackjackRounds.id, roundId));

  if (newStatus === "bust") {
    const [userRow] = await db.select({ credits: users.credits }).from(users).where(eq(users.id, authResult.user.id)).limit(1);
    await db.insert(gameBets).values({
      userId: authResult.user.id,
      gameType: "blackjack",
      amount: round.betAmount,
      outcome: "loss",
      payout: 0,
      resultPayload: { playerHands: newPlayerHands, dealerHand, outcome: "loss" },
      serverSeedId: round.serverSeedId,
      clientSeed: round.clientSeed,
      nonce: round.nonce,
    });
    return NextResponse.json({
      success: true,
      data: {
        status: "settled",
        outcome: "loss",
        payout: 0,
        balance: userRow!.credits,
        playerHands: newPlayerHands,
        dealerHand,
      },
    });
  }

  if (newStatus === "stood") {
    const { cards: dealerCards, remaining: remainingDeck } = dealerPlay(newDeck);
    const finalDealerHand = [...dealerHand, ...dealerCards];
    const { outcome, payout } = settleBlackjack(
      newPlayerHands,
      finalDealerHand,
      round.betAmount
    );
    const [userRow] = await db.select({ credits: users.credits }).from(users).where(eq(users.id, authResult.user.id)).limit(1);
    const newBalance = (userRow!.credits ?? 0) + payout;
    await db.update(users).set({ credits: newBalance }).where(eq(users.id, authResult.user.id));
    await db.update(blackjackRounds).set({ status: "settled", dealerHand: finalDealerHand, deck: remainingDeck, updatedAt: new Date() }).where(eq(blackjackRounds.id, roundId));
    await db.insert(gameBets).values({
      userId: authResult.user.id,
      gameType: "blackjack",
      amount: round.betAmount,
      outcome: outcome === "push" ? "push" : outcome,
      payout,
      resultPayload: { playerHands: newPlayerHands, dealerHand: finalDealerHand, outcome },
      serverSeedId: round.serverSeedId,
      clientSeed: round.clientSeed,
      nonce: round.nonce,
    });
    return NextResponse.json({
      success: true,
      data: {
        status: "settled",
        outcome,
        payout,
        balance: newBalance,
        playerHands: newPlayerHands,
        dealerHand: finalDealerHand,
      },
    });
  }

  return NextResponse.json({
    success: true,
    data: {
      roundId,
      playerHand: newPlayerHands[newPlayerHands.length - 1],
      playerHands: newPlayerHands,
      dealerUp: dealerHand[0],
      status: newStatus,
    },
  });
}
