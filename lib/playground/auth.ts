import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { hashApiKey } from "@/lib/auth-utils";
import { isAdminEmail } from "@/lib/admin";
import { getLocalDevBypassAuth } from "@/lib/playground/auth-dev-bypass";
import { isVscodeAccessToken, verifyVscodeAccessToken } from "@/lib/playground/vscode-tokens";

export const UNLIMITED_PLAYGROUND_EMAILS = new Set([
  "suat.bastug@icloud.com",
  "kiraaimoto@gmail.com",
]);

export type PlaygroundAuth = {
  userId: string;
  email: string;
  apiKeyPrefix: string | null;
};

/**
 * Authenticate Playground requests.
 * Priority: VS Code access token (Authorization Bearer xp_vsat_*) -> legacy API key (X-API-Key or Authorization Bearer xp_*).
 */
export async function authenticatePlaygroundRequest(
  request: NextRequest
): Promise<PlaygroundAuth | null> {
  const rawAuth = request.headers.get("Authorization") ?? "";
  const bearer = rawAuth.toLowerCase().startsWith("bearer ") ? rawAuth.slice(7).trim() : null;

  if (bearer && isVscodeAccessToken(bearer)) {
    let verified: { userId: string; email: string } | null = null;
    try {
      verified = verifyVscodeAccessToken(bearer);
    } catch {
      verified = null;
    }
    if (!verified) return null;
    return {
      userId: verified.userId,
      email: verified.email,
      apiKeyPrefix: null,
    };
  }

  return authenticatePlaygroundApiKey(request);
}

export async function authenticatePlaygroundApiKey(
  request: NextRequest
): Promise<PlaygroundAuth | null> {
  const rawAuth = request.headers.get("Authorization");
  const headerKey = request.headers.get("X-API-Key");
  const bearerKey = rawAuth?.toLowerCase().startsWith("bearer ")
    ? rawAuth.slice(7).trim()
    : null;
  const apiKey = headerKey || bearerKey;
  if (!apiKey) return null;

  const localDevBypass = getLocalDevBypassAuth(apiKey);
  if (localDevBypass) return localDevBypass;

  const apiKeyHash = hashApiKey(apiKey);
  let found:
    | Array<{
        id: string;
        email: string;
        apiKeyPrefix: string | null;
      }>
    | null = null;

  try {
    found = await db
      .select({
        id: users.id,
        email: users.email,
        apiKeyPrefix: users.apiKeyPrefix,
      })
      .from(users)
      .where(eq(users.apiKeyHash, apiKeyHash))
      .limit(1);
  } catch {
    return null;
  }

  if (!found.length) return null;
  return {
    userId: found[0].id,
    email: found[0].email,
    apiKeyPrefix: found[0].apiKeyPrefix,
  };
}

export function hasUnlimitedPlaygroundAccess(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return isAdminEmail(normalized) || UNLIMITED_PLAYGROUND_EMAILS.has(normalized);
}

