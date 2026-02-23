import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents, users } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getAuthUser } from "@/lib/auth-utils";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.slug, slug), eq(agents.status, "ACTIVE")))
    .limit(1);

  if (!agent) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const overrides = (agent.ownerOverrides ?? {}) as Record<string, unknown>;
  const merged = { ...agent } as Record<string, unknown>;
  if (agent.claimStatus === "CLAIMED" && Object.keys(overrides).length > 0) {
    for (const [key, value] of Object.entries(overrides)) {
      if (key !== "customLinks" && value !== undefined) {
        merged[key] = value;
      }
    }
    if (overrides.customLinks) {
      merged.customLinks = overrides.customLinks;
    }
  }

  let claimedByName: string | null = null;
  let isOwner = false;

  if (agent.claimedByUserId) {
    const [owner] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, agent.claimedByUserId))
      .limit(1);
    claimedByName = owner?.name ?? "Verified Owner";

    try {
      const authResult = await getAuthUser(req);
      if (!("error" in authResult)) {
        isOwner = authResult.user.id === agent.claimedByUserId;
      }
    } catch {
      /* unauthenticated is fine */
    }
  }

  merged.claimedByName = claimedByName;
  merged.isOwner = isOwner;

  return NextResponse.json(merged);
}
