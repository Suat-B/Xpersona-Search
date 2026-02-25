import { NextRequest, NextResponse } from "next/server";
import { getKpiSnapshot } from "@/lib/metrics/registry";
import { applyRequestIdHeader } from "@/lib/api/errors";

export async function GET(req: NextRequest) {
  const payload = getKpiSnapshot(10);
  const response = NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    kpi: payload,
  });
  applyRequestIdHeader(response, req);
  return response;
}

