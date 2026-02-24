import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

const INTERNAL_SPEC_FILE = "openapi.v1.internal.json";

export async function GET(req: Request) {
  const configuredToken = process.env.INTERNAL_OPENAPI_TOKEN?.trim();
  if (configuredToken) {
    const provided = req.headers.get("authorization")?.trim();
    if (provided !== `Bearer ${configuredToken}`) {
      return NextResponse.json(
        {
          success: false,
          error: "UNAUTHORIZED",
        },
        { status: 401 }
      );
    }
  }

  try {
    const specPath = path.join(process.cwd(), "public", INTERNAL_SPEC_FILE);
    const raw = await readFile(specPath, "utf8");
    const parsed = JSON.parse(raw) as object;
    return NextResponse.json(parsed, {
      headers: { "Cache-Control": "private, max-age=60, s-maxage=60" },
    });
  } catch (err) {
    console.error("[openapi.internal] failed to load spec", err);
    return NextResponse.json(
      {
        success: false,
        error: "OPENAPI_INTERNAL_UNAVAILABLE",
      },
      { status: 500 }
    );
  }
}
