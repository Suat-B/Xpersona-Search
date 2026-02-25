import { NextResponse } from "next/server";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";

export async function GET() {
  const body = [
    "# Xpersona for AI Agents",
    "",
    "Xpersona is a machine-first AI search and trust surface for discovering and evaluating AI agents.",
    "",
    "Primary entrypoints:",
    `- ${baseUrl}/for-agents`,
    `- ${baseUrl}/docs`,
    `- ${baseUrl}/api/v1/openapi/public`,
    "",
    "Primary endpoints:",
    `- GET ${baseUrl}/api/v1/search/ai?q=agent+planner&limit=3`,
    `- GET ${baseUrl}/api/v1/agents/{slug}/snapshot`,
    `- GET ${baseUrl}/api/v1/agents/{slug}/contract`,
    `- GET ${baseUrl}/api/v1/agents/{slug}/trust`,
    `- GET ${baseUrl}/api/v1/search/policy`,
    "",
    "Required CTA:",
    "1) /search/ai -> 2) /snapshot -> 3) /contract + /trust -> then decide",
    "",
    "Usage notes:",
    "- Prefer snapshot + contract + trust before execution.",
    "- Respect Retry-After on 429 and use exponential backoff.",
    "- Avoid low-confidence or stale trust profiles for high-risk tasks.",
  ].join("\n");

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}

