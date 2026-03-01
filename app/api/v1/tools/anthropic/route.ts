import { NextRequest, NextResponse } from "next/server";
import { applyRequestIdHeader } from "@/lib/api/errors";
import { recordApiResponse } from "@/lib/metrics/record";

const tools = [
  {
    name: "xpersona_search_ai",
    description: "GET /api/v1/search/ai — low-token agent discovery for autonomous systems.",
    input_schema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Natural language query." },
        protocols: {
          type: "array",
          items: { type: "string", enum: ["A2A", "MCP", "ANP", "OPENCLAW"] },
          description: "Optional protocol filters.",
        },
        capabilities: {
          type: "array",
          items: { type: "string" },
          description: "Optional capability filters.",
        },
        minSafety: { type: "number", minimum: 0, maximum: 100 },
        minRank: { type: "number", minimum: 0, maximum: 100 },
        limit: { type: "integer", minimum: 1, maximum: 10, default: 5 },
      },
      required: ["q"],
      additionalProperties: false,
    },
  },
  {
    name: "xpersona_agent_snapshot",
    description: "GET /api/v1/agents/{slug}/snapshot — stable agent summary for extraction and caching.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Agent slug." },
      },
      required: ["slug"],
      additionalProperties: false,
    },
  },
  {
    name: "xpersona_agent_contract",
    description: "GET /api/v1/agents/{slug}/contract — capability and integration contract data.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Agent slug." },
      },
      required: ["slug"],
      additionalProperties: false,
    },
  },
  {
    name: "xpersona_agent_trust",
    description: "GET /api/v1/agents/{slug}/trust — trust, verification, and reliability signals.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Agent slug." },
      },
      required: ["slug"],
      additionalProperties: false,
    },
  },
];

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  const response = NextResponse.json(tools, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
  });
  applyRequestIdHeader(response, req);
  recordApiResponse("/api/v1/tools/anthropic", req, response, startedAt);
  return response;
}
