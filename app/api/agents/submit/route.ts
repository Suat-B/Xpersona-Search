/**
 * POST /api/agents/submit
 * Manual agent submission. Rate-limited. Inserts with MANUAL_SUBMISSION, PENDING_REVIEW.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { generateSlug } from "@/lib/search/utils/slug";
import { checkAgentSubmitRateLimit } from "@/lib/rate-limit";
import { applyRequestIdHeader, jsonError } from "@/lib/api/errors";
import { recordApiResponse } from "@/lib/metrics/record";

const SubmitSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  url: z.string().url().max(1024),
  homepage: z.string().url().max(1024).optional(),
  protocols: z.array(z.enum(["A2A", "MCP", "ANP", "OPENCLEW", "CUSTOM"])).max(10).optional(),
  capabilities: z.array(z.string().max(100)).max(20).optional(),
});

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  if (forwarded) return forwarded.split(",")[0].trim();
  if (realIp) return realIp;
  return "unknown";
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const ip = getClientIp(req);
  const limitResult = checkAgentSubmitRateLimit(ip);
  if (!limitResult.ok) {
    const response = jsonError(req, {
      code: "RATE_LIMITED",
      message: "Too many submissions. Try again later.",
      status: 429,
      retryAfterMs: (limitResult.retryAfter ?? 60) * 1000,
    });
    recordApiResponse("/api/agents/submit", req, response, startedAt);
    return response;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    const response = jsonError(req, {
      code: "BAD_REQUEST",
      message: "Invalid JSON body",
      status: 400,
    });
    recordApiResponse("/api/agents/submit", req, response, startedAt);
    return response;
  }

  const parseResult = SubmitSchema.safeParse(body);
  if (!parseResult.success) {
    const response = jsonError(req, {
      code: "BAD_REQUEST",
      message: "Invalid request",
      status: 400,
      details: parseResult.error.flatten(),
    });
    recordApiResponse("/api/agents/submit", req, response, startedAt);
    return response;
  }

  const data = parseResult.data;
  const sourceId = `manual:${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  const baseSlug = generateSlug(`manual-${data.name}`);
  const slug = `${baseSlug || "manual"}-${Date.now().toString(36)}`;

  try {
    await db.insert(agents).values({
      sourceId,
      source: "MANUAL_SUBMISSION",
      name: data.name,
      slug,
      description: data.description ?? null,
      url: data.url,
      homepage: data.homepage ?? null,
      capabilities: data.capabilities ?? [],
      protocols: data.protocols ?? ["CUSTOM"],
      languages: [],
      safetyScore: 0,
      popularityScore: 0,
      freshnessScore: 50,
      performanceScore: 0,
      overallRank: 15,
      status: "PENDING_REVIEW",
      lastCrawledAt: new Date(),
      nextCrawlAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
  } catch (err) {
    console.error("[Agent submit] Error:", err);
    const response = jsonError(req, {
      code: "INTERNAL_ERROR",
      message: "Submission failed",
      status: 500,
    });
    recordApiResponse("/api/agents/submit", req, response, startedAt);
    return response;
  }

  const response = NextResponse.json({
    success: true,
    message: "Agent submitted for review. It will appear after approval.",
  });
  applyRequestIdHeader(response, req);
  recordApiResponse("/api/agents/submit", req, response, startedAt);
  return response;
}
