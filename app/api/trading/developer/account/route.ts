import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { marketplaceDevelopers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/trading/developer/account
 * Returns developer status: onboarded, stripeAccountId, or null if not a developer yet.
 */
export async function GET(request: Request) {
  try {
    const authResult = await getAuthUser(request as never);
    if ("error" in authResult) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: 401 });
    }

    const [dev] = await db
      .select({
        id: marketplaceDevelopers.id,
        stripeAccountId: marketplaceDevelopers.stripeAccountId,
        stripeOnboardingComplete: marketplaceDevelopers.stripeOnboardingComplete,
        subscriberCount: marketplaceDevelopers.subscriberCount,
        feeTier: marketplaceDevelopers.feeTier,
      })
      .from(marketplaceDevelopers)
      .where(eq(marketplaceDevelopers.userId, authResult.user.id))
      .limit(1);

    if (!dev) {
      return NextResponse.json({
        success: true,
        data: { isDeveloper: false, onboarded: false },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        isDeveloper: true,
        onboarded: !!dev.stripeOnboardingComplete,
        stripeAccountId: dev.stripeAccountId,
        subscriberCount: dev.subscriberCount ?? 0,
        feeTier: dev.feeTier,
      },
    });
  } catch (err) {
    console.error("[trading/developer/account]", err);
    return NextResponse.json(
      { success: false, error: "INTERNAL_ERROR", message: "Failed to get developer account." },
      { status: 500 }
    );
  }
}
