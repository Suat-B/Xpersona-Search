import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { getAuthUser } from "@/lib/auth-utils";
import {
  CUSTOMIZATION_LIMITS,
  sanitizeCustomizationInput,
} from "@/lib/agent-customization/sanitize";
import { applyRequestIdHeader, jsonError } from "@/lib/api/errors";
import { recordApiResponse } from "@/lib/metrics/record";

const PreviewSchema = z.object({
  customHtml: z.string().max(CUSTOMIZATION_LIMITS.maxHtmlBytes).optional().nullable(),
  customCss: z.string().max(CUSTOMIZATION_LIMITS.maxCssBytes).optional().nullable(),
  customJs: z.string().max(CUSTOMIZATION_LIMITS.maxJsBytes).optional().nullable(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const startedAt = Date.now();
  const { slug } = await params;

  const authResult = await getAuthUser(req);
  if ("error" in authResult) {
    const response = jsonError(req, { code: "UNAUTHORIZED", message: "UNAUTHORIZED", status: 401 });
    recordApiResponse("/api/agents/:slug/customization/preview", req, response, startedAt);
    return response;
  }

  const [agent] = await db
    .select({
      id: agents.id,
      claimedByUserId: agents.claimedByUserId,
      claimStatus: agents.claimStatus,
    })
    .from(agents)
    .where(and(eq(agents.slug, slug), eq(agents.status, "ACTIVE")))
    .limit(1);

  if (!agent) {
    const response = jsonError(req, { code: "NOT_FOUND", message: "Agent not found", status: 404 });
    recordApiResponse("/api/agents/:slug/customization/preview", req, response, startedAt);
    return response;
  }

  if (agent.claimStatus !== "CLAIMED" || agent.claimedByUserId !== authResult.user.id) {
    const response = jsonError(req, { code: "FORBIDDEN", message: "You are not the owner of this page", status: 403 });
    recordApiResponse("/api/agents/:slug/customization/preview", req, response, startedAt);
    return response;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    const response = jsonError(req, { code: "BAD_REQUEST", message: "Invalid JSON body", status: 400 });
    recordApiResponse("/api/agents/:slug/customization/preview", req, response, startedAt);
    return response;
  }

  const parsed = PreviewSchema.safeParse(body);
  if (!parsed.success) {
    const response = jsonError(req, {
      code: "BAD_REQUEST",
      message: "Invalid request",
      status: 400,
      details: parsed.error.flatten(),
    });
    recordApiResponse("/api/agents/:slug/customization/preview", req, response, startedAt);
    return response;
  }

  try {
    const sanitized = sanitizeCustomizationInput(parsed.data);
    const response = NextResponse.json({
      preview: {
        html: sanitized.html,
        css: sanitized.css,
        js: sanitized.js,
      },
      warnings: sanitized.warnings,
      blockedPatterns: sanitized.jsBlockedPatterns,
    });
    applyRequestIdHeader(response, req);
    recordApiResponse("/api/agents/:slug/customization/preview", req, response, startedAt);
    return response;
  } catch (err) {
    const response = jsonError(req, {
      code: "BAD_REQUEST",
      message: err instanceof Error ? err.message : "Failed to generate preview",
      status: 400,
    });
    recordApiResponse("/api/agents/:slug/customization/preview", req, response, startedAt);
    return response;
  }
}
