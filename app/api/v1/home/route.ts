import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api/contracts";
import { apiV1 } from "@/lib/api/url";
import { fetchWithTimeout } from "@/lib/api/fetch-timeout";
import { applyResponseMetaHeaders, getOrCreateRequestId } from "@/lib/api/request-meta";
import { recordApiResponse } from "@/lib/metrics/record";
import { buildTrendingCapabilities } from "@/lib/search/trending-capabilities";

type SearchAgent = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  protocols: string[];
  capabilities: string[];
  safetyScore: number | null;
  overallRank: number | null;
  popularityScore?: number | null;
};

type TrendingResponse = { trending?: string[] };
type SearchResponse = { results?: SearchAgent[] };
type ApiEnvelope<T> = { success?: boolean; data?: T };

function unwrapEnvelope<T>(payload: unknown): T | null {
  if (!payload || typeof payload !== "object") return payload as T;
  const record = payload as ApiEnvelope<T> & Record<string, unknown>;
  if (record.success === true && "data" in record) {
    return record.data ?? null;
  }
  return payload as T;
}

function normalizeAgent(item: SearchAgent): SearchAgent {
  return {
    ...item,
    protocols: Array.isArray(item.protocols) ? item.protocols : [],
    capabilities: Array.isArray(item.capabilities) ? item.capabilities : [],
  };
}

function hasMcpProtocol(agent: SearchAgent): boolean {
  return agent.protocols.some((p) => p.trim().toUpperCase() === "MCP");
}

function matchTrending(agent: SearchAgent, queries: string[]): boolean {
  if (queries.length === 0) return false;
  const haystack = `${agent.name} ${agent.description ?? ""}`.toLowerCase();
  return queries.some((q) => q.length > 1 && haystack.includes(q));
}

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  const requestId = getOrCreateRequestId(req);
  const headers = applyResponseMetaHeaders(new Headers(), requestId);
  headers.set("Cache-Control", "public, max-age=60, s-maxage=60, stale-while-revalidate=60");

  const trendingUrl = new URL(apiV1("search/trending"), req.nextUrl.origin);
  const searchUrl = new URL(apiV1("search"), req.nextUrl.origin);
  searchUrl.searchParams.set("sort", "popularity");
  searchUrl.searchParams.set("limit", "30");
  searchUrl.searchParams.set("intent", "discover");

  try {
    const [trendingRes, searchRes] = await Promise.all([
      fetchWithTimeout(trendingUrl, { method: "GET", headers: { accept: "application/json" } }, 6000),
      fetchWithTimeout(searchUrl, { method: "GET", headers: { accept: "application/json" } }, 6000),
    ]);

    const trendingPayload = (await trendingRes.json()) as TrendingResponse | ApiEnvelope<TrendingResponse>;
    const searchPayload = (await searchRes.json()) as SearchResponse | ApiEnvelope<SearchResponse>;

    const trendingData = unwrapEnvelope<TrendingResponse>(trendingPayload) ?? { trending: [] };
    const searchData = unwrapEnvelope<SearchResponse>(searchPayload) ?? { results: [] };

    const normalizedResults = (searchData.results ?? []).map(normalizeAgent);
    const trendingQueries = (trendingData.trending ?? []).map((q) => q.toLowerCase());
    const toolPackPool = normalizedResults.filter(hasMcpProtocol);
    const agentPool = normalizedResults.filter((item) => !hasMcpProtocol(item));
    const toolPackMatches = toolPackPool.filter((item) => matchTrending(item, trendingQueries));
    const agentMatches = agentPool.filter((item) => matchTrending(item, trendingQueries));
    const toolPacks = [...toolPackMatches, ...toolPackPool].filter((item, index, self) => {
      return self.findIndex((other) => other.id === item.id) === index;
    }).slice(0, 9);
    const agents = [...agentMatches, ...agentPool].filter((item, index, self) => {
      return self.findIndex((other) => other.id === item.id) === index;
    }).slice(0, 9);
    const capabilities = buildTrendingCapabilities(normalizedResults, 9);

    const response = ok(
      {
        trending: {
          agents,
          toolPacks,
          capabilities,
        },
      },
      { requestId, headers }
    );
    recordApiResponse("/api/v1/home", req, response, startedAt);
    return response;
  } catch (err) {
    const response = fail(
      {
        code: "UPSTREAM_ERROR",
        message: "Failed to load home aggregates",
        details: process.env.NODE_ENV === "production" ? undefined : String(err),
        retryable: true,
      },
      { requestId, status: 502, headers }
    );
    recordApiResponse("/api/v1/home", req, response, startedAt);
    return response;
  }
}
