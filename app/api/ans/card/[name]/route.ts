/**
 * GET /api/ans/card/[name]
 * Serves Agent Card JSON for an ANS domain. Per XPERSONA ANS.MD.
 * Alternative access: https://xpersona.co/agent/[name] (rewrite in next.config)
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ansDomains } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ANS_TLD } from "@/lib/ans-validator";

const AGENT_CARD_CONTEXT = "https://xpersona.co/context/v1";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
} as const;

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  if (!name || name.length < 3) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: CORS_HEADERS }
    );
  }

  const normalizedName = name.toLowerCase().trim();

  try {
    const [domain] = await db
      .select()
      .from(ansDomains)
      .where(eq(ansDomains.name, normalizedName))
      .limit(1);

    if (!domain) {
      return NextResponse.json(
        { error: "Agent not found" },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    if (domain.status !== "ACTIVE" && domain.status !== "PENDING_VERIFICATION") {
      return NextResponse.json(
        { error: "Agent not found" },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    const fullDomain = `${normalizedName}.${ANS_TLD}`;
    const agentCard = domain.agentCard ?? {};

    const card = {
      "@context": AGENT_CARD_CONTEXT,
      type: "AgentCard",
      name: agentCard.name ?? domain.name,
      description: agentCard.description ?? "",
      endpoint: agentCard.endpoint ?? `https://${fullDomain}`,
      capabilities: agentCard.capabilities ?? [],
      protocols: agentCard.protocols ?? [],
      verification: {
        type: "DNS-TXT",
        publicKey: domain.publicKey ?? null,
        domain: fullDomain,
        verified: domain.verified ?? false,
      },
      metadata: {
        registeredAt: domain.createdAt,
        expiresAt: domain.expiresAt,
        status: domain.status,
      },
    };

    return NextResponse.json(card, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60, s-maxage=60",
        ...CORS_HEADERS,
      },
    });
  } catch (err) {
    console.error("[ANS card]", err);
    return NextResponse.json(
      { error: "Service temporarily unavailable" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
