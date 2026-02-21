/**
 * Vercel Cron: ANS DNS verification.
 * Runs every 15 min, checks ACTIVE domains with verified=false,
 * polls _agent.{name}.agent.xpersona.co TXT, updates verified/verifiedAt on match.
 * Secured by CRON_SECRET (Bearer token).
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ansDomains } from "@/lib/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { verifyDomainByPublicKey } from "@/lib/ans-verify-dns";

const MAX_DOMAINS_PER_RUN = 50;

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

  try {
    const rows = await db
      .select({
        id: ansDomains.id,
        name: ansDomains.name,
        publicKey: ansDomains.publicKey,
      })
      .from(ansDomains)
      .where(
        and(
          eq(ansDomains.status, "ACTIVE"),
          eq(ansDomains.verified, false),
          isNotNull(ansDomains.publicKey)
        )
      )
      .limit(MAX_DOMAINS_PER_RUN);

    const domains = rows.filter(
      (r): r is { id: string; name: string; publicKey: string } =>
        r != null && r.publicKey != null
    );

    let verified = 0;
    const now = new Date();

    for (const d of domains) {
      const matches = await verifyDomainByPublicKey(d.name, d.publicKey);
      if (matches) {
        await db
          .update(ansDomains)
          .set({
            verified: true,
            verifiedAt: now,
            updatedAt: now,
          })
          .where(eq(ansDomains.id, d.id));
        verified++;
      }
    }

    return NextResponse.json({
      ok: true,
      checked: domains.length,
      verified,
    });
  } catch (err) {
    console.error("[cron ans-verify]", err);
    return NextResponse.json(
      { error: "Internal error", ok: false },
      { status: 500 }
    );
  }
}
