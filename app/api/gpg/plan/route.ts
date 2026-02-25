import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { planPipeline } from "@/lib/gpg/recommend";
import { ensureTaskSignature } from "@/lib/gpg/task-canonicalization";

const PlanSchema = z.object({
  task: z.string().min(1).max(500),
  taskType: z.string().max(32).optional(),
  tags: z.array(z.string().min(1).max(64)).optional(),
  constraints: z
    .object({
      budget: z.number().min(0).optional(),
      maxLatencyMs: z.number().int().min(1).max(300000).optional(),
      minSuccessProb: z.number().min(0).max(1).optional(),
      minQuality: z.number().min(0).max(1).optional(),
    })
    .optional(),
  preferences: z
    .object({
      optimizeFor: z.enum(["success_then_cost", "cost_then_success", "latency_then_success"]).optional(),
    })
    .optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = PlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const signature = await ensureTaskSignature({
    rawText: parsed.data.task,
    taskType: parsed.data.taskType,
    tags: parsed.data.tags,
  });

  const response = await planPipeline({
    clusterId: signature.clusterId,
    constraints: parsed.data.constraints,
    preferences: parsed.data.preferences,
  });

  return NextResponse.json({ success: true, data: response });
}
