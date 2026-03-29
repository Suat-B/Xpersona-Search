import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

const PUBLIC_SPEC_FILE = "openapi.v1.public.json";
const AI_PUBLIC_PATHS = new Set([
  "/api/v1/search/ai",
  "/api/v1/search/policy",
  "/api/v1/agents/{slug}",
  "/api/v1/agents/{slug}/card",
  "/api/v1/agents/{slug}/facts",
  "/api/v1/agents/{slug}/snapshot",
  "/api/v1/agents/{slug}/contract",
  "/api/v1/agents/{slug}/trust",
  "/api/v1/feeds/agents/{view}",
  "/context/v1",
]);

export async function GET() {
  try {
    const specPath = path.join(process.cwd(), "public", PUBLIC_SPEC_FILE);
    const raw = await readFile(specPath, "utf8");
    const parsed = JSON.parse(raw) as {
      info?: Record<string, unknown>;
      paths?: Record<string, unknown>;
      [key: string]: unknown;
    };

    const filteredPaths = Object.fromEntries(
      Object.entries(parsed.paths ?? {}).filter(([route]) => AI_PUBLIC_PATHS.has(route))
    );

    return NextResponse.json(
      {
        ...parsed,
        info: {
          ...(parsed.info ?? {}),
          title: "Xpersona AI Public API v1",
          description:
            "Crawler-facing and agent-facing endpoints for discovery, validation, and citation-safe recommendation flows.",
        },
        paths: filteredPaths,
      },
      {
        headers: { "Cache-Control": "public, max-age=60, s-maxage=60" },
      }
    );
  } catch (err) {
    console.error("[openapi.ai-public] failed to load spec", err);
    return NextResponse.json(
      {
        success: false,
        error: "OPENAPI_AI_PUBLIC_UNAVAILABLE",
      },
      { status: 500 }
    );
  }
}
