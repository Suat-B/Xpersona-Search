import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { planPipeline } from "@/lib/gpg/recommend";
import { ensureTaskSignature } from "@/lib/gpg/task-canonicalization";
import { applyRequestIdHeader, jsonError } from "@/lib/api/errors";

const PlanSchema = z.object({
  q: z.string().min(1).max(500),
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

function parsePlanFromQuery(req: NextRequest) {
  const url = new URL(req.url);
  return PlanSchema.safeParse({
    q: url.searchParams.get("q"),
    taskType: url.searchParams.get("taskType") ?? undefined,
    tags: url.searchParams.get("tags")?.split(",").filter(Boolean),
    constraints: {
      budget: url.searchParams.get("budget") ? Number(url.searchParams.get("budget")) : undefined,
      maxLatencyMs: url.searchParams.get("maxLatencyMs") ? Number(url.searchParams.get("maxLatencyMs")) : undefined,
      minSuccessProb: url.searchParams.get("minSuccessProb") ? Number(url.searchParams.get("minSuccessProb")) : undefined,
      minQuality: url.searchParams.get("minQuality") ? Number(url.searchParams.get("minQuality")) : undefined,
    },
    preferences: {
      optimizeFor: url.searchParams.get("optimizeFor") as
        | "success_then_cost"
        | "cost_then_success"
        | "latency_then_success"
        | undefined,
    },
  });
}

async function buildPlanResponse(req: NextRequest, data: z.infer<typeof PlanSchema>) {
  const signature = await ensureTaskSignature({
    rawText: data.q,
    taskType: data.taskType,
    tags: data.tags,
  });

  const response = await planPipeline({
    clusterId: signature.clusterId,
    constraints: data.constraints,
    preferences: data.preferences,
  });

  const res = NextResponse.json({ success: true, data: response });
  applyRequestIdHeader(res, req);
  return res;
}

export async function GET(req: NextRequest) {
  const parsed = parsePlanFromQuery(req);
  if (!parsed.success) {
    return jsonError(req, {
      code: "BAD_REQUEST",
      message: "Invalid parameters",
      status: 400,
      details: parsed.error.flatten(),
    });
  }
  return buildPlanResponse(req, parsed.data);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = PlanSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(req, {
      code: "BAD_REQUEST",
      message: "Invalid payload",
      status: 400,
      details: parsed.error.flatten(),
    });
  }
  return buildPlanResponse(req, parsed.data);
}
