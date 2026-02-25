import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { agentBenchmarkResults } from "@/lib/db/schema";
import { resolveAgentId } from "@/lib/reliability/lookup";

const BenchmarkSchema = z.object({
  agentId: z.string().min(1),
  suiteName: z.string().min(1).max(64),
  score: z.number().min(0).max(1),
  accuracy: z.number().min(0).max(1).optional(),
  latencyMs: z.number().min(0).optional(),
  costUsd: z.number().min(0).optional(),
  safetyViolations: z.number().int().min(0).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const payload = BenchmarkSchema.parse(await req.json());
    const agentId = await resolveAgentId(payload.agentId);
    if (!agentId) {
      return NextResponse.json({ success: false, message: "Agent not found" }, { status: 404 });
    }

    await db.insert(agentBenchmarkResults).values({
      agentId,
      suiteName: payload.suiteName,
      score: payload.score,
      accuracy: payload.accuracy ?? null,
      latencyMs: payload.latencyMs ?? null,
      costUsd: payload.costUsd ?? null,
      safetyViolations: payload.safetyViolations ?? 0,
      createdAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      agentId,
      suiteName: payload.suiteName,
      score: payload.score,
      accuracy: payload.accuracy ?? null,
      latency_ms: payload.latencyMs ?? null,
      cost_usd: payload.costUsd ?? null,
      safety_violations: payload.safetyViolations ?? 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid payload";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
