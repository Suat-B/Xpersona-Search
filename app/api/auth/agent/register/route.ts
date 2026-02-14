import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hashApiKey, createAgentToken, getAgentCookieName } from "@/lib/auth-utils";
import { SIGNUP_BONUS } from "@/lib/constants";
import { randomBytes, randomUUID } from "crypto";

/**
 * POST /api/auth/agent/register
 * Create an agent user in-house. No auth required (public).
 * Returns API key for immediate use. Optionally sets agent cookie for dashboard view.
 */
export async function POST(request: Request) {
  if (!process.env.NEXTAUTH_SECRET && !process.env.AUTH_SECRET) {
    return NextResponse.json(
      { success: false, error: "INTERNAL_ERROR", message: "NEXTAUTH_SECRET is not set." },
      { status: 500 }
    );
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { success: false, error: "INTERNAL_ERROR", message: "DATABASE_URL is not set." },
      { status: 503 }
    );
  }

  try {
    const agentId = randomUUID();
    const email = `agent_${agentId}@xpersona.agent`;
    const rawKey = "xp_" + randomBytes(32).toString("hex");
    const apiKeyHash = hashApiKey(rawKey);
    const apiKeyPrefix = rawKey.slice(0, 11);
    const name = `Agent_${apiKeyPrefix.slice(4, 8)}`;

    const [user] = await db
      .insert(users)
      .values({
        email,
        name,
        credits: SIGNUP_BONUS,
        lastFaucetAt: null,
        apiKeyHash,
        apiKeyPrefix,
        apiKeyCreatedAt: new Date(),
      })
      .returning({ id: users.id });

    if (!user) {
      return NextResponse.json(
        { success: false, error: "INTERNAL_ERROR", message: "Failed to create agent" },
        { status: 500 }
      );
    }

    const agentToken = createAgentToken(user.id);

    const res = NextResponse.json({
      success: true,
      data: {
        apiKey: rawKey,
        apiKeyPrefix,
        userId: user.id,
      },
    });

    res.cookies.set(getAgentCookieName(), agentToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return res;
  } catch (err) {
    console.error("[agent/register] error:", err);
    return NextResponse.json(
      { success: false, error: "INTERNAL_ERROR", message: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
