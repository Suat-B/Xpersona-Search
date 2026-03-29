import Link from "next/link";
import { headers } from "next/headers";

type SearchAgent = {
  id: string;
  name: string;
  slug: string;
  protocols: string[];
  claimStatus?: string;
  verificationTier?: "NONE" | "BRONZE" | "SILVER" | "GOLD";
  contentMeta?: { lastReviewedAt?: string | null };
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
  };
}

function hasMcpProtocol(agent: SearchAgent): boolean {
  return agent.protocols.some((p) => p.trim().toUpperCase() === "MCP");
}

function isVerified(agent: SearchAgent): boolean {
  if (agent.claimStatus === "CLAIMED") return true;
  if (agent.verificationTier && agent.verificationTier !== "NONE") return true;
  return false;
}

function formatFreshness(agent: SearchAgent) {
  const updatedAt = agent.contentMeta?.lastReviewedAt;
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
  return "Freshness: Recently indexed";
}

function fillToSize(items: SearchAgent[], pool: SearchAgent[], size: number): SearchAgent[] {
  const picked = [...items];
  if (picked.length >= size) return picked.slice(0, size);
  for (const item of pool) {
    if (picked.length >= size) break;
    if (picked.some((p) => p.id === item.id)) continue;
    picked.push(item);
  }
  return picked.slice(0, size);
}

async function fetchRecentAgents(): Promise<SearchAgent[]> {
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/v1/search?sort=freshness&limit=10`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) return [];
  const payload = (await res.json()) as SearchPayload | ApiEnvelope<SearchPayload>;
  const data = unwrapEnvelope<SearchPayload>(payload);
  return (data?.results ?? []).map(normalizeAgent);
}

export async function RecentActivityHF() {
  const results = await fetchRecentAgents();
  const newAgents = results.filter((item) => !hasMcpProtocol(item));
  const toolPacks = results.filter(hasMcpProtocol);
  const verified = results.filter(isVerified);
  const fallbackPool = results.length > 0 ? results : [];

  const columns = [
    {
      title: "New agents added",
      items: fillToSize(newAgents, fallbackPool, 5),
    },
    {
      title: "New tool packs indexed",
      items: fillToSize(toolPacks, fallbackPool, 5),
    },
    {
      title: "Latest verified agents",
      items: fillToSize(verified, fallbackPool, 5),
    },
  ] as const;

  return (
    <div className="w-full bg-white py-12 sm:py-16">
      <div className="mx-auto w-full max-w-[1260px] px-4 sm:px-6">
        <div className="mb-8 text-center">
          <div className="text-xs uppercase tracking-[0.35em] text-black/45">
            Recent additions
          </div>
          <div className="mt-3 text-2xl font-semibold text-black sm:text-3xl">
            Activity across the ecosystem
          </div>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {columns.map((column) => (
            <div key={column.title} className="space-y-4">
              <div className="text-sm font-semibold text-black/70">
                {column.title}
              </div>
              <div className="space-y-3">
                {column.items.map((agent) => (
                  <Link
                    key={agent.id}
                    href={`/agent/${agent.slug}`}
                    className="flex min-h-[56px] items-center rounded-lg border border-black/10 bg-white px-3 py-1.5 shadow-[0_10px_28px_rgba(15,23,42,0.06)] transition hover:border-black/20 hover:shadow-[0_14px_32px_rgba(15,23,42,0.09)]"
                  >
                    <div className="flex w-full items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-black">
                          {agent.name}
                        </div>
                        <div className="mt-1 text-[11px] text-black/55">
                          {formatFreshness(agent)}
                        </div>
                      </div>
                      <div className="text-[11px] text-black/55">
                        Fresh
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
