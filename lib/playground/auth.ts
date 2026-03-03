import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { hashApiKey } from "@/lib/auth-utils";
import { isAdminEmail } from "@/lib/admin";

export const UNLIMITED_PLAYGROUND_EMAILS = new Set([
  "suat.bastug@icloud.com",
  "kiraaimoto@gmail.com",
]);

export type PlaygroundAuth = {
  userId: string;
  email: string;
  apiKeyPrefix: string | null;
};

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

  const apiKeyHash = hashApiKey(apiKey);
  const found = await db
    .select({
      id: users.id,
      email: users.email,
      apiKeyPrefix: users.apiKeyPrefix,
    })
    .from(users)
    .where(eq(users.apiKeyHash, apiKeyHash))
    .limit(1);

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

