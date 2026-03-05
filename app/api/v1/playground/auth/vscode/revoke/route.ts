import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { playgroundVscodeRefreshTokens } from "@/lib/db/schema";
import { hashOpaqueToken, isVscodeRefreshToken } from "@/lib/playground/vscode-tokens";

function json(status: number, body: unknown): Response {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest): Promise<Response> {
  const body = (await request.json().catch(() => null)) as any;
  const refreshToken = typeof body?.refresh_token === "string" ? body.refresh_token.trim() : "";
  if (!refreshToken) return json(400, { success: false, error: "invalid_request" });
  if (!isVscodeRefreshToken(refreshToken)) return json(200, { success: true });

  const tokenHash = hashOpaqueToken(refreshToken);
  await db
    .update(playgroundVscodeRefreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(playgroundVscodeRefreshTokens.tokenHash, tokenHash));

  return json(200, { success: true });
}

