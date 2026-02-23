import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { agents, agentClaims } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getAuthUser } from "@/lib/auth-utils";
import { checkClaimVerifyRateLimit } from "@/lib/claim/rate-limit";
import { runVerifier } from "@/lib/claim/verifiers";
import type { VerificationMethod } from "@/lib/claim/verification-methods";

const VerifySchema = z.object({
  method: z
    .enum([
      "GITHUB_FILE",
      "NPM_KEYWORD",
      "PYPI_KEYWORD",
      "DNS_TXT",
      "META_TAG",
      "EMAIL_MATCH",
      "MANUAL_REVIEW",
    ])
    .optional(),
});

/**
 * POST /api/agents/[slug]/claim/verify -- Verify a pending claim.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const authResult = await getAuthUser(req);
  if ("error" in authResult) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const { user } = authResult;

  const rateLimit = checkClaimVerifyRateLimit(user.id);
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: "Too many verification attempts. Try again later." },
      {
        status: 429,
        headers: rateLimit.retryAfter
          ? { "Retry-After": String(rateLimit.retryAfter) }
          : undefined,
      }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = VerifySchema.safeParse(body);

  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.slug, slug), eq(agents.status, "ACTIVE")))
    .limit(1);

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const [claim] = await db
    .select()
    .from(agentClaims)
    .where(
      and(
        eq(agentClaims.agentId, agent.id),
        eq(agentClaims.userId, user.id),
        eq(agentClaims.status, "PENDING")
      )
    )
    .limit(1);

  if (!claim) {
    return NextResponse.json(
      { error: "No pending claim found. Initiate a claim first." },
      { status: 404 }
    );
  }

  if (claim.expiresAt && new Date(claim.expiresAt) < new Date()) {
    await db
      .update(agentClaims)
      .set({ status: "EXPIRED", updatedAt: new Date() })
      .where(eq(agentClaims.id, claim.id));
    return NextResponse.json(
      { error: "Claim has expired. Please initiate a new claim." },
      { status: 410 }
    );
  }

  const method = (parsed.data?.method ??
    claim.verificationMethod) as VerificationMethod;

  if (method === "MANUAL_REVIEW") {
    return NextResponse.json({
      success: true,
      status: "PENDING",
      message:
        "Your claim has been submitted for manual review. An admin will review it within 48 hours.",
    });
  }

  const result = await runVerifier(method, agent, claim.verificationToken, user.email);

  if (!result.verified) {
    return NextResponse.json(
      {
        success: false,
        verified: false,
        error: result.error ?? "Verification failed",
        message: "Verification did not pass. Make sure you've completed the verification steps and try again.",
      },
      { status: 200 }
    );
  }

  const now = new Date();
  await db
    .update(agentClaims)
    .set({
      status: "APPROVED",
      verifiedAt: now,
      updatedAt: now,
    })
    .where(eq(agentClaims.id, claim.id));

  await db
    .update(agents)
    .set({
      claimedByUserId: user.id,
      claimedAt: now,
      claimStatus: "CLAIMED",
      updatedAt: now,
    })
    .where(eq(agents.id, agent.id));

  return NextResponse.json({
    success: true,
    verified: true,
    status: "CLAIMED",
    message: "Congratulations! You are now the verified owner of this page.",
  });
}
