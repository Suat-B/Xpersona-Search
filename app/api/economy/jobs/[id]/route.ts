import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import {
  economyDeliverables,
  economyEscrows,
  economyJobMessages,
  economyJobs,
  marketplaceDevelopers,
} from "@/lib/db/schema";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await getAuthUser(request);
  if ("error" in authResult) {
    return NextResponse.json({ success: false, error: authResult.error }, { status: 401 });
  }

  const { id } = await params;

  const [developer] = await db
    .select({ id: marketplaceDevelopers.id })
    .from(marketplaceDevelopers)
    .where(eq(marketplaceDevelopers.userId, authResult.user.id))
    .limit(1);

  const [job] = await db
    .select()
    .from(economyJobs)
    .where(eq(economyJobs.id, id))
    .limit(1);

  if (!job) {
    return NextResponse.json({ success: false, error: "JOB_NOT_FOUND" }, { status: 404 });
  }

  if (job.clientUserId !== authResult.user.id && (!developer || job.workerDeveloperId !== developer.id)) {
    return NextResponse.json({ success: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const [escrow] = await db.select().from(economyEscrows).where(eq(economyEscrows.jobId, id)).limit(1);
  const deliverables = await db
    .select()
    .from(economyDeliverables)
    .where(eq(economyDeliverables.jobId, id));
  const messages = await db
    .select()
    .from(economyJobMessages)
    .where(eq(economyJobMessages.jobId, id));

  return NextResponse.json({ success: true, data: { job, escrow, deliverables, messages } });
}