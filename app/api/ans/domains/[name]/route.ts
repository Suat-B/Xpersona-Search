/**
 * GET /api/ans/domains/[name]
 * Returns domain metadata for a registered ANS domain.
 * Per XPERSONA ANS PLAN1.MD router.get('/:name').
 * 404 if domain not found or status is EXPIRED.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ansDomains } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const CACHE_MAX_AGE = 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  if (!name || name.length < 3) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const normalizedName = name.toLowerCase().trim();

  try {
    const [domain] = await db
      .select({
        name: ansDomains.name,
        fullDomain: ansDomains.fullDomain,
        agentCard: ansDomains.agentCard,
        publicKey: ansDomains.publicKey,
        verified: ansDomains.verified,
        status: ansDomains.status,
        expiresAt: ansDomains.expiresAt,
        createdAt: ansDomains.createdAt,
      })
      .from(ansDomains)
      .where(eq(ansDomains.name, normalizedName))
      .limit(1);

    if (!domain) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    if (
      domain.status === "EXPIRED" ||
      domain.status === "SUSPENDED"
    ) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    return NextResponse.json(
      {
        name: domain.name,
        fullDomain: domain.fullDomain,
        agentCard: domain.agentCard ?? null,
        publicKey: domain.publicKey ?? null,
        verified: domain.verified ?? false,
        status: domain.status,
        expiresAt: domain.expiresAt,
        createdAt: domain.createdAt,
      },
      {
        headers: {
          "Cache-Control": `public, max-age=${CACHE_MAX_AGE}, s-maxage=${CACHE_MAX_AGE}`,
        },
      }
    );
  } catch (err) {
    console.error("[ANS domains]", err);
    return NextResponse.json(
      { error: "Service temporarily unavailable" },
      { status: 500 }
    );
  }
}
