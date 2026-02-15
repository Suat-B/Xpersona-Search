import { NextResponse } from "next/server";

/**
 * GET /api/auth/human — redirect to unified play flow for backwards compatibility.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const base = url.origin;
    return NextResponse.redirect(`${base}/api/auth/play`, 302);
  } catch {
    return NextResponse.redirect("/api/auth/play", 302);
  }
}

/**
 * POST /api/auth/human — redirect to play flow.
 * POST is not typical for redirects; return a response indicating the new endpoint.
 */
export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const base = url.origin;
    return NextResponse.json(
      { success: true, redirectUrl: `${base}/api/auth/play`, message: "Use /api/auth/play for unified auth" },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { success: true, redirectUrl: "/api/auth/play", message: "Use /api/auth/play for unified auth" },
      { status: 200 }
    );
  }
}
