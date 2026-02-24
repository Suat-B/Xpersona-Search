import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { economyJobs } from "@/lib/db/schema";
import { economyError } from "@/lib/economy/http";
import { assertClientAction } from "@/lib/economy/permissions";
import { createJobFundingIntent } from "@/lib/economy/payments";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await getAuthUser(request);
  if ("error" in authResult) return NextResponse.json({ success: false, error: authResult.error }, { status: 401 });

  try {
    const { id } = await params;
    const [job] = await db.select().from(economyJobs).where(eq(economyJobs.id, id)).limit(1);
    if (!job) throw new Error("JOB_NOT_FOUND");

    assertClientAction(authResult.user.id, job.clientUserId);

    const paymentIntent = await createJobFundingIntent(id, authResult.user.id);

    return NextResponse.json({
      success: true,
      data: {
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
      },
    });
  } catch (err) {
    return economyError(err, "FUND_JOB_FAILED");
  }
}