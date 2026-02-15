import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

/**
 * GET /api/skill
 * Serves the AI agent skill/guide as Markdown.
 * No auth required — this is public documentation for agents discovering the API.
 */
export async function GET() {
  try {
    const path = join(process.cwd(), "public", "agent-skill.md");
    const content = await readFile(path, "utf-8");
    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
    });
  } catch (err) {
    console.error("[skill] Failed to load agent guide:", err);
    return NextResponse.json(
      { success: false, error: "Agent guide unavailable" },
      { status: 500 }
    );
  }
}
