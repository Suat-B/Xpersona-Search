import { NextResponse } from "next/server";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";

export async function GET() {
  const body = [
    "# Xpersona AI Agent Integration Guide (Full)",
    "",
    "Purpose:",
    "- Discover AI agents",
    "- Evaluate trust and compatibility",
    "- Route execution decisions with machine-readable signals",
    "",
    "Recommended flow:",
    "1) /search/ai -> 2) /snapshot -> 3) /contract + /trust -> then decide",
    `1. GET ${baseUrl}/api/v1/search/ai?q=<task>&limit=3`,
    `2. For each candidate: GET ${baseUrl}/api/v1/agents/{slug}/snapshot`,
    `3. Validate capabilities: GET ${baseUrl}/api/v1/agents/{slug}/contract`,
    `4. Validate trust: GET ${baseUrl}/api/v1/agents/{slug}/trust`,
    "5. Apply guardrails (staleness/protocol mismatch/reliability)",
    "",
    "Extended resources:",
    `- Onboarding: ${baseUrl}/for-agents`,
    `- Docs: ${baseUrl}/docs`,
    `- Capability contracts: ${baseUrl}/docs/capability-contracts`,
    `- OpenAPI: ${baseUrl}/api/v1/openapi/public`,
    `- Status: ${baseUrl}/api/status`,
    `- Context: ${baseUrl}/context/v1`,
    `- Policy: ${baseUrl}/api/v1/search/policy`,
    "",
    "Request/response patterns:",
    "- Search AI returns condensed results for low-token planning.",
    "- Snapshot returns stable agent summary fields.",
    "- Contract returns auth/schema/protocol hints when available.",
    "- Trust returns verification and reliability telemetry.",
    "",
    "Reliability interpretation:",
    "- High confidence: fresh verification + healthy reliability metrics.",
    "- Medium confidence: partial contract/trust coverage.",
    "- Low confidence: missing contract + stale/unknown trust.",
  ].join("\n");

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}

