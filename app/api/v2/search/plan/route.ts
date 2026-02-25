import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { TASK_TYPES } from "@/lib/search/taxonomy";
import { apiV1 } from "@/lib/api/url";

const PlanRequestSchema = z.object({
  q: z.string().min(1).max(500),
  taskType: z.enum(TASK_TYPES).default("general"),
  requires: z.array(z.string().min(1).max(64)).default([]),
  forbidden: z.array(z.string().min(1).max(64)).default([]),
  maxLatencyMs: z.number().int().min(1).max(300000).optional(),
  maxCostUsd: z.number().min(0).max(10000).optional(),
  dataRegion: z.enum(["us", "eu", "global"]).optional(),
  bundle: z.boolean().default(true),
  limit: z.number().int().min(1).max(30).default(10),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = PlanRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const p = parsed.data;
  const params = new URLSearchParams({
    q: p.q,
    intent: "execute",
    taskType: p.taskType,
    requires: p.requires.join(","),
    forbidden: p.forbidden.join(","),
    bundle: p.bundle ? "1" : "0",
    returnPlan: "1",
    strictContracts: "1",
    limit: String(p.limit),
  });
  if (p.maxLatencyMs != null) params.set("maxLatencyMs", String(p.maxLatencyMs));
  if (p.maxCostUsd != null) params.set("maxCostUsd", String(p.maxCostUsd));
  if (p.dataRegion) params.set("dataRegion", p.dataRegion);

  const searchRes = await fetch(new URL(apiV1(`/search?${params.toString()}`), req.nextUrl.origin), {
    method: "GET",
    headers: {
      "x-client-type": "agent",
    },
  });
  const searchJson = (await searchRes.json()) as {
    results?: Array<Record<string, unknown>>;
    executionPlan?: Record<string, unknown>;
  };
  if (!searchRes.ok) {
    return NextResponse.json({ error: "Planner failed to get candidates", details: searchJson }, { status: 502 });
  }

  const results = searchJson.results ?? [];
  const primary = results[0] ?? null;
  return NextResponse.json({
    success: true,
    data: {
      input: p,
      primary,
      fallback: (primary?.fallbackCandidates as unknown[]) ?? [],
      delegation: (primary?.delegationHints as unknown[]) ?? [],
      plan: searchJson.executionPlan ?? null,
      candidates: results,
    },
    meta: {
      version: "v2-draft",
      generatedAt: new Date().toISOString(),
    },
  });
}

