import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { agentClaims, agents } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getAuthUser } from "@/lib/auth-utils";
import { isAdmin } from "@/lib/admin";

const RejectSchema = z.object({
  note: z.string().max(2000).optional(),
});

/**
 * POST /api/admin/claims/[id]/reject -- Reject a pending claim.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authResult = await getAuthUser(req);
  if ("error" in authResult) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!isAdmin(authResult.user)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine */
  }
  const parsed = RejectSchema.safeParse(body);

  const [claim] = await db
    .select()
    .from(agentClaims)
    .where(eq(agentClaims.id, id))
    .limit(1);

  if (!claim) {
    return NextResponse.json({ error: "Claim not found" }, { status: 404 });
  }

  if (claim.status !== "PENDING") {
    return NextResponse.json(
      { error: `Claim is ${claim.status}, not PENDING` },
      { status: 409 }
    );
  }

  const now = new Date();
  await db
    .update(agentClaims)
    .set({
      status: "REJECTED",
      reviewedByUserId: authResult.user.id,
      reviewNote: parsed.data?.note ?? null,
      updatedAt: now,
    })
    .where(eq(agentClaims.id, id));

  const [otherPending] = await db
    .select({ id: agentClaims.id })
    .from(agentClaims)
    .where(
      and(
        eq(agentClaims.agentId, claim.agentId),
        eq(agentClaims.status, "PENDING")
      )
    )
    .limit(1);

  if (!otherPending) {
    await db
      .update(agents)
      .set({ claimStatus: "UNCLAIMED", updatedAt: now })
      .where(eq(agents.id, claim.agentId));
  }

  return NextResponse.json({ success: true, status: "REJECTED" });
}
