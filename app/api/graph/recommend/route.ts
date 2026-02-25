import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { recommendAgents } from "@/lib/gpg/recommend";
import { ensureTaskSignature } from "@/lib/gpg/task-canonicalization";
import { applyRequestIdHeader, jsonError } from "@/lib/api/errors";

const RecommendSchema = z.object({
  q: z.string().min(1).max(500),
  taskType: z.string().max(32).optional(),
  tags: z.array(z.string().min(1).max(64)).optional(),
  budget: z.number().min(0).optional(),
  maxLatencyMs: z.number().int().min(1).max(300000).optional(),
  minSuccessProb: z.number().min(0).max(1).optional(),
  minQuality: z.number().min(0).max(1).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const parsed = RecommendSchema.safeParse({
    q: url.searchParams.get("q"),
    taskType: url.searchParams.get("taskType") ?? undefined,
    tags: url.searchParams.get("tags")?.split(",").filter(Boolean),
    budget: url.searchParams.get("budget") ? Number(url.searchParams.get("budget")) : undefined,
    maxLatencyMs: url.searchParams.get("maxLatencyMs") ? Number(url.searchParams.get("maxLatencyMs")) : undefined,
    minSuccessProb: url.searchParams.get("minSuccessProb") ? Number(url.searchParams.get("minSuccessProb")) : undefined,
    minQuality: url.searchParams.get("minQuality") ? Number(url.searchParams.get("minQuality")) : undefined,
    limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
  });
  if (!parsed.success) {
    return jsonError(req, {
      code: "BAD_REQUEST",
      message: "Invalid parameters",
      status: 400,
      details: parsed.error.flatten(),
    });
  }

  const signature = await ensureTaskSignature({
    rawText: parsed.data.q,
    taskType: parsed.data.taskType,
    tags: parsed.data.tags,
  });

  const response = await recommendAgents({
    clusterId: signature.clusterId,
    constraints: {
      budget: parsed.data.budget,
      maxLatencyMs: parsed.data.maxLatencyMs,
      minSuccessProb: parsed.data.minSuccessProb,
      minQuality: parsed.data.minQuality,
    },
    limit: parsed.data.limit,
  });

  const res = NextResponse.json({ success: true, data: response });
  applyRequestIdHeader(res, req);
  return res;
}
