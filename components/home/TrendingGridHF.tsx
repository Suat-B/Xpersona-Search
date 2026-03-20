import Link from "next/link";
import { headers } from "next/headers";
import {
  capabilityTokenToLabel,
  normalizeCapabilityToken,
} from "@/lib/search/capability-tokens";
import { buildTrendingCapabilities } from "@/lib/search/trending-capabilities";

type SearchAgent = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  protocols: string[];
  capabilities: string[];
  safetyScore: number | null;
  popularityScore?: number | null;
  overallRank?: number | null;
  contentMeta?: { lastReviewedAt?: string | null };
};

type CapabilitySummary = { name: string; count: number };

type HomePayload = {
  trending?: {
    agents?: SearchAgent[];
    toolPacks?: SearchAgent[];
    capabilities?: Array<{ name: string; count: number }>;
  };
};

type ApiEnvelope<T> = { success?: boolean; data?: T };

type SearchPayload = { results?: SearchAgent[] };

async function getBaseUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  if (host) return `${proto}://${host}`;
  return process.env.NEXTAUTH_URL ?? "http://localhost:3000";
}

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

function formatFreshness(item: SearchAgent) {
  const updatedAt = item.contentMeta?.lastReviewedAt;
  if (updatedAt) {
    const date = new Date(updatedAt);
    if (!Number.isNaN(date.getTime())) {
      const diffDays = Math.max(
        0,
        Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
      );
      return diffDays === 0 ? "Updated today" : `Updated ${diffDays}d ago`;
    }
  }
  const score = item.popularityScore ?? item.overallRank ?? item.safetyScore ?? 0;
  if (score >= 85) return "Freshness: High";
  if (score >= 60) return "Freshness: Medium";
  return "Freshness: Low";
}

function metricLabel(value: number | null | undefined) {
  if (value == null) return "—";
  return `${Math.round(value)}`;
}

