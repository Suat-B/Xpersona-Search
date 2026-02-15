import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { users, gameBets, serverSeeds } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { diceBetSchema } from "@/lib/validation";
import { runDiceBet, validateDiceBet } from "@/lib/games/dice";
import { hashSeed } from "@/lib/games/rng";
import { randomBytes } from "crypto";

export async function POST(request: NextRequest) {
  let authResult: Awaited<ReturnType<typeof getAuthUser>>;
  try {
    authResult = await getAuthUser(request);
  } catch (authErr) {
    const err = authErr as Error;
    console.error("[dice/bet] auth error:", err.message, err.stack);
    const isDb =
      err.message?.includes("connect") ||
      err.message?.includes("ECONNREFUSED") ||
      (err as { code?: string }).code === "ECONNREFUSED";
    return NextResponse.json(
      {
        success: false,
        error: "INTERNAL_ERROR",
        message: isDb
          ? "Database unavailable — ensure Postgres is running (docker compose up -d)"
          : "Auth failed",
      },
      { status: 500 }
    );
  }
  if ("error" in authResult) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: 401 }
    );
  }
  const body = await request.json().catch(() => ({}));
  const parsed = diceBetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: "VALIDATION_ERROR",
        message: parsed.error.flatten().fieldErrors as unknown as string,
      },
      { status: 400 }
    );
  }
  const { amount, target, condition } = parsed.data;
  const balanceError = validateDiceBet(
    amount,
    target,
    condition,
    authResult.user.credits
  );
  if (balanceError) {
    return NextResponse.json(
      { success: false, error: balanceError },
      { status: 400 }
    );
  }
  const clientSeed = "";
  try {
    const result = await db.transaction(async (tx) => {
      const [userRow] = await tx
        .select({ credits: users.credits, faucetCredits: users.faucetCredits })
        .from(users)
        .where(eq(users.id, authResult.user.id))
        .limit(1);
      if (!userRow || userRow.credits < amount) {
        throw new Error("INSUFFICIENT_BALANCE");
      }
      const serverSeed = randomBytes(32).toString("hex");
      const seedHash = hashSeed(serverSeed);
      const [seedRow] = await tx
        .insert(serverSeeds)
        .values({ seedHash, seed: serverSeed, used: true })
        .returning({ id: serverSeeds.id });
      const serverSeedId = seedRow!.id;
      const diceResult = runDiceBet(
        amount,
        target,
        condition,
        serverSeed,
        clientSeed,
        0
      );
      const newCredits = userRow.credits - amount + diceResult.payout;
      const currentFaucet = userRow.faucetCredits ?? 0;
      const burnedFaucet = diceResult.win ? 0 : Math.min(currentFaucet, amount);
      const newFaucetCredits = Math.max(0, currentFaucet - burnedFaucet);
      await tx
        .update(users)
        .set({ credits: newCredits, faucetCredits: newFaucetCredits })
        .where(eq(users.id, authResult.user.id));
      const [bet] = await tx
        .insert(gameBets)
        .values({
          userId: authResult.user.id,
          agentId: authResult.user.agentId ?? undefined,
          gameType: "dice",
          amount,
          outcome: diceResult.win ? "win" : "loss",
          payout: diceResult.payout,
          resultPayload: diceResult.resultPayload,
          serverSeedId,
          clientSeed,
          nonce: 0,
        })
        .returning({ id: gameBets.id });
      return {
        betId: bet!.id,
        balance: newCredits,
        result: diceResult.result,
        win: diceResult.win,
        payout: diceResult.payout,
        verification: {
          serverSeedHash: seedHash,
          clientSeed,
          nonce: 0,
        },
      };
    });
    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (e) {
    const err = e as Error;
    if (err.message === "INSUFFICIENT_BALANCE") {
      return NextResponse.json(
        { success: false, error: "INSUFFICIENT_BALANCE" },
        { status: 400 }
      );
    }
    console.error("[dice/bet] 500:", err.message, err.stack);
    const isDbError =
      err.message?.includes("connect") ||
      err.message?.includes("ECONNREFUSED") ||
      err.message?.includes("connection") ||
      (err as { code?: string }).code === "ECONNREFUSED";
    return NextResponse.json(
      {
        success: false,
        error: "INTERNAL_ERROR",
        message: isDbError
          ? "Database unavailable — ensure Postgres is running (docker compose up -d)"
          : undefined,
      },
      { status: 500 }
    );
  }
}
