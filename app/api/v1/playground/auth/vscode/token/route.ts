import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { playgroundVscodeAuthCodes, playgroundVscodeRefreshTokens, users } from "@/lib/db/schema";
import { hashOpaqueToken, signVscodeAccessToken, isVscodeRefreshToken } from "@/lib/playground/vscode-tokens";

const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function sha256Base64url(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("base64url");
}

function json(status: number, body: unknown): Response {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function getUserEmail(userId: string): Promise<string | null> {
  const found = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return found.length ? String(found[0].email) : null;
}

export async function POST(request: NextRequest): Promise<Response> {
  const body = (await request.json().catch(() => null)) as any;
  const grantType = typeof body?.grant_type === "string" ? body.grant_type : "";

  if (grantType === "authorization_code") {
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    const verifier = typeof body?.code_verifier === "string" ? body.code_verifier.trim() : "";
    if (!code || !verifier) return json(400, { error: "invalid_request" });

    const now = new Date();
    const codeHash = hashOpaqueToken(code);
    const rows = await db
      .select({
        id: playgroundVscodeAuthCodes.id,
        userId: playgroundVscodeAuthCodes.userId,
        codeChallenge: playgroundVscodeAuthCodes.codeChallenge,
        codeChallengeMethod: playgroundVscodeAuthCodes.codeChallengeMethod,
        expiresAt: playgroundVscodeAuthCodes.expiresAt,
      })
      .from(playgroundVscodeAuthCodes)
      .where(eq(playgroundVscodeAuthCodes.codeHash, codeHash))
      .limit(1);

    const row = rows[0];
    if (!row) return json(400, { error: "invalid_grant" });
    if (row.expiresAt && row.expiresAt <= now) {
      await db.delete(playgroundVscodeAuthCodes).where(eq(playgroundVscodeAuthCodes.id, row.id));
      return json(400, { error: "invalid_grant" });
    }
    if (String(row.codeChallengeMethod || "S256") !== "S256") return json(400, { error: "invalid_grant" });

    const computed = sha256Base64url(verifier);
    if (!row.codeChallenge || computed !== row.codeChallenge) return json(400, { error: "invalid_grant" });

    // One-time use: delete code record before issuing tokens.
    await db.delete(playgroundVscodeAuthCodes).where(eq(playgroundVscodeAuthCodes.id, row.id));

    const email = await getUserEmail(String(row.userId));
    if (!email) return json(400, { error: "invalid_grant" });

    const refreshToken = "xp_vrt_" + randomBytes(32).toString("hex");
    const refreshHash = hashOpaqueToken(refreshToken);
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    await db.insert(playgroundVscodeRefreshTokens).values({
      tokenHash: refreshHash,
      tokenPrefix: refreshToken.slice(0, 16),
      userId: String(row.userId),
      expiresAt: refreshExpiresAt,
      lastUsedAt: new Date(),
    });

    const accessToken = signVscodeAccessToken({ userId: String(row.userId), email, ttlMs: ACCESS_TOKEN_TTL_MS });
    return json(200, {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
      refresh_token: refreshToken,
    });
  }

  if (grantType === "refresh_token") {
    const refreshToken = typeof body?.refresh_token === "string" ? body.refresh_token.trim() : "";
    if (!refreshToken) return json(400, { error: "invalid_request" });
    if (!isVscodeRefreshToken(refreshToken)) return json(400, { error: "invalid_grant" });

    const now = new Date();
    const tokenHash = hashOpaqueToken(refreshToken);
    const found = await db
      .select({
        id: playgroundVscodeRefreshTokens.id,
        userId: playgroundVscodeRefreshTokens.userId,
        expiresAt: playgroundVscodeRefreshTokens.expiresAt,
      })
      .from(playgroundVscodeRefreshTokens)
      .where(
        and(
          eq(playgroundVscodeRefreshTokens.tokenHash, tokenHash),
          isNull(playgroundVscodeRefreshTokens.revokedAt),
          gt(playgroundVscodeRefreshTokens.expiresAt, now)
        )
      )
      .limit(1);

    const row = found[0];
    if (!row) return json(400, { error: "invalid_grant" });

    await db
      .update(playgroundVscodeRefreshTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(playgroundVscodeRefreshTokens.id, row.id));

    const email = await getUserEmail(String(row.userId));
    if (!email) return json(400, { error: "invalid_grant" });

    const accessToken = signVscodeAccessToken({ userId: String(row.userId), email, ttlMs: ACCESS_TOKEN_TTL_MS });
    return json(200, {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    });
  }

  return json(400, { error: "unsupported_grant_type" });
}

