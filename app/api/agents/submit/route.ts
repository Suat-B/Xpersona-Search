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
  const ip = getClientIp(req);
  const limitResult = checkAgentSubmitRateLimit(ip);
  if (!limitResult.ok) {
    return NextResponse.json(
      { error: "Too many submissions. Try again later." },
      {
        status: 429,
        headers: limitResult.retryAfter
          ? { "Retry-After": String(limitResult.retryAfter) }
          : undefined,
      }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parseResult = SubmitSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parseResult.error.flatten() },
      { status: 400 }
    );
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
    return NextResponse.json(
      { error: "Submission failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    message: "Agent submitted for review. It will appear after approval.",
  });
}