async function fetchHomePayload(): Promise<HomePayload | null> {
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/v1/home`, { next: { revalidate: 60 } });
  if (!res.ok) return null;
  const payload = (await res.json()) as HomePayload | ApiEnvelope<HomePayload>;
  return unwrapEnvelope<HomePayload>(payload);
}

async function fetchFallbackSearch(): Promise<SearchAgent[]> {
  const baseUrl = await getBaseUrl();
  const res = await fetch(
    `${baseUrl}/api/v1/search?sort=popularity&limit=30&intent=discover`,
    { next: { revalidate: 60 } }
  );
  if (!res.ok) return [];
  const payload = (await res.json()) as SearchPayload | ApiEnvelope<SearchPayload>;
  const data = unwrapEnvelope<SearchPayload>(payload);
  return (data?.results ?? []).map(normalizeAgent);
}

export async function TrendingGridHF() {
  const payload = await fetchHomePayload();
  let agents = payload?.trending?.agents ?? [];
  let toolPacks = payload?.trending?.toolPacks ?? [];
  let capabilities = payload?.trending?.capabilities ?? [];

  if (agents.length === 0 || toolPacks.length === 0 || capabilities.length === 0) {
    const fallbackResults = await fetchFallbackSearch();
    if (agents.length === 0) {
      agents = fallbackResults.filter((item) => !hasMcpProtocol(item)).slice(0, 5);
    }
    if (toolPacks.length === 0) {
      toolPacks = fallbackResults.filter(hasMcpProtocol).slice(0, 5);
    }
    if (capabilities.length === 0) {
      capabilities = buildTrendingCapabilities(fallbackResults, 5);
    }
  }

  const columns = [
    { title: "Trending Agents", items: agents.slice(0, 5) },
    { title: "Trending Tool Packs", items: toolPacks.slice(0, 5) },
    { title: "Trending Capabilities", items: capabilities.slice(0, 5) },
  ] as const;
  const gradients = [
    "from-[#7c3aed] via-[#6d28d9] to-[#4f46e5]",
    "from-[#ec4899] via-[#f97316] to-[#f59e0b]",
    "from-[#f97316] via-[#f43f5e] to-[#ec4899]",
    "from-[#0ea5e9] via-[#14b8a6] to-[#22c55e]",
    "from-[#6366f1] via-[#8b5cf6] to-[#ec4899]",
  ] as const;

  return (
    <section className="w-full bg-[#0b0f14] py-12 sm:py-16">
      <div className="mx-auto w-full max-w-[1260px] px-4 sm:px-6">
        <div className="mb-8 text-center">
          <p className="text-xs uppercase tracking-[0.35em] text-white/50">
            Trending this week
          </p>
          <h2 className="mt-3 text-2xl sm:text-3xl font-semibold text-white">
            What the community is building
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {columns.map((column, columnIndex) => (
            <div key={column.title} className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white/80">{column.title}</h3>
              </div>
              <div className="space-y-3">
                {column.items.map((item, rowIndex) => {
                  const isAccent = columnIndex === 1;
                  const gradient = gradients[rowIndex % gradients.length];
                  const cardBase = `flex min-h-[56px] items-center rounded-lg border px-3 py-1.5 transition ${
                    isAccent
                      ? `border-transparent bg-gradient-to-r ${gradient} text-white shadow-[0_10px_28px_rgba(124,58,237,0.35)] hover:opacity-95`
                      : "border-white/10 bg-white/5 text-white hover:border-white/20"
                  }`;
                  if ("name" in item) {
                    const agent = item as SearchAgent;
                    const itemKey = agent.id || agent.slug || `${agent.name}-${rowIndex}`;
                    return (
                      <Link
                        key={`${columnIndex}-${itemKey}`}
                        href={`/agent/${agent.slug}`}
                        className={cardBase}
                      >
                        <div className="flex w-full items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white">
                              {agent.name}
                            </p>
                            <p className={`mt-1 text-[11px] ${isAccent ? "text-white/80" : "text-white/60"}`}>
                              {formatFreshness(agent)}
                            </p>
                          </div>
                          <div className={`flex items-center gap-2 text-[11px] ${isAccent ? "text-white/90" : "text-white/60"}`}>
                            <span
                              className={`rounded-full px-2 py-0.5 ${
                                isAccent ? "bg-white/15 text-white" : "border border-white/10 bg-white/5"
                              }`}
                            >
                              Pop {metricLabel(agent.popularityScore ?? agent.overallRank)}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 ${
                                isAccent ? "bg-white/15 text-white" : "border border-white/10 bg-white/5"
                              }`}
                            >
                              Safe {metricLabel(agent.safetyScore)}
                            </span>
                          </div>
                        </div>
                      </Link>
                    );
                  }
                  const cap = item as CapabilitySummary;
                  const freshness = cap.count >= 6 ? "Freshness: High" : cap.count >= 3 ? "Freshness: Medium" : "Freshness: Low";
                  const capKey = `${columnIndex}-${cap.name}-${rowIndex}`;
                  return (
                    <Link
                      key={capKey}
                      href={`/search?capabilities=${encodeURIComponent(normalizeCapabilityToken(cap.name))}`}
                      className={cardBase}
                    >
                      <div className="flex w-full items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white">
                            {cap.name}
                          </p>
                          <p className={`mt-1 text-[11px] ${isAccent ? "text-white/80" : "text-white/60"}`}>{freshness}</p>
                        </div>
                        <div className={`flex items-center gap-2 text-[11px] ${isAccent ? "text-white/90" : "text-white/60"}`}>
                          <span
                            className={`rounded-full px-2 py-0.5 ${
                              isAccent ? "bg-white/15 text-white" : "border border-white/10 bg-white/5"
                            }`}
                          >
                            Pop {cap.count}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 ${
                              isAccent ? "bg-white/15 text-white" : "border border-white/10 bg-white/5"
                            }`}
                          >
                            Safe —
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
