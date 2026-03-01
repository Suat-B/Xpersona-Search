import Link from "next/link";
import { headers } from "next/headers";

type SearchAgent = {
  id: string;
  name: string;
  slug: string;
  protocols: string[];
  capabilities: string[];
  claimStatus?: string;
  verificationTier?: "NONE" | "BRONZE" | "SILVER" | "GOLD";
};

type HomePayload = {
  trending?: {
    agents?: SearchAgent[];
    toolPacks?: SearchAgent[];
  };
};

type ApiEnvelope<T> = { success?: boolean; data?: T };

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

function isVerified(agent: SearchAgent): boolean {
  if (agent.claimStatus === "CLAIMED") return true;
  if (agent.verificationTier && agent.verificationTier !== "NONE") return true;
  return false;
}

function hasMcpProtocol(agent: SearchAgent): boolean {
  return agent.protocols.some((p) => p.trim().toUpperCase() === "MCP");
}

function getInitials(name: string): string {
  const parts = name.split(" ").filter(Boolean);
  if (parts.length === 0) return "X";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return `${first}${last}`.toUpperCase();
}

function buildMeta(agent: SearchAgent): string {
  const protocols = agent.protocols.map((p) => p.trim()).filter(Boolean);
  const caps = agent.capabilities.map((c) => c.trim()).filter(Boolean);
  const protocolLabel = protocols.length ? `Protocols: ${protocols.slice(0, 2).join(", ")}` : null;
  const capLabel = caps.length ? `Capabilities: ${caps.slice(0, 2).join(", ")}` : null;
  return [protocolLabel, capLabel].filter(Boolean).join(" · ");
}

async function fetchHomePayload(): Promise<HomePayload | null> {
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/v1/home`, { next: { revalidate: 60 } });
  if (!res.ok) return null;
  const payload = (await res.json()) as HomePayload | ApiEnvelope<HomePayload>;
  return unwrapEnvelope<HomePayload>(payload);
}

export async function CommunityUsageHF() {
  const payload = await fetchHomePayload();
  const agents = (payload?.trending?.agents ?? []).map(normalizeAgent);
  const toolPacks = (payload?.trending?.toolPacks ?? []).map(normalizeAgent);
  const combined = [...agents, ...toolPacks];
  const unique = combined.filter(
    (item, index, self) => self.findIndex((other) => other.id === item.id) === index
  );
  const entries = unique.slice(0, 8);

  return (
    <section className="w-full bg-[#0b0f14] py-12 sm:py-16">
      <div className="mx-auto w-full max-w-[1260px] px-4 sm:px-6">
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <div className="text-balance text-sm text-white/60 text-center">
            Teams shipping agents and tool packs on Xpersona
          </div>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        </div>
        <div className="grid gap-3 text-left md:grid-cols-2 lg:grid-cols-4">
          {entries.map((entry) => {
            const meta = buildMeta(entry);
            const badge = hasMcpProtocol(entry) ? "Tool Pack" : "Agent";
            const status = isVerified(entry) ? "Verified" : "Indexed";
            return (
              <article key={entry.id} className="rounded-xl border border-white/10 bg-white/5 transition hover:border-white/20 hover:bg-white/10">
                <Link href={`/agent/${entry.slug}`} className="flex items-center overflow-hidden p-3">
                  <div className="mr-3 flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-white/10 text-xs font-semibold text-white/80">
                    {getInitials(entry.name)}
                  </div>
                  <div className="min-w-0 text-left leading-tight">
                    <div className="flex items-center gap-2">
                      <h4 className="truncate font-semibold text-white">{entry.name}</h4>
                      <span className="inline-block whitespace-nowrap rounded-md border border-white/10 bg-black/40 px-1.5 py-0.5 text-[10px] font-semibold text-white/80">
                        {badge}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-white/60 truncate leading-tight">
                      {meta || "Discovery graph listing"} · {status}
                    </div>
                  </div>
                </Link>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
