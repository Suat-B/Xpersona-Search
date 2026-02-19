import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import {
  userSignalPreferences,
  signalDeliveryLogs,
  marketplaceStrategies,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sendToDiscord } from "@/lib/signals/discord";
import type { SignalPayload } from "@/lib/signals/discord";

/**
 * POST /api/signals/deliver
 * Deliver a signal to the current user's configured channels (Discord, webhook, email).
 * Body: { strategyId: string, payload: SignalPayload }
 * Auth required.
 */
export async function POST(request: NextRequest) {
  const authResult = await getAuthUser(request);
  if ("error" in authResult) {
    return NextResponse.json({ success: false, error: authResult.error }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const strategyId = (body.strategyId ?? "").toString().trim();
    const payload = (body.payload ?? {}) as SignalPayload;

    if (!strategyId) {
      return NextResponse.json(
        { success: false, error: "VALIDATION_ERROR", message: "strategyId required" },
        { status: 400 }
      );
    }

    const [strategy] = await db
      .select({ id: marketplaceStrategies.id })
      .from(marketplaceStrategies)
      .where(eq(marketplaceStrategies.id, strategyId))
      .limit(1);

    if (!strategy) {
      return NextResponse.json(
        { success: false, error: "NOT_FOUND", message: "Strategy not found" },
        { status: 404 }
      );
    }

    const [prefs] = await db
      .select()
      .from(userSignalPreferences)
      .where(eq(userSignalPreferences.userId, authResult.user.id))
      .limit(1);

    if (!prefs) {
      return NextResponse.json({
        success: true,
        data: { delivered: [], message: "No signal preferences configured" },
      });
    }

    const delivered: { channel: string; ok: boolean; error?: string }[] = [];

    if (prefs.discordWebhookUrl) {
      const result = await sendToDiscord(prefs.discordWebhookUrl, payload);
      delivered.push({ channel: "discord", ok: result.ok, error: result.error });
      if (result.ok) {
        await db.insert(signalDeliveryLogs).values({
          strategyId,
          userId: authResult.user.id,
          channel: "discord",
          payload: payload as unknown as Record<string, unknown>,
        });
      }
    }

    if (prefs.webhookUrl) {
      try {
        const res = await fetch(prefs.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            strategyId,
            userId: authResult.user.id,
            ...payload,
            timestamp: new Date().toISOString(),
          }),
        });
        delivered.push({
          channel: "webhook",
          ok: res.ok,
          error: res.ok ? undefined : `HTTP ${res.status}`,
        });
        if (res.ok) {
          await db.insert(signalDeliveryLogs).values({
            strategyId,
            userId: authResult.user.id,
            channel: "webhook",
            payload: payload as unknown as Record<string, unknown>,
          });
        }
      } catch (err) {
        delivered.push({
          channel: "webhook",
          ok: false,
          error: err instanceof Error ? err.message : "Fetch failed",
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: { delivered },
    });
  } catch (err) {
    console.error("[signals/deliver]", err);
    return NextResponse.json(
      { success: false, error: "INTERNAL_ERROR", message: "Delivery failed" },
      { status: 500 }
    );
  }
}
