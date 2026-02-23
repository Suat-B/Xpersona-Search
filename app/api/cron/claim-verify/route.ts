/**
 * Vercel Cron: Agent claim verification.
 * Runs every 15 min, checks PENDING claims whose verification method is automated,
 * runs the appropriate verifier, and auto-approves or expires stale claims.
 * Secured by CRON_SECRET (Bearer token).
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agentClaims, agents } from "@/lib/db/schema";
import { and, eq, gt, lt } from "drizzle-orm";
import { runVerifier } from "@/lib/claim/verifiers";
import type { VerificationMethod } from "@/lib/claim/verification-methods";

const MAX_CLAIMS_PER_RUN = 30;
const AUTOMATED_METHODS: Set<string> = new Set([
  "GITHUB_FILE",
  "NPM_KEYWORD",
  "PYPI_KEYWORD",
  "DNS_TXT",
  "META_TAG",
  "EMAIL_MATCH",
]);

function isCronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  try {
    const expiredCount = await db
      .update(agentClaims)
      .set({ status: "EXPIRED", updatedAt: now })
      .where(
        and(eq(agentClaims.status, "PENDING"), lt(agentClaims.expiresAt, now))
      );

    const pendingClaims = await db
      .select()
      .from(agentClaims)
      .where(
        and(
          eq(agentClaims.status, "PENDING"),
          gt(agentClaims.expiresAt, now)
        )
      )
      .limit(MAX_CLAIMS_PER_RUN);

    const automatedClaims = pendingClaims.filter((c) =>
      AUTOMATED_METHODS.has(c.verificationMethod)
    );

    let verified = 0;
    let failed = 0;

    for (const claim of automatedClaims) {
      const [agent] = await db
        .select()
        .from(agents)
        .where(eq(agents.id, claim.agentId))
        .limit(1);

      if (!agent) continue;

      try {
        const result = await runVerifier(
          claim.verificationMethod as VerificationMethod,
          agent,
          claim.verificationToken
        );

        if (result.verified) {
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
              claimedByUserId: claim.userId,
              claimedAt: now,
              claimStatus: "CLAIMED",
              updatedAt: now,
            })
            .where(eq(agents.id, claim.agentId));

          verified++;
        } else {
          failed++;
        }
      } catch (err) {
        console.error(
          `[cron claim-verify] Error verifying claim ${claim.id}:`,
          err
        );
        failed++;
      }
    }

    return NextResponse.json({
      ok: true,
      checked: automatedClaims.length,
      verified,
      failed,
      totalPending: pendingClaims.length,
    });
  } catch (err) {
    console.error("[cron claim-verify]", err);
    return NextResponse.json(
      { error: "Internal error", ok: false },
      { status: 500 }
    );
  }
}
