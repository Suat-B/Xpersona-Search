import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { userSignalPreferences } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/me/signal-preferences
 * Return current user's signal delivery preferences.
 */
export async function GET(request: NextRequest) {
  const authResult = await getAuthUser(request);
  if ("error" in authResult) {
    return NextResponse.json({ success: false, error: authResult.error }, { status: 401 });
  }

  try {
    const [prefs] = await db
      .select()
      .from(userSignalPreferences)
      .where(eq(userSignalPreferences.userId, authResult.user.id))
      .limit(1);

    return NextResponse.json({
      success: true,
      data: prefs
        ? {
            discordWebhookUrl: prefs.discordWebhookUrl ?? null,
            webhookUrl: prefs.webhookUrl ?? null,
            email: prefs.email ?? null,
          }
        : { discordWebhookUrl: null, webhookUrl: null, email: null },
    });
  } catch (err) {
    console.error("[signal-preferences GET]", err);
    return NextResponse.json(
      { success: false, error: "INTERNAL_ERROR", message: "Failed to fetch" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/me/signal-preferences
 * Update signal delivery preferences.
 * Body: { discordWebhookUrl?: string, webhookUrl?: string, email?: string }
 */
export async function PATCH(request: NextRequest) {
  const authResult = await getAuthUser(request);
  if ("error" in authResult) {
    return NextResponse.json({ success: false, error: authResult.error }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const discordWebhookUrl = body.discordWebhookUrl === "" ? null : (body.discordWebhookUrl ?? undefined);
    const webhookUrl = body.webhookUrl === "" ? null : (body.webhookUrl ?? undefined);
    const email = body.email === "" ? null : (body.email ?? undefined);

    const [existing] = await db
      .select()
      .from(userSignalPreferences)
      .where(eq(userSignalPreferences.userId, authResult.user.id))
      .limit(1);

    const values: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (discordWebhookUrl !== undefined) values.discordWebhookUrl = discordWebhookUrl;
    if (webhookUrl !== undefined) values.webhookUrl = webhookUrl;
    if (email !== undefined) values.email = email;

    if (existing) {
      await db
        .update(userSignalPreferences)
        .set(values as Record<string, string | null | Date>)
        .where(eq(userSignalPreferences.userId, authResult.user.id));
    } else {
      await db.insert(userSignalPreferences).values({
        userId: authResult.user.id,
        discordWebhookUrl: (values.discordWebhookUrl as string | null) ?? null,
        webhookUrl: (values.webhookUrl as string | null) ?? null,
        email: (values.email as string | null) ?? null,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[signal-preferences PATCH]", err);
    return NextResponse.json(
      { success: false, error: "INTERNAL_ERROR", message: "Failed to update" },
      { status: 500 }
    );
  }
}
