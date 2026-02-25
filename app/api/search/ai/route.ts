import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyRequestIdHeader, jsonError } from "@/lib/api/errors";
import { recordApiResponse } from "@/lib/metrics/record";
import { fetchWithTimeout } from "@/lib/api/fetch-timeout";

const SearchAiSchema = z.object({
  q: z.string().trim().min(2).max(500),
  protocols: z.string().optional(),
  capabilities: z.string().optional(),
  minSafety: z.coerce.number().min(0).max(100).optional(),
  minRank: z.coerce.number().min(0).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(10).default(5),
});

type AiTopAgent = {
  id: string;
  name: string;
  slug: string;
  why: string;
  trust: number | null;
  protocols?: string[] | null;
  capabilities?: string[] | null;
};

type UpstreamErrorPayload = {
  error?: {
    code?: string;
    message?: string;
    retryAfterMs?: number;
  };
};

function buildWhy(agent: Record<string, unknown>): string {
  const reasons: string[] = [];
  const safety = typeof agent.safetyScore === "number" ? agent.safetyScore : null;
  const rank = typeof agent.overallRank === "number" ? agent.overallRank : null;
  const trust = (agent.trust as Record<string, unknown> | null) ?? null;
  const handshake = typeof trust?.handshakeStatus === "string" ? trust.handshakeStatus : null;

  if (safety != null) reasons.push(`safety ${Math.round(safety)}/100`);
  if (rank != null) reasons.push(`rank ${Math.round(rank)}/100`);
  if (handshake && handshake !== "UNKNOWN") reasons.push(`trust ${handshake.toLowerCase()}`);

  const description = typeof agent.description === "string" ? agent.description.trim() : "";
  if (description.length > 0) {
    const shortDescription = description.length > 120 ? `${description.slice(0, 117)}...` : description;
    reasons.push(shortDescription);
  }

  if (reasons.length === 0) return "Relevant match for the request.";
  return reasons.slice(0, 3).join(" | ");
}

function normalizeTrust(agent: Record<string, unknown>): number | null {
  const trust = (agent.trust as Record<string, unknown> | null) ?? null;
  const raw = typeof trust?.reputationScore === "number" ? trust.reputationScore : null;
  if (raw == null || !Number.isFinite(raw)) return null;
  if (raw <= 1 && raw >= 0) return Number(raw.toFixed(3));
  return Number(Math.max(0, Math.min(1, raw / 100)).toFixed(3));
}

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  const parsed = SearchAiSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    const response = jsonError(req, {
      code: "BAD_REQUEST",
      message: "Invalid query params",
      status: 400,
      details: parsed.error.flatten(),
    });
    recordApiResponse("/api/search/ai", req, response, startedAt);
    return response;
  }

  const params = parsed.data;
  const searchParams = new URLSearchParams();
  searchParams.set("q", params.q);
  searchParams.set("fields", "compact");
  searchParams.set("intent", "discover");
  searchParams.set("limit", String(params.limit));
  if (params.protocols) searchParams.set("protocols", params.protocols);
  if (params.capabilities) searchParams.set("capabilities", params.capabilities);
  if (typeof params.minSafety === "number") searchParams.set("minSafety", String(params.minSafety));
  if (typeof params.minRank === "number") searchParams.set("minRank", String(params.minRank));

  const upstreamUrl = `${req.nextUrl.origin}/api/v1/search?${searchParams.toString()}`;
  try {
    const upstream = await fetchWithTimeout(upstreamUrl, { method: "GET", headers: { accept: "application/json" } }, 6000);
    const body = (await upstream.json()) as
      | { results?: Array<Record<string, unknown>>; didYouMean?: string | null }
      | UpstreamErrorPayload;
    if (!upstream.ok) {
      const upstreamError = "error" in body ? body.error : undefined;
      const retryAfterMs =
        typeof upstreamError?.retryAfterMs === "number"
          ? upstreamError.retryAfterMs
          : upstream.status === 429
            ? 60_000
            : undefined;
      const response = jsonError(req, {
        code:
          typeof upstreamError?.code === "string" && upstreamError.code.length > 0
            ? upstreamError.code
            : "SEARCH_UNAVAILABLE",
        message:
          typeof upstreamError?.message === "string" && upstreamError.message.length > 0
            ? upstreamError.message
            : "Unable to complete AI-mode search",
        status: upstream.status >= 500 ? 503 : upstream.status,
        retryable: upstream.status >= 500 || upstream.status === 429,
        retryAfterMs,
      });
      recordApiResponse("/api/search/ai", req, response, startedAt);
      return response;
    }

    const successBody = body as { results?: Array<Record<string, unknown>>; didYouMean?: string | null };
    const results = Array.isArray(successBody.results) ? successBody.results : [];
    const topAgents: AiTopAgent[] = results.slice(0, params.limit).map((agent) => ({
      id: String(agent.id ?? ""),
      name: String(agent.name ?? "Unknown"),
      slug: String(agent.slug ?? ""),
      why: buildWhy(agent),
      trust: normalizeTrust(agent),
      protocols: Array.isArray(agent.protocols) ? (agent.protocols as string[]) : null,
      capabilities: Array.isArray(agent.capabilities) ? (agent.capabilities as string[]) : null,
    }));

    const summary =
      topAgents.length > 0
        ? `Found ${topAgents.length} high-signal agent${topAgents.length === 1 ? "" : "s"} for "${params.q}".`
        : `No direct matches for "${params.q}".`;

    const response = NextResponse.json({
      summary,
      topAgents,
      didYouMean: successBody.didYouMean ?? null,
      query: params.q,
    });
    applyRequestIdHeader(response, req);
    recordApiResponse("/api/search/ai", req, response, startedAt);
    return response;
  } catch {
    const response = jsonError(req, {
      code: "SEARCH_TIMEOUT",
      message: "AI-mode search timed out",
      status: 504,
      retryable: true,
      retryAfterMs: 2000,
    });
    recordApiResponse("/api/search/ai", req, response, startedAt);
    return response;
  }
}
