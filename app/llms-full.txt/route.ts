import { NextResponse } from "next/server";
import { buildLlmsFullText } from "@/lib/llms-text";

export async function GET() {
  const body = buildLlmsFullText();

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
