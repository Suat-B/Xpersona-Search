import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { crashRounds, serverSeeds } from "@/lib/db/schema";
import {
  getRunningRound,
  currentMultiplier,
  shouldCrash,
  settleRound,
} from "@/lib/games/crash";
import { hashToFloat, hashSeed } from "@/lib/games/rng";
import { randomBytes } from "crypto";
import { CRASH_MIN_MULTIPLIER, CRASH_MAX_MULTIPLIER } from "@/lib/constants";

export async function GET(request: Request) {
  const authResult = await getAuthUser(request as any);
  if ("error" in authResult) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: 401 }
    );
  }
  let round = await getRunningRound();
  if (round) {
    const mult = currentMultiplier(round);
    if (shouldCrash(round)) {
      await settleRound(round.id);
      round = null;
    } else {
      return NextResponse.json({
        success: true,
        data: {
          roundId: round.id,
          startedAt: round.startedAt,
          currentMultiplier: mult,
          status: "running",
        },
      });
    }
  }
  if (!round) {
    const serverSeed = randomBytes(32).toString("hex");
    const seedHash = hashSeed(serverSeed);
    const clientSeed = "";
    const nonce = 0;
    const crashPoint =
      CRASH_MIN_MULTIPLIER +
      hashToFloat(serverSeed, clientSeed, nonce) *
        (CRASH_MAX_MULTIPLIER - CRASH_MIN_MULTIPLIER);
    const [inserted] = await db
      .insert(serverSeeds)
      .values({ seedHash, seed: serverSeed, used: true })
      .returning({ id: serverSeeds.id });
    const [newRound] = await db
      .insert(crashRounds)
      .values({
        crashPoint,
        serverSeedId: inserted!.id,
        clientSeed,
        nonce,
        status: "running",
      })
      .returning({
        id: crashRounds.id,
        startedAt: crashRounds.startedAt,
        crashPoint: crashRounds.crashPoint,
        status: crashRounds.status,
      });
    return NextResponse.json({
      success: true,
      data: {
        roundId: newRound!.id,
        startedAt: newRound!.startedAt,
        currentMultiplier: 1,
        status: "running",
      },
    });
  }
  return NextResponse.json({
    success: true,
    data: null,
  });
}
