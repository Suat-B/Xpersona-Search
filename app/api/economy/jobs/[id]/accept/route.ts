import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { economyJobs, marketplaceDevelopers } from "@/lib/db/schema";
import { economyError } from "@/lib/economy/http";
import { assertJobTransition } from "@/lib/economy/state-machine";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await getAuthUser(request);
  if ("error" in authResult) return NextResponse.json({ success: false, error: authResult.error }, { status: 401 });

  try {
    const { id } = await params;
    const [developer] = await db
      .select()
      .from(marketplaceDevelopers)
      .where(eq(marketplaceDevelopers.userId, authResult.user.id))
      .limit(1);

    if (!developer) throw new Error("WORKER_DEVELOPER_REQUIRED");
    if (!developer.stripeAccountId || !developer.stripeOnboardingComplete) {
      throw new Error("WORKER_STRIPE_NOT_READY");
    }

    const [job] = await db.select().from(economyJobs).where(eq(economyJobs.id, id)).limit(1);
    if (!job) throw new Error("JOB_NOT_FOUND");

    assertJobTransition(job.status as any, "ACCEPTED");

    await db
      .update(economyJobs)
      .set({
        workerDeveloperId: developer.id,
        status: "ACCEPTED",
        acceptedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(economyJobs.id, id));

    return NextResponse.json({ success: true });
  } catch (err) {
    return economyError(err, "ACCEPT_JOB_FAILED");
  }
}