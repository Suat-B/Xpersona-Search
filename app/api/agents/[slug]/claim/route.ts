import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { agents, agentClaims, users } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getAuthUser } from "@/lib/auth-utils";
import { checkClaimInitRateLimit } from "@/lib/claim/rate-limit";
import { generateClaimToken } from "@/lib/claim/token";
import {
  getAvailableMethods,
  getInstructionsForMethod,
  type VerificationMethod,
} from "@/lib/claim/verification-methods";
import {
  buildPermanentAccountRequiredPayload,
  resolveUpgradeCallbackPath,
} from "@/lib/auth-flow";
import { applyRequestIdHeader, jsonError } from "@/lib/api/errors";
import { recordApiResponse } from "@/lib/metrics/record";

const CLAIM_EXPIRY_DAYS = 7;

const InitiateSchema = z.object({
  method: z.enum([
    "GITHUB_FILE",
    "NPM_KEYWORD",
    "PYPI_KEYWORD",
    "DNS_TXT",
    "META_TAG",
    "EMAIL_MATCH",
    "CRYPTO_SIGNATURE",
    "MANUAL_REVIEW",
  ]),
  notes: z.string().max(2000).optional(),
});

/**
 * POST /api/agents/[slug]/claim -- Initiate a claim on an agent page.
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
    recordApiResponse("/api/agents/:slug/claim", req, response, startedAt);
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
    recordApiResponse("/api/agents/:slug/claim", req, response, startedAt);
    return response;
  }

  const rateLimit = checkClaimInitRateLimit(user.id);
  if (!rateLimit.ok) {
    const response = jsonError(req, {
      code: "RATE_LIMITED",
      message: "Too many claim attempts. Try again later.",
      status: 429,
      retryAfterMs: (rateLimit.retryAfter ?? 60) * 1000,
    });
    recordApiResponse("/api/agents/:slug/claim", req, response, startedAt);
    return response;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    const response = jsonError(req, {
      code: "BAD_REQUEST",
      message: "Invalid JSON body",
      status: 400,
    });
    recordApiResponse("/api/agents/:slug/claim", req, response, startedAt);
    return response;
  }

  const parsed = InitiateSchema.safeParse(body);
  if (!parsed.success) {
    const response = jsonError(req, {
      code: "BAD_REQUEST",
      message: "Invalid request",
      status: 400,
      details: parsed.error.flatten(),
    });
    recordApiResponse("/api/agents/:slug/claim", req, response, startedAt);
    return response;
  }

  const { method, notes } = parsed.data;

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
    recordApiResponse("/api/agents/:slug/claim", req, response, startedAt);
    return response;
  }

  if (agent.claimStatus === "CLAIMED" && agent.claimedByUserId !== user.id) {
    const response = jsonError(req, {
      code: "CONFLICT",
      message: "This page is already claimed by another user",
      status: 409,
    });
    recordApiResponse("/api/agents/:slug/claim", req, response, startedAt);
    return response;
  }

  if (agent.claimedByUserId === user.id && agent.claimStatus === "CLAIMED") {
    const response = jsonError(req, {
      code: "CONFLICT",
      message: "You already own this page",
      status: 409,
    });
    recordApiResponse("/api/agents/:slug/claim", req, response, startedAt);
    return response;
  }

  const availableMethods = getAvailableMethods(agent);
  const methodAllowed = availableMethods.some((m) => m.method === method);
  if (!methodAllowed) {
    const response = jsonError(req, {
      code: "BAD_REQUEST",
      message: "Verification method not available for this agent",
      status: 400,
      details: { availableMethods: availableMethods.map((m) => m.method) },
    });
    recordApiResponse("/api/agents/:slug/claim", req, response, startedAt);
    return response;
  }

  const [existingPending] = await db
    .select({ id: agentClaims.id })
    .from(agentClaims)
    .where(
      and(
        eq(agentClaims.agentId, agent.id),
        eq(agentClaims.userId, user.id),
        eq(agentClaims.status, "PENDING")
      )
    )
    .limit(1);

  if (existingPending) {
    await db
      .update(agentClaims)
      .set({ status: "WITHDRAWN", updatedAt: new Date() })
      .where(eq(agentClaims.id, existingPending.id));
  }

  const token = generateClaimToken();
  const expiresAt = new Date(Date.now() + CLAIM_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const [insertedClaim] = await db
    .insert(agentClaims)
    .values({
      agentId: agent.id,
      userId: user.id,
      status: "PENDING",
      verificationMethod: method,
      verificationToken: token,
      verificationData: notes ? { notes } : null,
      expiresAt,
    })
    .returning({ id: agentClaims.id });

  if (agent.claimStatus === "UNCLAIMED") {
    await db
      .update(agents)
      .set({ claimStatus: "PENDING", updatedAt: new Date() })
      .where(eq(agents.id, agent.id));
  }

  const instructions = getInstructionsForMethod(
    method as VerificationMethod,
    token,
    agent
  );

  if (!insertedClaim?.id) {
    const response = jsonError(req, {
      code: "INTERNAL_ERROR",
      message: "CLAIM_CREATION_FAILED",
      status: 500,
    });
    recordApiResponse("/api/agents/:slug/claim", req, response, startedAt);
    return response;
  }

  const response = NextResponse.json({
    success: true,
    claimId: insertedClaim.id,
    method,
    token,
    instructions,
    expiresAt: expiresAt.toISOString(),
    availableMethods: availableMethods.map((m) => ({
      method: m.method,
      label: m.label,
      description: m.description,
      automated: m.automated,
    })),
  });
  applyRequestIdHeader(response, req);
  recordApiResponse("/api/agents/:slug/claim", req, response, startedAt);
  return response;
}

/**
 * GET /api/agents/[slug]/claim -- Check claim status and available methods.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const startedAt = Date.now();
  const { slug } = await params;

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
    recordApiResponse("/api/agents/:slug/claim", req, response, startedAt);
    return response;
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

    const authResult = await getAuthUser(req);
    if (!("error" in authResult)) {
      isOwner = authResult.user.id === agent.claimedByUserId;
    }
  }

  let pendingClaim = null;
  const authResult = await getAuthUser(req);
  if (!("error" in authResult)) {
    const [claim] = await db
      .select({
        id: agentClaims.id,
        method: agentClaims.verificationMethod,
        token: agentClaims.verificationToken,
        expiresAt: agentClaims.expiresAt,
        createdAt: agentClaims.createdAt,
      })
      .from(agentClaims)
      .where(
        and(
          eq(agentClaims.agentId, agent.id),
          eq(agentClaims.userId, authResult.user.id),
          eq(agentClaims.status, "PENDING")
        )
      )
      .limit(1);
    if (claim) {
      pendingClaim = claim;
    }
  }

  const availableMethods = getAvailableMethods(agent).map((m) => ({
    method: m.method,
    label: m.label,
    description: m.description,
    automated: m.automated,
  }));

  const response = NextResponse.json({
    claimStatus: agent.claimStatus,
    claimedAt: agent.claimedAt,
    claimedByName,
    isOwner,
    pendingClaim,
    availableMethods,
  });
  applyRequestIdHeader(response, req);
  recordApiResponse("/api/agents/:slug/claim", req, response, startedAt);
  return response;
}
