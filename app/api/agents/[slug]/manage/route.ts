import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getAuthUser } from "@/lib/auth-utils";
import {
  buildPermanentAccountRequiredPayload,
  resolveUpgradeCallbackPath,
} from "@/lib/auth-flow";

const ManageSchema = z.object({
  description: z.string().max(5000).optional(),
  homepage: z.string().url().max(1024).optional().nullable(),
  capabilities: z.array(z.string().max(100)).max(30).optional(),
  protocols: z
    .array(z.enum(["A2A", "MCP", "ANP", "OPENCLEW", "CUSTOM"]))
    .max(10)
    .optional(),
  readme: z.string().max(100_000).optional(),
  customLinks: z
    .array(
      z.object({
        label: z.string().max(50),
        url: z.string().url().max(1024),
      })
    )
    .max(10)
    .optional(),
});

/**
 * PATCH /api/agents/[slug]/manage -- Edit a claimed agent page.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const authResult = await getAuthUser(req);
  if ("error" in authResult) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const { user } = authResult;
  if (!user.isPermanent) {
    const callbackPath = resolveUpgradeCallbackPath(
      `/agent/${slug}/manage`,
      req.headers.get("referer")
    );
    return NextResponse.json(
      buildPermanentAccountRequiredPayload(user.accountType, callbackPath),
      { status: 403 }
    );
  }

  const [agent] = await db
    .select({
      id: agents.id,
      claimedByUserId: agents.claimedByUserId,
      claimStatus: agents.claimStatus,
      ownerOverrides: agents.ownerOverrides,
    })
    .from(agents)
    .where(and(eq(agents.slug, slug), eq(agents.status, "ACTIVE")))
    .limit(1);

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  if (agent.claimStatus !== "CLAIMED" || agent.claimedByUserId !== user.id) {
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

  const parsed = ManageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const currentOverrides =
    (agent.ownerOverrides as Record<string, unknown>) ?? {};

  const newOverrides: Record<string, unknown> = { ...currentOverrides };
  if (data.description !== undefined)
    newOverrides.description = data.description;
  if (data.homepage !== undefined) newOverrides.homepage = data.homepage;
  if (data.capabilities !== undefined)
    newOverrides.capabilities = data.capabilities;
  if (data.protocols !== undefined) newOverrides.protocols = data.protocols;
  if (data.readme !== undefined) newOverrides.readme = data.readme;
  if (data.customLinks !== undefined)
    newOverrides.customLinks = data.customLinks;

  await db
    .update(agents)
    .set({ ownerOverrides: newOverrides, updatedAt: new Date() })
    .where(eq(agents.id, agent.id));

  return NextResponse.json({ success: true, overrides: newOverrides });
}

/**
 * GET /api/agents/[slug]/manage -- Get current overrides for the owner.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const authResult = await getAuthUser(req);
  if ("error" in authResult) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const { user } = authResult;
  if (!user.isPermanent) {
    const callbackPath = resolveUpgradeCallbackPath(
      `/agent/${slug}/manage`,
      req.headers.get("referer")
    );
    return NextResponse.json(
      buildPermanentAccountRequiredPayload(user.accountType, callbackPath),
      { status: 403 }
    );
  }

  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.slug, slug), eq(agents.status, "ACTIVE")))
    .limit(1);

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  if (agent.claimStatus !== "CLAIMED" || agent.claimedByUserId !== user.id) {
    return NextResponse.json(
      { error: "You are not the owner of this page" },
      { status: 403 }
    );
  }

  return NextResponse.json({
    agent,
    overrides: agent.ownerOverrides ?? {},
  });
}
