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

/** Create signed token for agent cookie (userId + expiry). */
export function createAgentToken(userId: string): string {
  const secret = process.env.NEXTAUTH_SECRET!;
  const exp = String(Date.now() + AGENT_COOKIE_MAX_AGE * 1000);
  const payload = userId + "." + exp;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return Buffer.from(payload + "." + sig).toString("base64url");
}

/** Verify agent token; return userId or null. */
export function verifyAgentToken(token: string): string | null {
  try {
    const secret = process.env.NEXTAUTH_SECRET!;
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
  const secret = process.env.NEXTAUTH_SECRET!;
  const exp = String(Date.now() + GUEST_COOKIE_MAX_AGE * 1000);
  const payload = userId + "." + exp;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return Buffer.from(payload + "." + sig).toString("base64url");
}

/** Verify guest token; return userId or null. */
export function verifyGuestToken(token: string): string | null {
  try {
    const secret = process.env.NEXTAUTH_SECRET!;
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
  apiKeyPrefix: string | null;
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
        apiKeyPrefix: users.apiKeyPrefix,
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
          apiKeyPrefix: users.apiKeyPrefix,
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
          apiKeyPrefix: users.apiKeyPrefix,
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
          apiKeyPrefix: users.apiKeyPrefix,
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

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}
