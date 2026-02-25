import { NextRequest, NextResponse } from "next/server";
import { applyRequestIdHeader } from "@/lib/api/errors";

const startedAt = Date.now();

export async function GET(req: NextRequest) {
  const uptimeSeconds = Math.floor((Date.now() - startedAt) / 1000);
  const response = NextResponse.json({
    ok: true,
    status: "ok",
    uptimeSeconds,
    timestamp: new Date().toISOString(),
  });
  applyRequestIdHeader(response, req);
  return response;
}
