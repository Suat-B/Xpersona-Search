import { NextRequest, NextResponse } from "next/server";
import { desc, eq, or } from "drizzle-orm";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { economyEscrows, economyJobs, marketplaceDevelopers } from "@/lib/db/schema";
import { economyError } from "@/lib/economy/http";
import { ensureTaskSignature } from "@/lib/gpg/task-canonicalization";
import { recommendAgents } from "@/lib/gpg/recommend";
import { computeEscrowMultiplier } from "@/lib/gpg/risk";

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
    const taskText = `${body.title}\n${body.description}`.trim();

    let gpgDecision: Record<string, unknown> | null = null;
    let escrowMultiplier = 1;
    try {
      const signature = await ensureTaskSignature({ rawText: taskText, taskType: "general" });
      const gpg = await recommendAgents({
        clusterId: signature.clusterId,
        constraints: { budget: body.budgetCents / 100 },
        limit: 10,
      });
      escrowMultiplier = computeEscrowMultiplier(
        gpg.topAgents[0]?.risk ?? gpg.alternatives[0]?.risk ?? 0
      );
      gpgDecision = {
        clusterId: gpg.clusterId,
        clusterName: gpg.clusterName,
        taskType: gpg.taskType,
        topAgents: gpg.topAgents,
        alternatives: gpg.alternatives,
        risk: gpg.topAgents[0]?.risk ?? null,
        escrowMultiplier,
      };
    } catch {
      gpgDecision = null;
      escrowMultiplier = 1;
    }

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
        metadata: {
          ...(body.metadata ?? {}),
          gpg: gpgDecision,
        },
        updatedAt: new Date(),
      })
      .returning({ id: economyJobs.id, budgetCents: economyJobs.budgetCents, currency: economyJobs.currency });

    const job = inserted[0];
    const escrowAmount = Math.max(1, Math.round(job.budgetCents * escrowMultiplier));

    await db.insert(economyEscrows).values({
      jobId: job.id,
      amountCents: escrowAmount,
      currency: job.currency,
      status: "PENDING",
      updatedAt: new Date(),
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: job.id,
          gpg: gpgDecision,
          escrowMultiplier,
          escrowAmountCents: escrowAmount,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "VALIDATION_ERROR", details: err.flatten() }, { status: 400 });
    }
    return economyError(err, "CREATE_JOB_FAILED");
  }
}