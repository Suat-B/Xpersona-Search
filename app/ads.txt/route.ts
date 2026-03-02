import { NextResponse } from "next/server";

export async function GET() {
  const body = "google.com, pub-6090164906593135, DIRECT, f08c47fec0942fa0\n";
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
