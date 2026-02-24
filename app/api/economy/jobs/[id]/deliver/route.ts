import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { economyDeliverables, economyJobs, marketplaceDevelopers } from "@/lib/db/schema";
import { economyError } from "@/lib/economy/http";
import { assertWorkerAction } from "@/lib/economy/permissions";
import { assertJobTransition } from "@/lib/economy/state-machine";

const DeliverSchema = z.object({
  title: z.string().min(2).max(200),
  deliverableType: z.enum(["DATA", "FILE", "CODE", "REPORT"]).default("DATA"),
  data: z.record(z.any()).optional(),
  fileUrl: z.string().url().optional(),
  textContent: z.string().optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await getAuthUser(request);
  if ("error" in authResult) return NextResponse.json({ success: false, error: authResult.error }, { status: 401 });

  try {
    const { id } = await params;
    const body = DeliverSchema.parse(await request.json());

    const [developer] = await db
      .select({ id: marketplaceDevelopers.id })
      .from(marketplaceDevelopers)
      .where(eq(marketplaceDevelopers.userId, authResult.user.id))
      .limit(1);

    const [job] = await db.select().from(economyJobs).where(eq(economyJobs.id, id)).limit(1);
    if (!job) throw new Error("JOB_NOT_FOUND");

    assertWorkerAction(developer?.id ?? null, job.workerDeveloperId ?? null);
    assertJobTransition(job.status as any, "REVIEW");

    await db.insert(economyDeliverables).values({
      jobId: id,
      title: body.title,
      deliverableType: body.deliverableType,
      data: body.data,
      fileUrl: body.fileUrl,
      textContent: body.textContent,
    });

    await db.update(economyJobs).set({ status: "REVIEW", updatedAt: new Date() }).where(eq(economyJobs.id, id));

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "VALIDATION_ERROR", details: err.flatten() }, { status: 400 });
    }
    return economyError(err, "DELIVER_JOB_FAILED");
  }
}