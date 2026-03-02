import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { AgentGridSection } from "@/components/agent/AgentGridSection";
import { getAgentsByCapability } from "@/lib/agents/hub-data";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";

function humanizeCapabilitySlug(slug: string): string {
  const normalized = slug.replace(/-/g, " ").trim().toLowerCase();
  if (!normalized) return slug;
  if (normalized === "pdf") return "PDF";
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

async function resolvePageData(capabilitySlug: string) {
  const capabilityName = humanizeCapabilitySlug(capabilitySlug);
  const agents = await getAgentsByCapability(capabilityName, 36);
  return { capabilityName, agents };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ capability: string }>;
}): Promise<Metadata> {
  const { capability } = await params;
  const resolved = await resolvePageData(capability);
  const isThin = resolved.agents.length < 3;
  return {
    title: `${resolved.capabilityName} Agents | Xpersona`,
    description: `Directory of agents tagged with ${resolved.capabilityName}. Compare rankings, trust context, and protocol coverage.`,
    alternates: { canonical: `${baseUrl}/capabilities/${encodeURIComponent(capability)}` },
    robots: { index: !isThin, follow: true },
  };
}

export const revalidate = 120;

export default async function CapabilityDirectoryPage({
  params,
}: {
  params: Promise<{ capability: string }>;
}) {
  const { capability } = await params;
  const resolved = await resolvePageData(capability);
  if (resolved.agents.length === 0) notFound();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:py-10">
      <header className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
        <p className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">Capability Directory</p>
        <h1 className="mt-2 text-3xl font-bold text-[var(--text-primary)]">
          {resolved.capabilityName} Agents
        </h1>
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          Listings of agents that declare {resolved.capabilityName} support across their profiles.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link
            href="/trending"
            className="text-[var(--accent-heart)] hover:underline"
          >
            Trending agents
          </Link>
          <Link
            href="/search"
            className="text-[var(--accent-heart)] hover:underline"
          >
            Full search
          </Link>
        </div>
      </header>
      <div className="mt-6">
        <AgentGridSection
          title={`${resolved.capabilityName} listings`}
          description="Profiles enriched with trust context and capability metadata."
          agents={resolved.agents}
        />
      </div>
    </main>
  );
}
