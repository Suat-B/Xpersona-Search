import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const base = request.headers.get("x-forwarded-host")
    ? `${request.headers.get("x-forwarded-proto") ?? "https"}://${request.headers.get("x-forwarded-host")}`
    : process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return NextResponse.redirect(new URL("/docs", base), 302);
}
