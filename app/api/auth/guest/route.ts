import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { createGuestToken, getGuestCookieName } from "@/lib/auth-utils";
import { SIGNUP_BONUS } from "@/lib/constants";
import { randomUUID } from "crypto";

function getRedirectBase(request: Request): string {
  try {
    return new URL(request.url).origin;
  } catch {
    return process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  }
}

function getSecret(): string | undefined {
  return process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
}

async function createGuestSession(request: Request): Promise<
  | { ok: true; userId: string; token: string; baseUrl: string }
  | { ok: false; status: number; message: string }
> {
  if (!getSecret()) {
    return { ok: false, status: 500, message: "NEXTAUTH_SECRET is not set. Add it to .env.local (see .env.example)." };
  }
  if (!process.env.DATABASE_URL) {
    return { ok: false, status: 503, message: "DATABASE_URL is not set. Add it to .env.local to use guest mode." };
  }
  try {
    const guestId = randomUUID();
    const email = `guest_${guestId}@xpersona.guest`;

    const [user] = await db
      .insert(users)
      .values({
        email,
        name: "Guest",
        accountType: "human",
        credits: SIGNUP_BONUS,
        lastFaucetAt: null,
      })
      .returning({ id: users.id });

    if (!user) {
      return { ok: false, status: 500, message: "Failed to create guest user" };
    }

    const token = createGuestToken(user.id);
    const baseUrl = getRedirectBase(request);

    return { ok: true, userId: user.id, token, baseUrl };
  } catch (err) {
    console.error("[guest] createGuestSession error:", err);
    return {
      ok: false,
      status: 500,
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * POST /api/auth/guest — create a guest user and sign them in.
 */
export async function POST(request: Request) {
  const result = await createGuestSession(request);
  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: "INTERNAL_ERROR", message: result.message },
      { status: result.status }
    );
  }

  const { token, baseUrl } = result;
  const res = NextResponse.json(
    { success: true, data: { redirectUrl: `${baseUrl}/dashboard` } },
    { status: 200 }
  );

  res.cookies.set(getGuestCookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });

  return res;
}

/**
 * GET /api/auth/guest — create guest and redirect to dashboard (for "Continue as guest" link).
 */
export async function GET(request: Request) {
  const result = await createGuestSession(request);
  if (!result.ok) {
    const baseUrl = getRedirectBase(request);
    return NextResponse.redirect(
      new URL(`/?error=guest_failed&message=${encodeURIComponent(result.message)}`, baseUrl),
      302
    );
  }

  const { token, baseUrl } = result;
  const res = NextResponse.redirect(`${baseUrl}/dashboard`, 302);

  res.cookies.set(getGuestCookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });

  return res;
}
