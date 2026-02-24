import { NextRequest, NextResponse } from "next/server";
import { desc, eq, or } from "drizzle-orm";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { economyEscrows, economyJobs, marketplaceDevelopers } from "@/lib/db/schema";
import { economyError } from "@/lib/economy/http";

const CreateJobSchema = z.object({
  agentId: z.string().uuid().optional(),
  title: z.string().min(3).max(200),
  description: z.string().min(10),
  requirements: z.record(z.any()).optional(),
  budgetCents: z.number().int().positive(),
  currency: z.string().min(3).max(10).default("USD"),
  deadlineAt: z.string().datetime().optional(),
  metadata: z.record(z.any()).optional(),
});

export async function GET(request: NextRequest) {
  const authResult = await getAuthUser(request);
  if ("error" in authResult) {
    return NextResponse.json({ success: false, error: authResult.error }, { status: 401 });
  }

  const [developer] = await db
    .select({ id: marketplaceDevelopers.id })
    .from(marketplaceDevelopers)
    .where(eq(marketplaceDevelopers.userId, authResult.user.id))
    .limit(1);

  const whereClause = developer
    ? or(eq(economyJobs.clientUserId, authResult.user.id), eq(economyJobs.workerDeveloperId, developer.id))
    : eq(economyJobs.clientUserId, authResult.user.id);

  const rows = await db
    .select()
    .from(economyJobs)
    .where(whereClause)
    .orderBy(desc(economyJobs.createdAt))
    .limit(100);

  return NextResponse.json({ success: true, data: { jobs: rows } });
}

export async function POST(request: NextRequest) {
  const authResult = await getAuthUser(request);
  if ("error" in authResult) {
    return NextResponse.json({ success: false, error: authResult.error }, { status: 401 });
  }

  try {
    const json = await request.json();
    const body = CreateJobSchema.parse(json);

    const inserted = await db
      .insert(economyJobs)
      .values({
        clientUserId: authResult.user.id,
        agentId: body.agentId,
        title: body.title,
        description: body.description,
        requirements: body.requirements ?? {},
        budgetCents: body.budgetCents,
        currency: body.currency.toUpperCase(),
        status: "POSTED",
        deadlineAt: body.deadlineAt ? new Date(body.deadlineAt) : null,
        metadata: body.metadata ?? {},
        updatedAt: new Date(),
      })
      .returning({ id: economyJobs.id, budgetCents: economyJobs.budgetCents, currency: economyJobs.currency });

    const job = inserted[0];

    await db.insert(economyEscrows).values({
      jobId: job.id,
      amountCents: job.budgetCents,
      currency: job.currency,
      status: "PENDING",
      updatedAt: new Date(),
    });

    return NextResponse.json({ success: true, data: { id: job.id } }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "VALIDATION_ERROR", details: err.flatten() }, { status: 400 });
    }
    return economyError(err, "CREATE_JOB_FAILED");
  }
}
