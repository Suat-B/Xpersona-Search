import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { TASK_TYPES } from "@/lib/search/taxonomy";
import { apiV1 } from "@/lib/api/url";
import { fetchWithTimeout } from "@/lib/api/fetch-timeout";
import { applyRequestIdHeader, jsonError } from "@/lib/api/errors";
import { recordApiResponse } from "@/lib/metrics/record";

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
  const startedAt = Date.now();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    const response = jsonError(req, {
      code: "BAD_REQUEST",
      message: "Invalid JSON body",
      status: 400,
    });
    recordApiResponse("/api/v2/search/plan", req, response, startedAt);
    return response;
  }
  const parsed = PlanRequestSchema.safeParse(body);
  if (!parsed.success) {
    const response = jsonError(req, {
      code: "BAD_REQUEST",
      message: "Invalid payload",
      status: 400,
      details: parsed.error.flatten(),
    });
    recordApiResponse("/api/v2/search/plan", req, response, startedAt);
    return response;
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

  const searchRes = await fetchWithTimeout(
    new URL(apiV1(`/search?${params.toString()}`), req.nextUrl.origin),
    {
      method: "GET",
      headers: {
        "x-client-type": "agent",
      },
    },
    Number(process.env.SEARCH_UPSTREAM_TIMEOUT_MS ?? "8000")
  );
  const searchJson = (await searchRes.json()) as {
    results?: Array<Record<string, unknown>>;
    executionPlan?: Record<string, unknown>;
  };
  if (!searchRes.ok) {
    const response = jsonError(req, {
      code: "UPSTREAM_ERROR",
      message: "Planner failed to get candidates",
      status: 502,
      details: searchJson,
      retryable: true,
    });
    recordApiResponse("/api/v2/search/plan", req, response, startedAt);
    return response;
  }

  const results = searchJson.results ?? [];
  const primary = results[0] ?? null;
  const response = NextResponse.json({
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
  applyRequestIdHeader(response, req);
  recordApiResponse("/api/v2/search/plan", req, response, startedAt);
  return response;
}

