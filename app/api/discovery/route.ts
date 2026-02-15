/**
 * GET /api/discovery
 * Public discovery API for AI agents — no auth required.
 * Returns schema, triggers, actions, presets, game mechanics, and platform constants
 * so AI can build custom strategy systems with full metadata.
 */

import { NextResponse } from "next/server";
import { buildDiscoveryData, type DiscoverySection } from "@/lib/discovery-builder";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sectionParam = url.searchParams.get("section");
  const section: DiscoverySection =
    sectionParam === "strategy_builder" ||
    sectionParam === "game_mechanics" ||
    sectionParam === "platform"
      ? sectionParam
      : "all";

  const data = buildDiscoveryData(section);

  return NextResponse.json(
    { success: true, data },
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
    }
  );
}
