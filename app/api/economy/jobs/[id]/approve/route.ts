import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { economyEscrows, economyJobs } from "@/lib/db/schema";
import { economyError } from "@/lib/economy/http";
import { assertClientAction } from "@/lib/economy/permissions";
import { assertJobTransition } from "@/lib/economy/state-machine";
import { releaseEscrowToWorker } from "@/lib/economy/payments";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await getAuthUser(request);
  if ("error" in authResult) return NextResponse.json({ success: false, error: authResult.error }, { status: 401 });

  try {
    const { id } = await params;
    const [job] = await db.select().from(economyJobs).where(eq(economyJobs.id, id)).limit(1);
    if (!job) throw new Error("JOB_NOT_FOUND");

    assertClientAction(authResult.user.id, job.clientUserId);
    assertJobTransition(job.status as any, "COMPLETED");

    const [escrow] = await db.select().from(economyEscrows).where(eq(economyEscrows.jobId, id)).limit(1);
    if (!escrow || escrow.status !== "FUNDED") throw new Error("ESCROW_NOT_FUNDED");

    await db.update(economyJobs).set({ status: "COMPLETED", completedAt: new Date(), updatedAt: new Date() }).where(eq(economyJobs.id, id));

    const payout = await releaseEscrowToWorker(id);
    return NextResponse.json({ success: true, data: payout });
  } catch (err) {
    return economyError(err, "APPROVE_JOB_FAILED");
  }
}