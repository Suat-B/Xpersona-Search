import { NextResponse } from "next/server";
import { buildLlmsText } from "@/lib/llms-text";

export async function GET() {
  const body = buildLlmsText();

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
