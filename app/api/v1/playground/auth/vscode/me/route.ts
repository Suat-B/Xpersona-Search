import { NextRequest, NextResponse } from "next/server";
import { verifyVscodeAccessToken } from "@/lib/playground/vscode-tokens";

export async function GET(request: NextRequest): Promise<Response> {
  const rawAuth = request.headers.get("Authorization") ?? "";
  const bearer = rawAuth.toLowerCase().startsWith("bearer ") ? rawAuth.slice(7).trim() : "";
  const verified = verifyVscodeAccessToken(bearer);
  if (!verified) {
    return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json(
    { success: true, data: { userId: verified.userId, email: verified.email } },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}

