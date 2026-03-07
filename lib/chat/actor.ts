import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAgentCookieName, getAuthCookieOptions } from "@/lib/auth-utils";
import { createPlayAccount } from "@/lib/auth/play-account";
import { db } from "@/lib/db";
import { playgroundSubscriptions } from "@/lib/db/playground-schema";
import { signVscodeAccessToken } from "@/lib/playground/vscode-tokens";

const CHAT_TRIAL_DAYS = 2;
const CHAT_PROXY_TOKEN_TTL_MS = 5 * 60 * 1000;

export type ChatActor = {
  userId: string;
  email: string;
  isAnonymous: boolean;
  accountType: string;
  source: "existing" | "auto_created";
  cookieToken?: string;
};

export type ChatTrialSnapshot = {
  planTier: "trial" | "starter" | "builder" | "studio";
  status: "active" | "trial" | "past_due" | "cancelled";
  trialEndsAt: string | null;
};

export async function resolveExistingChatActor(request: NextRequest): Promise<ChatActor | null> {
  const authResult = await getAuthUser(request);
  if ("error" in authResult) return null;
  const { user } = authResult;
  return {
    userId: user.id,
    email: user.email,
    isAnonymous: user.accountType === "agent" && user.email.startsWith("play_"),
    accountType: user.accountType,
    source: "existing",
  };
}

export async function createAnonymousChatActor(): Promise<ChatActor> {
  const result = await createPlayAccount();
  if (!result) {
    throw new Error("Failed to create anonymous chat actor");
  }
  return {
    userId: result.userId,
    email: result.email,
    isAnonymous: true,
    accountType: "agent",
    source: "auto_created",
    cookieToken: result.token,
  };
}

export function applyChatActorCookie(response: NextResponse, actor: ChatActor): void {
  if (!actor.cookieToken) return;
  response.cookies.set(getAgentCookieName(), actor.cookieToken, getAuthCookieOptions());
}

export async function ensureChatTrialEntitlement(userId: string): Promise<ChatTrialSnapshot> {
  const [existing] = await db
    .select({
      planTier: playgroundSubscriptions.planTier,
      status: playgroundSubscriptions.status,
      trialEndsAt: playgroundSubscriptions.trialEndsAt,
    })
    .from(playgroundSubscriptions)
    .where(eq(playgroundSubscriptions.userId, userId))
    .limit(1);

  if (!existing) {
    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + CHAT_TRIAL_DAYS * 24 * 60 * 60 * 1000);
    await db
      .insert(playgroundSubscriptions)
      .values({
        userId,
        planTier: "trial",
        status: "trial",
        trialStartedAt: now,
        trialEndsAt,
        currentPeriodStart: now,
        currentPeriodEnd: trialEndsAt,
        cancelAtPeriodEnd: false,
      })
      .onConflictDoNothing({ target: playgroundSubscriptions.userId });
  }

  const [row] = await db
    .select({
      planTier: playgroundSubscriptions.planTier,
      status: playgroundSubscriptions.status,
      trialEndsAt: playgroundSubscriptions.trialEndsAt,
    })
    .from(playgroundSubscriptions)
    .where(eq(playgroundSubscriptions.userId, userId))
    .limit(1);

  if (!row) {
    throw new Error("Unable to provision chat trial entitlement");
  }

  const planTier = (row.planTier ?? "trial") as ChatTrialSnapshot["planTier"];
  const status = (row.status ?? "trial") as ChatTrialSnapshot["status"];

  return {
    planTier,
    status,
    trialEndsAt: row.trialEndsAt ? row.trialEndsAt.toISOString() : null,
  };
}

export function createChatProxyBearer(actor: Pick<ChatActor, "userId" | "email">): string {
  return signVscodeAccessToken({
    userId: actor.userId,
    email: actor.email,
    ttlMs: CHAT_PROXY_TOKEN_TTL_MS,
  });
}
