import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getAuthUser, createGuestToken, getGuestCookieName } from "@/lib/auth-utils";
import { grantFaucet } from "@/lib/faucet";
import { FAUCET_AMOUNT, SIGNUP_BONUS } from "@/lib/constants";
import { randomUUID } from "crypto";

export async function POST(request: Request) {
  let authResult = await getAuthUser(request as any);

  // No-auth: create guest, grant faucet, set cookie
  if ("error" in authResult) {
    if (!process.env.NEXTAUTH_SECRET && !process.env.AUTH_SECRET) {
      return NextResponse.json(
        { success: false, error: "INTERNAL_ERROR", message: "Server not configured" },
        { status: 500 }
      );
    }
    if (!process.env.DATABASE_URL) {
      return NextResponse.json(
        { success: false, error: "INTERNAL_ERROR", message: "Database not configured" },
        { status: 503 }
      );
    }
    try {
      const humanId = randomUUID();
      const email = `human_${humanId}@xpersona.human`;
      const [user] = await db
        .insert(users)
        .values({
          email,
          name: "Human",
          accountType: "human",
          credits: SIGNUP_BONUS,
          lastFaucetAt: null,
        })
        .returning({ id: users.id });
      if (!user) {
        return NextResponse.json(
          { success: false, error: "INTERNAL_ERROR", message: "Failed to create user" },
          { status: 500 }
        );
      }
      const result = await grantFaucet(user.id, null);
      if (!result.granted) {
        return NextResponse.json(
          {
            success: false,
            error: "FAUCET_COOLDOWN",
            message: "Next faucet at " + result.nextFaucetAt.toISOString(),
            nextFaucetAt: result.nextFaucetAt.toISOString(),
          },
          { status: 429 }
        );
      }
      const token = createGuestToken(user.id);
      const res = NextResponse.json({
        success: true,
        data: {
          balance: result.balance,
          granted: FAUCET_AMOUNT,
          nextFaucetAt: result.nextFaucetAt.toISOString(),
        },
      });
      res.cookies.set(getGuestCookieName(), token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
        path: "/",
      });
      return res;
    } catch (e) {
      console.error("[faucet] no-auth create error:", e);
      return NextResponse.json(
        { success: false, error: "INTERNAL_ERROR", message: (e as Error).message },
        { status: 500 }
      );
    }
  }

  try {
    const result = await grantFaucet(authResult.user.id, authResult.user.agentId);
    if (!result.granted) {
      return NextResponse.json(
        {
          success: false,
          error: "FAUCET_COOLDOWN",
          message: "Next faucet at " + result.nextFaucetAt.toISOString(),
          nextFaucetAt: result.nextFaucetAt.toISOString(),
        },
        { status: 429 }
      );
    }
    return NextResponse.json({
      success: true,
      data: {
        balance: result.balance,
        granted: FAUCET_AMOUNT,
        nextFaucetAt: result.nextFaucetAt.toISOString(),
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { success: false, error: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
