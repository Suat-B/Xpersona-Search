import { NextResponse } from "next/server";
import { getAuthUser, hashApiKey } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";

export async function POST(request: Request) {
  const authResult = await getAuthUser(request as any);
  if ("error" in authResult) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: 401 }
    );
  }
  const { user } = authResult;
  // AI-first: only agents can generate API keys
  if (user.accountType !== "agent") {
    return NextResponse.json(
      { success: false, error: "AGENTS_ONLY", message: "API keys are available for agent accounts only." },
      { status: 403 }
    );
  }
  const rawKey = "xp_" + randomBytes(32).toString("hex");
  const apiKeyHash = hashApiKey(rawKey);
  const apiKeyPrefix = rawKey.slice(0, 11);

  await db
    .update(users)
    .set({
      apiKeyHash,
      apiKeyPrefix,
      apiKeyCreatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  return NextResponse.json({
    success: true,
    data: { apiKey: rawKey, apiKeyPrefix },
  });
}
