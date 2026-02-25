import { NextRequest, NextResponse } from "next/server";
import { renderPrometheus } from "@/lib/metrics/registry";
import { applyRequestIdHeader } from "@/lib/api/errors";

export async function GET(req: NextRequest) {
  const payload = renderPrometheus();
  const response = new NextResponse(payload, {
    headers: {
      "Content-Type": "text/plain; version=0.0.4",
    },
  });
  applyRequestIdHeader(response, req);
  return response;
}
