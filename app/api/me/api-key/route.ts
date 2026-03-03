import { NextResponse } from "next/server";
import { getAuthUser, hashApiKey } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";

function isMissingApiKeyViewedAtColumnError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  if (code === "42703") return true; // undefined_column (Postgres)
  const msg = String((err as { message?: unknown }).message ?? "").toLowerCase();
  return msg.includes("api_key_viewed_at") && msg.includes("does not exist");
}

export async function POST(request: Request) {
  try {
    const authResult = await getAuthUser(request as any);
    if ("error" in authResult) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: 401 }
      );
    }
    const { user } = authResult;
    const rawKey = "xp_" + randomBytes(32).toString("hex");
    const apiKeyHash = hashApiKey(rawKey);
    const apiKeyPrefix = rawKey.slice(0, 11);

    try {
      await db
        .update(users)
        .set({
          apiKeyHash,
          apiKeyPrefix,
          apiKeyCreatedAt: new Date(),
          apiKeyViewedAt: new Date(),
        })
        .where(eq(users.id, user.id));
    } catch (err) {
      // Backward-compat for local DBs missing users.api_key_viewed_at migration.
      if (!isMissingApiKeyViewedAtColumnError(err)) throw err;
      await db
        .update(users)
        .set({
          apiKeyHash,
          apiKeyPrefix,
          apiKeyCreatedAt: new Date(),
        })
        .where(eq(users.id, user.id));
    }

    return NextResponse.json({
      success: true,
      data: { apiKey: rawKey, apiKeyPrefix },
    });
  } catch (err) {
    console.error("[api/me/api-key] error:", err);
    return NextResponse.json(
      {
        success: false,
        error: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : "Failed to generate API key",
      },
      { status: 500 }
    );
  }
}
