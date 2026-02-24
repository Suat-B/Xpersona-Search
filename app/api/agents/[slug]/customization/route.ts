import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  agents,
  agentCustomizations,
  agentCustomizationVersions,
} from "@/lib/db/schema";
import { getAuthUser } from "@/lib/auth-utils";
import {
  CUSTOMIZATION_LIMITS,
  sanitizeCustomizationInput,
} from "@/lib/agent-customization/sanitize";
import { checkCustomizationUpdateRateLimit } from "@/lib/agent-customization/rate-limit";

const StatusSchema = z.enum(["DRAFT", "PUBLISHED", "DISABLED"]);

const CustomizationSchema = z.object({
  customHtml: z.string().max(CUSTOMIZATION_LIMITS.maxHtmlBytes).optional().nullable(),
  customCss: z.string().max(CUSTOMIZATION_LIMITS.maxCssBytes).optional().nullable(),
  customJs: z.string().max(CUSTOMIZATION_LIMITS.maxJsBytes).optional().nullable(),
  widgetLayout: z.array(z.unknown()).max(CUSTOMIZATION_LIMITS.maxWidgetCount).optional(),
  editorState: z.record(z.unknown()).optional(),
  status: StatusSchema.optional(),
});

async function getOwnedAgent(req: NextRequest, slug: string) {
  const authResult = await getAuthUser(req);
  if ("error" in authResult) {
    return { error: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }) };
  }
  const { user } = authResult;

  const [agent] = await db
    .select({
      id: agents.id,
      slug: agents.slug,
      claimStatus: agents.claimStatus,
      claimedByUserId: agents.claimedByUserId,
    })
    .from(agents)
    .where(and(eq(agents.slug, slug), eq(agents.status, "ACTIVE")))
    .limit(1);

  if (!agent) {
    return { error: NextResponse.json({ error: "Agent not found" }, { status: 404 }) };
  }

  if (agent.claimStatus !== "CLAIMED" || agent.claimedByUserId !== user.id) {
    return {
      error: NextResponse.json(
        { error: "You are not the owner of this page" },
        { status: 403 }
      ),
    };
  }

  return { user, agent };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const access = await getOwnedAgent(req, slug);
  if ("error" in access) return access.error;

  const [customization] = await db
    .select()
    .from(agentCustomizations)
    .where(eq(agentCustomizations.agentId, access.agent.id))
    .limit(1);

  return NextResponse.json({
    customization: customization ?? null,
    limits: CUSTOMIZATION_LIMITS,
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const access = await getOwnedAgent(req, slug);
  if ("error" in access) return access.error;

  const rl = checkCustomizationUpdateRateLimit(access.user.id);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many customization updates. Try again later." },
      {
        status: 429,
        headers: rl.retryAfter ? { "Retry-After": String(rl.retryAfter) } : undefined,
      }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CustomizationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;

  let sanitized;
  try {
    sanitized = sanitizeCustomizationInput({
      customHtml: data.customHtml ?? "",
      customCss: data.customCss ?? "",
      customJs: data.customJs ?? "",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to sanitize customization" },
      { status: 400 }
    );
  }

  if (sanitized.jsBlockedPatterns.length > 0) {
    return NextResponse.json(
      {
        error: "Custom JS contains blocked patterns.",
        blockedPatterns: sanitized.jsBlockedPatterns,
      },
      { status: 400 }
    );
  }

  const status = data.status ?? "PUBLISHED";
  const widgetLayout = data.widgetLayout ?? [];
  const now = new Date();

  const hasRenderableContent =
    status === "PUBLISHED" &&
    (sanitized.html.length > 0 ||
      sanitized.css.length > 0 ||
      sanitized.js.length > 0 ||
      widgetLayout.length > 0);

  const [existing] = await db
    .select({
      id: agentCustomizations.id,
    })
    .from(agentCustomizations)
    .where(eq(agentCustomizations.agentId, access.agent.id))
    .limit(1);

  let customizationId: string;
  if (existing) {
    customizationId = existing.id;
    await db
      .update(agentCustomizations)
      .set({
        status,
        customHtml: data.customHtml ?? "",
        customCss: data.customCss ?? "",
        customJs: data.customJs ?? "",
        sanitizedHtml: sanitized.html,
        sanitizedCss: sanitized.css,
        sanitizedJs: sanitized.js,
        widgetLayout,
        editorState: data.editorState ?? null,
        updatedAt: now,
      })
      .where(eq(agentCustomizations.id, existing.id));
  } else {
    const [inserted] = await db
      .insert(agentCustomizations)
      .values({
        agentId: access.agent.id,
        status,
        customHtml: data.customHtml ?? "",
        customCss: data.customCss ?? "",
        customJs: data.customJs ?? "",
        sanitizedHtml: sanitized.html,
        sanitizedCss: sanitized.css,
        sanitizedJs: sanitized.js,
        widgetLayout,
        editorState: data.editorState ?? null,
      })
      .returning({ id: agentCustomizations.id });

    customizationId = inserted.id;
  }

  const [versionData] = await db
    .select({
      maxVersion: sql<number>`coalesce(max(${agentCustomizationVersions.version}), 0)::int`,
    })
    .from(agentCustomizationVersions)
    .where(eq(agentCustomizationVersions.customizationId, customizationId));

  await db.insert(agentCustomizationVersions).values({
    customizationId,
    version: (versionData?.maxVersion ?? 0) + 1,
    customHtml: data.customHtml ?? "",
    customCss: data.customCss ?? "",
    customJs: data.customJs ?? "",
    widgetLayout,
  });

  await db
    .update(agents)
    .set({
      hasCustomPage: hasRenderableContent,
      customPageUpdatedAt: hasRenderableContent ? now : null,
      updatedAt: now,
    })
    .where(eq(agents.id, access.agent.id));

  const [saved] = await db
    .select()
    .from(agentCustomizations)
    .where(eq(agentCustomizations.agentId, access.agent.id))
    .limit(1);

  return NextResponse.json({
    success: true,
    customization: saved ?? null,
    warnings: sanitized.warnings,
  });
}
