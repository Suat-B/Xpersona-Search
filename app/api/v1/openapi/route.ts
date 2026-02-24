import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  url.pathname = "/api/v1/openapi/public";
  return NextResponse.redirect(url, 307);
}
