import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { agentClaims, agents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthUser } from "@/lib/auth-utils";
import { isAdmin } from "@/lib/admin";
import { verificationTierForMethod } from "@/lib/claim/verification-tier";
import type { VerificationMethod } from "@/lib/claim/verification-methods";

const ApproveSchema = z.object({
  note: z.string().max(2000).optional(),
});

/**
 * POST /api/admin/claims/[id]/approve -- Approve a pending claim.
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
  const parsed = ApproveSchema.safeParse(body);

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
  const tier = verificationTierForMethod(
    claim.verificationMethod as VerificationMethod
  );
  try {
    await db
      .update(agentClaims)
      .set({
        status: "APPROVED",
        resolvedTier: tier,
        verifiedAt: now,
        reviewedByUserId: authResult.user.id,
        reviewNote: parsed.data?.note ?? null,
        updatedAt: now,
      })
      .where(eq(agentClaims.id, id));
  } catch (err) {
    if (err instanceof Error && err.message.includes('column "resolved_tier" does not exist')) {
      await db
        .update(agentClaims)
        .set({
          status: "APPROVED",
          verifiedAt: now,
          reviewedByUserId: authResult.user.id,
          reviewNote: parsed.data?.note ?? null,
          updatedAt: now,
        })
        .where(eq(agentClaims.id, id));
    } else {
      throw err;
    }
  }

  try {
    await db
      .update(agents)
      .set({
        claimedByUserId: claim.userId,
        claimedAt: now,
        claimStatus: "CLAIMED",
        verificationTier: tier,
        verificationMethod: claim.verificationMethod,
        updatedAt: now,
      })
      .where(eq(agents.id, claim.agentId));
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes('column "verification_tier" does not exist') ||
        err.message.includes('column "verification_method" does not exist'))
    ) {
      await db
        .update(agents)
        .set({
          claimedByUserId: claim.userId,
          claimedAt: now,
          claimStatus: "CLAIMED",
          updatedAt: now,
        })
        .where(eq(agents.id, claim.agentId));
    } else {
      throw err;
    }
  }

  return NextResponse.json({ success: true, status: "APPROVED" });
}
