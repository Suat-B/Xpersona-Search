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

const PreviewSchema = z.object({
  customHtml: z.string().max(CUSTOMIZATION_LIMITS.maxHtmlBytes).optional().nullable(),
  customCss: z.string().max(CUSTOMIZATION_LIMITS.maxCssBytes).optional().nullable(),
  customJs: z.string().max(CUSTOMIZATION_LIMITS.maxJsBytes).optional().nullable(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const authResult = await getAuthUser(req);
  if ("error" in authResult) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
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
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  if (agent.claimStatus !== "CLAIMED" || agent.claimedByUserId !== authResult.user.id) {
    return NextResponse.json(
      { error: "You are not the owner of this page" },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = PreviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const sanitized = sanitizeCustomizationInput(parsed.data);
    return NextResponse.json({
      preview: {
        html: sanitized.html,
        css: sanitized.css,
        js: sanitized.js,
      },
      warnings: sanitized.warnings,
      blockedPatterns: sanitized.jsBlockedPatterns,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate preview" },
      { status: 400 }
    );
  }
}
