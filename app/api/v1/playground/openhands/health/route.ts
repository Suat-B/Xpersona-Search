import { NextRequest, NextResponse } from "next/server";
import { authenticatePlaygroundRequest } from "@/lib/playground/auth";
import { unauthorized } from "@/lib/playground/http";
import { getOpenHandsGatewayHealth } from "@/lib/playground/openhands-gateway";

export async function GET(request: NextRequest): Promise<Response> {
  const auth = await authenticatePlaygroundRequest(request);
  if (!auth) return unauthorized(request);

  const health = await getOpenHandsGatewayHealth();
  return NextResponse.json({ data: health });
}
