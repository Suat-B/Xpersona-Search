import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";

const AGENT_COOKIE_NAME = "xp_agent_session";
const AGENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

const GUEST_COOKIE_NAME = "xp_guest_session";
const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function getSecret(): string {
  const s =
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET ||
    (process.env.NODE_ENV === "development"
      ? "xpersona-dev-secret-min-32-chars-do-not-use-in-production"
      : "");
  if (!s) throw new Error("NEXTAUTH_SECRET or AUTH_SECRET must be set");
  return s;
}

/** Create signed token for agent cookie (userId + expiry). */
export function createAgentToken(userId: string): string {
  const secret = getSecret();
  const exp = String(Date.now() + AGENT_COOKIE_MAX_AGE * 1000);
  const payload = userId + "." + exp;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return Buffer.from(payload + "." + sig).toString("base64url");
}

/** Verify agent token; return userId or null. */
export function verifyAgentToken(token: string): string | null {
  try {
    const secret = getSecret();
    const raw = Buffer.from(token, "base64url").toString("utf8");
    const [userId, exp, sig] = raw.split(".");
    if (!userId || !exp || !sig) return null;
    if (Date.now() > parseInt(exp, 10)) return null;
    const payload = userId + "." + exp;
    const expected = createHmac("sha256", secret).update(payload).digest("hex");
    if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
    return userId;
  } catch {
    return null;
  }
}

export function getAgentCookieName(): string {
  return AGENT_COOKIE_NAME;
}

/** Create signed token for guest cookie (userId + expiry). */
export function createGuestToken(userId: string): string {
  const secret = getSecret();
  const exp = String(Date.now() + GUEST_COOKIE_MAX_AGE * 1000);
  const payload = userId + "." + exp;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return Buffer.from(payload + "." + sig).toString("base64url");
}

/** Verify guest token; return userId or null. */
export function verifyGuestToken(token: string): string | null {
  try {
    const secret = getSecret();
    const raw = Buffer.from(token, "base64url").toString("utf8");
    const [userId, exp, sig] = raw.split(".");
    if (!userId || !exp || !sig) return null;
    if (Date.now() > parseInt(exp, 10)) return null;
    const payload = userId + "." + exp;
    const expected = createHmac("sha256", secret).update(payload).digest("hex");
    if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
    return userId;
  } catch {
    return null;
  }
}

export function getGuestCookieName(): string {
  return GUEST_COOKIE_NAME;
}

/** Recovery link expiry: 7 days. */
const RECOVERY_LINK_DAYS = 7;

/** Create a signed recovery token (userId + expiry). Use for "save this link" flow. */
export function createRecoveryToken(userId: string): string {
  const secret = getSecret();
  const exp = String(Date.now() + RECOVERY_LINK_DAYS * 24 * 60 * 60 * 1000);
  const payload = userId + "." + exp;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return Buffer.from(payload + "." + sig).toString("base64url");
}

/** Verify recovery token; return userId or null. */
export function verifyRecoveryToken(token: string): string | null {
  try {
    const secret = getSecret();
    const raw = Buffer.from(token, "base64url").toString("utf8");
    const [userId, exp, sig] = raw.split(".");
    if (!userId || !exp || !sig) return null;
    if (Date.now() > parseInt(exp, 10)) return null;
    const payload = userId + "." + exp;
    const expected = createHmac("sha256", secret).update(payload).digest("hex");
    if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
    return userId;
  } catch {
    return null;
  }
}

