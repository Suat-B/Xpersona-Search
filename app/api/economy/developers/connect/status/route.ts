import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { marketplaceDevelopers } from "@/lib/db/schema";
import { economyError } from "@/lib/economy/http";
import { getConnectStatus } from "@/lib/economy/payments";

export async function GET(request: NextRequest) {
  const authResult = await getAuthUser(request);
  if ("error" in authResult) {
    return NextResponse.json({ success: false, error: authResult.error }, { status: 401 });
  }

  try {
    const [developer] = await db
      .select()
      .from(marketplaceDevelopers)
      .where(eq(marketplaceDevelopers.userId, authResult.user.id))
      .limit(1);

    if (!developer?.stripeAccountId) {
      return NextResponse.json({
        success: true,
        data: {
          connected: false,
          chargesEnabled: false,
          payoutsEnabled: false,
          onboardingComplete: false,
        },
      });
    }

    const status = await getConnectStatus(developer.stripeAccountId);
    if (status.onboardingComplete !== !!developer.stripeOnboardingComplete) {
      await db
        .update(marketplaceDevelopers)
        .set({ stripeOnboardingComplete: status.onboardingComplete, updatedAt: new Date() })
        .where(eq(marketplaceDevelopers.id, developer.id));
    }

    return NextResponse.json({ success: true, data: { connected: true, accountId: developer.stripeAccountId, ...status } });
  } catch (err) {
    return economyError(err, "CONNECT_STATUS_FAILED");
  }
}