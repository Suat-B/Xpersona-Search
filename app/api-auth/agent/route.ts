import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createHash } from "crypto";
import {
  createAgentToken,
  getAgentCookieName,
  getAuthCookieOptions,
} from "@/lib/auth-utils";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const apiKey = url.searchParams.get("api_key") ?? url.searchParams.get("apiKey");
  if (!apiKey || apiKey.length < 32) {
    return NextResponse.redirect(new URL("/?error=invalid_key", request.url));
  }
  const hash = createHash("sha256").update(apiKey).digest("hex");
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.apiKeyHash, hash))
    .limit(1);
  if (!user) {
    return NextResponse.redirect(new URL("/?error=invalid_key", request.url));
  }
  const token = createAgentToken(user.id);
  const baseUrl = new URL("/dashboard", request.url);
  const res = NextResponse.redirect(baseUrl, 302);
  res.cookies.set(getAgentCookieName(), token, getAuthCookieOptions());
  return res;
}

export async function POST(request: Request) {
  let apiKey: string | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    apiKey = (body.api_key ?? body.apiKey) as string | undefined ?? null;
  } catch {
    // no body
  }
  if (!apiKey || apiKey.length < 32) {
    return NextResponse.redirect(new URL("/?error=invalid_key", request.url));
  }
  const hash = createHash("sha256").update(apiKey).digest("hex");
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.apiKeyHash, hash))
    .limit(1);
  if (!user) {
    return NextResponse.redirect(new URL("/?error=invalid_key", request.url));
  }
  const token = createAgentToken(user.id);
  const baseUrl = new URL("/dashboard", request.url);
  const res = NextResponse.redirect(baseUrl, 302);
  res.cookies.set(getAgentCookieName(), token, getAuthCookieOptions());
  return res;
}
