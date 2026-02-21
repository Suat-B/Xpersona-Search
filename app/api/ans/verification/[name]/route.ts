/**
 * GET /api/ans/verification/[name]
 * Returns verification instructions for an ANS domain (DNS TXT, card URL).
 * Used by register success page. Domain must be ACTIVE or PENDING_VERIFICATION.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ansDomains } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateDnsTxtRecord } from "@/lib/ans-crypto";
import { ANS_TLD } from "@/lib/ans-validator";

const BASE_URL = process.env.NEXTAUTH_URL ?? "https://xpersona.co";

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
      .select({ publicKey: ansDomains.publicKey, status: ansDomains.status })
      .from(ansDomains)
      .where(eq(ansDomains.name, normalizedName))
      .limit(1);

    if (!domain) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    if (
      domain.status !== "ACTIVE" &&
      domain.status !== "PENDING_VERIFICATION"
    ) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    const fullDomain = `${normalizedName}.${ANS_TLD}`;
    const dnsTxtRecord = domain.publicKey
      ? generateDnsTxtRecord(domain.publicKey)
      : null;
    const txtRecordName = `_agent.${fullDomain}`;
    const cardUrl = `${BASE_URL}/api/ans/card/${normalizedName}`;

    return NextResponse.json({
      fullDomain,
      cardUrl,
      dnsTxtRecord,
      txtRecordName,
      instructions: [
        "Your domain is active.",
        `Agent Card: ${cardUrl}`,
        dnsTxtRecord
          ? `Add TXT record for verification: ${txtRecordName} TXT "${dnsTxtRecord}"`
          : "Add TXT record when public key is available.",
      ],
    });
  } catch (err) {
    console.error("[ANS verification]", err);
    return NextResponse.json(
      { error: "Service temporarily unavailable" },
      { status: 500 }
    );
  }
}