/** For server components (e.g. dashboard layout): read agent or guest cookie and return userId or null. */
export function getAuthUserFromCookie(
  cookieStore: { get: (name: string) => { value: string } | undefined }
): string | null {
  const agentToken = cookieStore.get(AGENT_COOKIE_NAME)?.value;
  if (agentToken) {
    const userId = verifyAgentToken(agentToken);
    if (userId) return userId;
  }
  const guestToken = cookieStore.get(GUEST_COOKIE_NAME)?.value;
  if (guestToken) {
    const userId = verifyGuestToken(guestToken);
    if (userId) return userId;
  }
  return null;
}

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  credits: number;
  /** Credits from faucet; cannot be withdrawn. withdrawable = credits - faucetCredits */
  faucetCredits: number;
  apiKeyPrefix: string | null;
  apiKeyViewedAt: Date | null;
  /** Stable audit ID for agents (aid_xxx). Null for human/google. */
  agentId: string | null;
  accountType: string;
  createdAt: Date | null;
  lastFaucetAt: Date | null;
};

/**
 * Resolve authenticated user from session (cookie) or Bearer API key.
 * Use in API routes that require auth.
 */
export async function getAuthUser(
  request: NextRequest
): Promise<{ user: AuthUser } | { error: string }> {
  const session = await auth();
  if (session?.user?.id) {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        image: users.image,
        credits: users.credits,
        faucetCredits: users.faucetCredits,
        apiKeyPrefix: users.apiKeyPrefix,
        apiKeyViewedAt: users.apiKeyViewedAt,
        agentId: users.agentId,
        accountType: users.accountType,
        createdAt: users.createdAt,
        lastFaucetAt: users.lastFaucetAt,
      })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);
    if (user) return { user: user as AuthUser };
  }

  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const rawKey = authHeader.slice(7).trim();
    if (rawKey.length >= 32) {
      const hash = createHash("sha256").update(rawKey).digest("hex");
      const [user] = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          image: users.image,
          credits: users.credits,
          faucetCredits: users.faucetCredits,
          apiKeyPrefix: users.apiKeyPrefix,
          apiKeyViewedAt: users.apiKeyViewedAt,
          agentId: users.agentId,
          accountType: users.accountType,
          createdAt: users.createdAt,
          lastFaucetAt: users.lastFaucetAt,
        })
        .from(users)
        .where(eq(users.apiKeyHash, hash))
        .limit(1);
      if (user) return { user: user as AuthUser };
    }
  }

  const agentCookie = request.cookies.get(AGENT_COOKIE_NAME)?.value;
  if (agentCookie) {
    const userId = verifyAgentToken(agentCookie);
    if (userId) {
      const [user] = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          image: users.image,
          credits: users.credits,
          faucetCredits: users.faucetCredits,
          apiKeyPrefix: users.apiKeyPrefix,
          apiKeyViewedAt: users.apiKeyViewedAt,
          agentId: users.agentId,
          accountType: users.accountType,
          createdAt: users.createdAt,
          lastFaucetAt: users.lastFaucetAt,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (user) return { user: user as AuthUser };
    }
  }

  const guestCookie = request.cookies.get(GUEST_COOKIE_NAME)?.value;
  if (guestCookie) {
    const userId = verifyGuestToken(guestCookie);
    if (userId) {
      const [user] = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          image: users.image,
          credits: users.credits,
          faucetCredits: users.faucetCredits,
          apiKeyPrefix: users.apiKeyPrefix,
          apiKeyViewedAt: users.apiKeyViewedAt,
          agentId: users.agentId,
          accountType: users.accountType,
          createdAt: users.createdAt,
          lastFaucetAt: users.lastFaucetAt,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (user) return { user: user as AuthUser };
    }
  }

  return { error: "UNAUTHORIZED" };
}

/** Base URL for recovery links and LLM guidance. */
export function getAppBaseUrl(): string {
  return process.env.NEXTAUTH_URL ?? "https://xpersona.co";
}

/** Standard 401 body with recovery guidance for AI agents and users. */
export function unauthorizedJsonBody() {
  const url = getAppBaseUrl();
  return {
    success: false,
    error: "UNAUTHORIZED",
    recovery_url: url,
    message: "Session expired or invalid. Go to xpersona to sign in again.",
    llm_guidance: `Tell your player: "Your session expired. Go to ${url} to sign back in. Bookmark it so you never lose it. If you had a recovery link, open it to restore your account."`,
  };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}
