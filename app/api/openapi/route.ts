import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { parse } from "yaml";

/**
 * Serves the OpenAPI spec as JSON for reliable consumption by ReDoc/Swagger UI.
 * Parses public/openapi.yaml at runtime; avoids YAML parsing issues in browsers.
 */
export async function GET() {
  try {
    const specPath = join(process.cwd(), "public", "openapi.yaml");
    const raw = await readFile(specPath, "utf-8");
    const spec = parse(raw) as object;
    return NextResponse.json(spec, {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=60",
      },
    });
  } catch (err) {
    console.error("[openapi] Failed to load spec:", err);
    return NextResponse.json(
      { success: false, error: "Failed to load OpenAPI spec" },
      { status: 500 }
    );
  }
}
