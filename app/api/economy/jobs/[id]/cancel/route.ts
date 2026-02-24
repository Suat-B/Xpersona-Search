import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { economyEscrows, economyJobs, marketplaceDevelopers } from "@/lib/db/schema";
import { economyError } from "@/lib/economy/http";
import { assertClientAction, canCancelFromStatus } from "@/lib/economy/permissions";
import { refundEscrow } from "@/lib/economy/payments";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await getAuthUser(request);
  if ("error" in authResult) return NextResponse.json({ success: false, error: authResult.error }, { status: 401 });

  try {
    const { id } = await params;
    const [developer] = await db
      .select({ id: marketplaceDevelopers.id })
      .from(marketplaceDevelopers)
      .where(eq(marketplaceDevelopers.userId, authResult.user.id))
      .limit(1);

    const [job] = await db.select().from(economyJobs).where(eq(economyJobs.id, id)).limit(1);
    if (!job) throw new Error("JOB_NOT_FOUND");

    const isClient = job.clientUserId === authResult.user.id;
    const isWorker = !!developer && job.workerDeveloperId === developer.id;
    if (!isClient && !isWorker) throw new Error("FORBIDDEN_CANCEL");
    if (!canCancelFromStatus(job.status as any)) throw new Error("INVALID_CANCEL_STATE");

    const [escrow] = await db.select().from(economyEscrows).where(eq(economyEscrows.jobId, id)).limit(1);
    if (escrow?.status === "FUNDED") {
      await refundEscrow(id, "job_cancelled");
    }

    await db
      .update(economyJobs)
      .set({ status: "CANCELLED", cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(economyJobs.id, id));

    return NextResponse.json({ success: true });
  } catch (err) {
    return economyError(err, "CANCEL_JOB_FAILED");
  }
}