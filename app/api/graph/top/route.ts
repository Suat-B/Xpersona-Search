import { NextRequest, NextResponse } from "next/server";
import { fetchWithTimeout } from "@/lib/api/fetch-timeout";
import { applyRequestIdHeader, jsonError } from "@/lib/api/errors";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const params = new URLSearchParams();
  const capability = url.searchParams.get("capability");
  const budget = url.searchParams.get("budget");
  const cluster = url.searchParams.get("cluster");
  const taskType = url.searchParams.get("taskType");
  const tier = url.searchParams.get("tier");
  const limit = url.searchParams.get("limit");

  if (capability) params.set("capability", capability);
  if (budget) params.set("budget", budget);
  if (cluster) params.set("cluster", cluster);
  if (taskType) params.set("taskType", taskType);
  if (tier) params.set("tier", tier);
  if (limit) params.set("limit", limit);

  try {
    const upstream = await fetchWithTimeout(
      new URL(`/api/reliability/top?${params.toString()}`, req.nextUrl.origin),
      { method: "GET" },
      Number(process.env.API_UPSTREAM_TIMEOUT_MS ?? "8000")
    );
    const json = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return jsonError(req, {
        code: "UPSTREAM_ERROR",
        message: "Failed to fetch top agents",
        status: 502,
        details: json,
        retryable: true,
      });
    }
    const response = NextResponse.json(json);
    applyRequestIdHeader(response, req);
    return response;
  } catch (err) {
    return jsonError(req, {
      code: "UPSTREAM_ERROR",
      message: "Failed to fetch top agents",
      status: 502,
      details: process.env.NODE_ENV === "production" ? undefined : String(err),
      retryable: true,
    });
  }
}
