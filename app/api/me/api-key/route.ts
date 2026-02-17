import { NextResponse } from "next/server";
import { getAuthUser, hashApiKey } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";

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

    await db
      .update(users)
      .set({
        apiKeyHash,
        apiKeyPrefix,
        apiKeyCreatedAt: new Date(),
        apiKeyViewedAt: new Date(),
      })
      .where(eq(users.id, user.id));

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
