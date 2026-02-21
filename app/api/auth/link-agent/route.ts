import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { mergeAgentIntoUser } from "@/lib/merge-guest-account";
import {
  verifyAgentToken,
  getAgentCookieName,
  getClearCookieOptions,
} from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * POST /api/auth/link-agent
 * Merge agent account data (including API key) into the current authenticated user
 * (e.g. after Google sign-in).
 * Requires: NextAuth session (Google user) + agent cookie.
 * Clears agent cookie on success.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: "UNAUTHORIZED", message: "Sign in first" },
      { status: 401 }
    );
  }

  const cookieStore = await cookies();
  const agentCookie = cookieStore.get(getAgentCookieName())?.value;
  if (!agentCookie) {
    return NextResponse.json(
      {
        success: false,
        error: "NO_AGENT",
        message: "No agent session to merge",
      },
      { status: 400 }
    );
  }

  const agentUserId = verifyAgentToken(agentCookie);
  if (!agentUserId) {
    return NextResponse.json(
      {
        success: false,
        error: "INVALID_AGENT",
        message: "Invalid or expired agent session",
      },
      { status: 400 }
    );
  }

  const [agentUser] = await db
    .select({
      id: users.id,
      accountType: users.accountType,
      apiKeyHash: users.apiKeyHash,
    })
    .from(users)
    .where(eq(users.id, agentUserId))
    .limit(1);

  if (!agentUser) {
    return NextResponse.json(
      {
        success: false,
        error: "AGENT_NOT_FOUND",
        message: "Agent account not found",
      },
      { status: 404 }
    );
  }

  const isAgentAccount =
    agentUser.accountType === "agent" || agentUser.apiKeyHash !== null;

  if (!isAgentAccount) {
    return NextResponse.json(
      {
        success: false,
        error: "NOT_AGENT_ACCOUNT",
        message: "Use link-guest for guest accounts",
      },
      { status: 400 }
    );
  }

  const result = await mergeAgentIntoUser(agentUserId, session.user.id);
  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: "MERGE_FAILED", message: result.error },
      { status: 500 }
    );
  }

  const res = NextResponse.json({
    success: true,
    data: { message: "Agent account linked successfully" },
  });

  res.cookies.set(getAgentCookieName(), "", getClearCookieOptions());

  return res;
}
