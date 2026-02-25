import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { agents, agentClaims } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getAuthUser } from "@/lib/auth-utils";
import { checkClaimVerifyRateLimit } from "@/lib/claim/rate-limit";
import { runVerifier } from "@/lib/claim/verifiers";
import type { VerificationMethod } from "@/lib/claim/verification-methods";
import { verificationTierForMethod } from "@/lib/claim/verification-tier";
import {
  buildPermanentAccountRequiredPayload,
  resolveUpgradeCallbackPath,
} from "@/lib/auth-flow";
import { applyRequestIdHeader, jsonError } from "@/lib/api/errors";
import { recordApiResponse } from "@/lib/metrics/record";

const VerifySchema = z.object({
  method: z
    .enum([
      "GITHUB_FILE",
      "NPM_KEYWORD",
      "PYPI_KEYWORD",
      "DNS_TXT",
      "META_TAG",
      "EMAIL_MATCH",
      "CRYPTO_SIGNATURE",
      "MANUAL_REVIEW",
    ])
    .optional(),
  publicKey: z.string().max(4096).optional(),
  signature: z.string().max(8192).optional(),
});

/**
 * POST /api/agents/[slug]/claim/verify -- Verify a pending claim.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const startedAt = Date.now();
  const { slug } = await params;
  const authResult = await getAuthUser(req);
  if ("error" in authResult) {
    const response = jsonError(req, {
      code: "UNAUTHORIZED",
      message: "UNAUTHORIZED",
      status: 401,
    });
    recordApiResponse("/api/agents/:slug/claim/verify", req, response, startedAt);
    return response;
  }
  const { user } = authResult;
  if (!user.isPermanent) {
    const callbackPath = resolveUpgradeCallbackPath(
      `/agent/${slug}/claim`,
      req.headers.get("referer")
    );
    const response = NextResponse.json(
      buildPermanentAccountRequiredPayload(user.accountType, callbackPath),
      { status: 403 }
    );
    applyRequestIdHeader(response, req);
    recordApiResponse("/api/agents/:slug/claim/verify", req, response, startedAt);
    return response;
  }

  const rateLimit = checkClaimVerifyRateLimit(user.id);
  if (!rateLimit.ok) {
    const response = jsonError(req, {
      code: "RATE_LIMITED",
      message: "Too many verification attempts. Try again later.",
      status: 429,
      retryAfterMs: (rateLimit.retryAfter ?? 60) * 1000,
    });
    recordApiResponse("/api/agents/:slug/claim/verify", req, response, startedAt);
    return response;
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
    const response = jsonError(req, {
      code: "NOT_FOUND",
      message: "Agent not found",
      status: 404,
    });
    recordApiResponse("/api/agents/:slug/claim/verify", req, response, startedAt);
    return response;
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
    const response = jsonError(req, {
      code: "NOT_FOUND",
      message: "No pending claim found. Initiate a claim first.",
      status: 404,
    });
    recordApiResponse("/api/agents/:slug/claim/verify", req, response, startedAt);
    return response;
  }

  if (claim.expiresAt && new Date(claim.expiresAt) < new Date()) {
    await db
      .update(agentClaims)
      .set({ status: "EXPIRED", updatedAt: new Date() })
      .where(eq(agentClaims.id, claim.id));
    const response = jsonError(req, {
      code: "GONE",
      message: "Claim has expired. Please initiate a new claim.",
      status: 410,
    });
    recordApiResponse("/api/agents/:slug/claim/verify", req, response, startedAt);
    return response;
  }

  if (!parsed.success) {
    const response = jsonError(req, {
      code: "BAD_REQUEST",
      message: "Invalid request",
      status: 400,
      details: parsed.error.flatten(),
    });
    recordApiResponse("/api/agents/:slug/claim/verify", req, response, startedAt);
    return response;
  }

  const method = (parsed.data.method ?? claim.verificationMethod) as VerificationMethod;

  if (method === "MANUAL_REVIEW") {
    const response = NextResponse.json({
      success: true,
      status: "PENDING",
      message:
        "Your claim has been submitted for manual review. An admin will review it within 48 hours.",
    });
    applyRequestIdHeader(response, req);
    recordApiResponse("/api/agents/:slug/claim/verify", req, response, startedAt);
    return response;
  }

  if (method === "CRYPTO_SIGNATURE") {
    if (!parsed.data.publicKey || !parsed.data.signature) {
      const response = jsonError(req, {
        code: "BAD_REQUEST",
        message: "publicKey and signature are required for cryptographic verification.",
        status: 400,
      });
      recordApiResponse("/api/agents/:slug/claim/verify", req, response, startedAt);
      return response;
    }
  }

  const result = await runVerifier(
    method,
    agent,
    claim.verificationToken,
    user.email,
    {
      publicKey: parsed.data.publicKey,
      signature: parsed.data.signature,
    }
  );

  if (!result.verified) {
    const response = NextResponse.json(
      {
        success: false,
        verified: false,
        error: result.error ?? "Verification failed",
        message: "Verification did not pass. Make sure you've completed the verification steps and try again.",
      },
      { status: 200 }
    );
    applyRequestIdHeader(response, req);
    recordApiResponse("/api/agents/:slug/claim/verify", req, response, startedAt);
    return response;
  }

  const now = new Date();
  const tier = verificationTierForMethod(method);
  const verificationMetadata =
    method === "CRYPTO_SIGNATURE"
      ? {
          publicKey: parsed.data.publicKey,
          signature: parsed.data.signature,
        }
      : null;

  try {
    await db
      .update(agentClaims)
      .set({
        status: "APPROVED",
        resolvedTier: tier,
        verificationMetadata,
        verifiedAt: now,
        updatedAt: now,
      })
      .where(eq(agentClaims.id, claim.id));
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes('column "resolved_tier" does not exist') ||
        err.message.includes('column "verification_metadata" does not exist'))
    ) {
      await db
        .update(agentClaims)
        .set({
          status: "APPROVED",
          verifiedAt: now,
          updatedAt: now,
        })
        .where(eq(agentClaims.id, claim.id));
    } else {
      throw err;
    }
  }

  try {
    await db
      .update(agents)
      .set({
        claimedByUserId: user.id,
        claimedAt: now,
        claimStatus: "CLAIMED",
        verificationTier: tier,
        verificationMethod: method,
        updatedAt: now,
      })
      .where(eq(agents.id, agent.id));
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes('column "verification_tier" does not exist') ||
        err.message.includes('column "verification_method" does not exist'))
    ) {
      await db
        .update(agents)
        .set({
          claimedByUserId: user.id,
          claimedAt: now,
          claimStatus: "CLAIMED",
          updatedAt: now,
        })
        .where(eq(agents.id, agent.id));
    } else {
      throw err;
    }
  }

  const response = NextResponse.json({
    success: true,
    verified: true,
    status: "CLAIMED",
    message: "Congratulations! You are now the verified owner of this page.",
  });
  applyRequestIdHeader(response, req);
  recordApiResponse("/api/agents/:slug/claim/verify", req, response, startedAt);
  return response;
}
