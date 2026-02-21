/**
 * GET /context/v1
 * JSON-LD context for Agent Card. Referenced by @context: "https://xpersona.co/context/v1"
 * Enables JSON-LD consumers to resolve the context used in Agent Cards.
 */

import { NextResponse } from "next/server";

const AGENT_CARD_CONTEXT = {
  "@context": {
    "@version": 1.1,
    type: "@type",
    AgentCard: "https://xpersona.co/context/v1#AgentCard",
    name: "https://schema.org/name",
    description: "https://schema.org/description",
    endpoint: "https://schema.org/url",
    capabilities: "https://xpersona.co/context/v1#capabilities",
    protocols: "https://xpersona.co/context/v1#protocols",
    verification: "https://xpersona.co/context/v1#verification",
    metadata: "https://xpersona.co/context/v1#metadata",
    publicKey: "https://w3id.org/security#publicKey",
    domain: "https://schema.org/domain",
    verified: "https://schema.org/Boolean",
    registeredAt: "https://schema.org/dateCreated",
    expiresAt: "https://schema.org/expires",
    status: "https://schema.org/status",
  },
} as const;

export async function GET() {
  return NextResponse.json(AGENT_CARD_CONTEXT, {
    headers: {
      "Content-Type": "application/ld+json",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
