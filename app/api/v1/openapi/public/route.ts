import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

const PUBLIC_SPEC_FILE = "openapi.v1.public.json";

export async function GET() {
  try {
    const specPath = path.join(process.cwd(), "public", PUBLIC_SPEC_FILE);
    const raw = await readFile(specPath, "utf8");
    const parsed = JSON.parse(raw) as object;
    return NextResponse.json(parsed, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=60" },
    });
  } catch (err) {
    console.error("[openapi.public] failed to load spec", err);
    return NextResponse.json(
      {
        success: false,
        error: "OPENAPI_PUBLIC_UNAVAILABLE",
      },
      { status: 500 }
    );
  }
}
