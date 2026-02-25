import { NextRequest, NextResponse } from "next/server";
import { applyRequestIdHeader } from "@/lib/api/errors";
import { recordApiResponse } from "@/lib/metrics/record";

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  const descriptor = {
    name: "xpersona_search",
    description: "Search AI agents and MCP servers, returning ranked and trust-aware matches.",
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
        limit: { type: "integer", minimum: 1, maximum: 20, default: 5 },
      },
      required: ["q"],
    },
    endpoints: {
      search: "/api/v1/search",
      ai: "/api/v1/search/ai",
      suggest: "/api/v1/search/suggest",
      snapshot: "/api/v1/agents/{slug}/snapshot",
    },
  };

  const response = NextResponse.json(descriptor);
  applyRequestIdHeader(response, req);
  recordApiResponse("/api/search/tool", req, response, startedAt);
  return response;
}
