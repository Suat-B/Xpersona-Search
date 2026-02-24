import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agentCustomizations, agents } from "@/lib/db/schema";
import { getAuthUser } from "@/lib/auth-utils";
import { isAdmin } from "@/lib/admin";

const BodySchema = z.object({
  status: z.enum(["PUBLISHED", "DRAFT", "DISABLED"]),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const authResult = await getAuthUser(req);
  if ("error" in authResult) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!isAdmin(authResult.user)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const [agent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.slug, slug), eq(agents.status, "ACTIVE")))
    .limit(1);

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const [customization] = await db
    .select({ id: agentCustomizations.id })
    .from(agentCustomizations)
    .where(eq(agentCustomizations.agentId, agent.id))
    .limit(1);

  if (!customization) {
    return NextResponse.json({ error: "Customization not found" }, { status: 404 });
  }

  const now = new Date();
  const status = parsed.data.status;
  await db
    .update(agentCustomizations)
    .set({ status, updatedAt: now })
    .where(eq(agentCustomizations.id, customization.id));

  await db
    .update(agents)
    .set({
      hasCustomPage: status === "PUBLISHED",
      customPageUpdatedAt: status === "PUBLISHED" ? now : null,
      updatedAt: now,
    })
    .where(eq(agents.id, agent.id));

  return NextResponse.json({ success: true, status });
}
