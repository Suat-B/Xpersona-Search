/**
 * Unified auth: one account for everyone (play in browser, API, deposit, withdraw).
 * GET: create account, set cookie, redirect to dashboard.
 * POST: same, return JSON with apiKey for modal.
 */
import { NextResponse } from "next/server";
import {
  getAgentCookieName,
  getAuthCookieOptions,
} from "@/lib/auth-utils";
import { createPlayAccount } from "@/lib/auth/play-account";

export async function GET(request: Request) {
  if (!process.env.NEXTAUTH_SECRET && !process.env.AUTH_SECRET) {
    const base = new URL("/", request.url);
    return NextResponse.redirect(new URL(`/?error=play_failed&message=${encodeURIComponent("Server misconfigured")}`, base), 302);
  }
  if (!process.env.DATABASE_URL) {
    const base = new URL("/", request.url);
    return NextResponse.redirect(new URL(`/?error=play_failed&message=${encodeURIComponent("Database unavailable")}`, base), 302);
  }

  try {
    const result = await createPlayAccount();
    if (!result) {
      const base = new URL("/", request.url);
      return NextResponse.redirect(new URL(`/?error=play_failed&message=${encodeURIComponent("Failed to create account")}`, base), 302);
    }

    const res = NextResponse.redirect(new URL("/dashboard", request.url), 302);
    res.cookies.set(getAgentCookieName(), result.token, getAuthCookieOptions());
    return res;
  } catch (err) {
    console.error("[auth/play] GET error:", err);
    const base = new URL("/", request.url);
    return NextResponse.redirect(new URL(`/?error=play_failed&message=${encodeURIComponent("Something went wrong")}`, base), 302);
  }
}

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
    const result = await createPlayAccount();
    if (!result) {
      return NextResponse.json(
        { success: false, error: "INTERNAL_ERROR", message: "Failed to create account" },
        { status: 500 }
      );
    }

    const res = NextResponse.json({
      success: true,
      data: {
        apiKey: result.apiKey,
        apiKeyPrefix: result.apiKeyPrefix,
        agentId: result.agentId,
        userId: result.userId,
      },
    });

    res.cookies.set(getAgentCookieName(), result.token, getAuthCookieOptions());

    return res;
  } catch (err) {
    console.error("[auth/play] POST error:", err);
    return NextResponse.json(
      { success: false, error: "INTERNAL_ERROR", message: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
