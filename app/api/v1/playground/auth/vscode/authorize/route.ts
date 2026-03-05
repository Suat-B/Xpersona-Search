import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { playgroundVscodeAuthCodes } from "@/lib/db/schema";
import { hashOpaqueToken } from "@/lib/playground/vscode-tokens";
import { randomBytes } from "crypto";

const EXPECTED_CLIENT_ID = "vscode";
const EXPECTED_REDIRECT_URI = "vscode://playgroundai.xpersona-playground/auth-callback";
const AUTH_CODE_TTL_MS = 5 * 60 * 1000;

function isSafePkceChallenge(value: string): boolean {
  // base64url-ish; keep permissive but bounded
  if (!value) return false;
  if (value.length < 32 || value.length > 256) return false;
  return /^[A-Za-z0-9\-_]+$/.test(value);
}

export async function GET(request: NextRequest): Promise<Response> {
  const params = request.nextUrl.searchParams;
  const clientId = params.get("client_id") ?? "";
  const redirectUri = params.get("redirect_uri") ?? "";
  const state = params.get("state") ?? "";
  const codeChallenge = params.get("code_challenge") ?? "";
  const method = params.get("code_challenge_method") ?? "S256";

  if (clientId !== EXPECTED_CLIENT_ID) {
    return NextResponse.json({ success: false, error: "invalid_client" }, { status: 400 });
  }
  if (redirectUri !== EXPECTED_REDIRECT_URI) {
    return NextResponse.json({ success: false, error: "invalid_redirect_uri" }, { status: 400 });
  }
  if (!state || state.length > 512) {
    return NextResponse.json({ success: false, error: "invalid_state" }, { status: 400 });
  }
  if (method !== "S256") {
    return NextResponse.json({ success: false, error: "unsupported_challenge_method" }, { status: 400 });
  }
  if (!isSafePkceChallenge(codeChallenge)) {
    return NextResponse.json({ success: false, error: "invalid_code_challenge" }, { status: 400 });
  }

  let session: any = null;
  try {
    session = await auth();
  } catch {
    session = null;
  }
  const userId = session?.user?.id ? String(session.user.id) : "";
  if (!userId) {
    const signInUrl = new URL("/auth/signin", request.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", request.nextUrl.toString());
    return NextResponse.redirect(signInUrl, { status: 302 });
  }

  const rawCode = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_MS);
  await db.insert(playgroundVscodeAuthCodes).values({
    codeHash: hashOpaqueToken(rawCode),
    userId,
    codeChallenge,
    codeChallengeMethod: "S256",
    redirectUri,
    expiresAt,
  });

  const cb = new URL(redirectUri);
  cb.searchParams.set("code", rawCode);
  cb.searchParams.set("state", state);
  return NextResponse.redirect(cb.toString(), { status: 302 });
}

