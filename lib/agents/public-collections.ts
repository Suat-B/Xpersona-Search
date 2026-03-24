import { and, desc, eq, isNotNull, or, sql } from "drizzle-orm";
import type { HubAgent } from "@/lib/agents/hub-data";
import { getAgentsBySlugs } from "@/lib/agents/hub-data";
import { db } from "@/lib/db";
import {
  agentCapabilityContracts,
  agents,
} from "@/lib/db/schema";

export type PublicAgentFeedView =
  | "latest"
  | "benchmarked"
  | "security-reviewed"
  | "openapi-ready"
  | "recent-updates";

export interface PublicAgentFeedItem {
  slug: string;
  name: string;
  description: string | null;
  source: string;
  protocols: string[];
  capabilities: string[];
  url: string;
  updatedAt: string | null;
  whyIncluded: string;
}

export interface PublicAgentFeed {
  view: PublicAgentFeedView;
  title: string;
  description: string;
  items: PublicAgentFeedItem[];
}

export const PUBLIC_AGENT_FEED_META: Record<
  PublicAgentFeedView,
  { title: string; description: string }
> = {
  latest: {
    title: "Latest Agent Profiles",
    description: "Recently refreshed public agent summaries with fresh crawl-visible metadata.",
  },
  benchmarked: {
    title: "Benchmarked Agents",
    description: "Agents with public benchmark evidence, scores, or reliability suites.",
  },
  "security-reviewed": {
    title: "Security Reviewed Agents",
    description: "Agents with public trust, handshake, or verification evidence that crawlers can inspect.",
  },
  "openapi-ready": {
    title: "OpenAPI Ready Agents",
    description: "Agents with published schema references or machine-readable contract evidence.",
  },
  "recent-updates": {
    title: "Recently Updated Agents",
    description: "Agents with fresh releases, docs updates, benchmark refreshes, or trust refresh signals.",
  },
};

const OPTIONAL_TABLE_CACHE = new Map<string, boolean>();

function slugifyToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function humanizeToken(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function deriveVendorToken(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.toLowerCase().endsWith("github.com")) {
      const owner = parsed.pathname.split("/").filter(Boolean)[0];
      return owner ? slugifyToken(owner) : null;
    }
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const parts = hostname.split(".");
    if (parts.length === 0) return null;
    if (parts.length === 1) return slugifyToken(parts[0]);
    return slugifyToken(parts[parts.length - 2] ?? parts[0] ?? "");
  } catch {
    return null;
  }
}

async function hasOptionalTable(tableName: string): Promise<boolean> {
  if (OPTIONAL_TABLE_CACHE.has(tableName)) return OPTIONAL_TABLE_CACHE.get(tableName) ?? false;
  try {
    const result = await db.execute(sql`SELECT to_regclass(${`public.${tableName}`}) AS regclass`);
    const rows = (result as unknown as { rows?: Array<{ regclass?: string | null }> }).rows ?? [];
    const exists = Boolean(rows[0]?.regclass);
    OPTIONAL_TABLE_CACHE.set(tableName, exists);
    return exists;
  } catch {
    OPTIONAL_TABLE_CACHE.set(tableName, false);
    return false;
  }
}

async function getHubAgentsFromSlugRows(slugRows: Array<{ slug: string }>, limit: number): Promise<HubAgent[]> {
  const slugs = slugRows.map((row) => row.slug).filter(Boolean).slice(0, limit);
  if (slugs.length === 0) return [];
  return getAgentsBySlugs(slugs);
}

export async function getPublicAgentFeed(view: PublicAgentFeedView, limit = 24): Promise<PublicAgentFeed> {
  let agentsForFeed: HubAgent[] = [];

  switch (view) {
    case "latest":
    case "recent-updates": {
      const rows = await db
        .select({ slug: agents.slug })
        .from(agents)
        .where(and(eq(agents.status, "ACTIVE"), eq(agents.publicSearchable, true)))
        .orderBy(desc(agents.updatedAt), desc(agents.createdAt))
        .limit(limit);
      agentsForFeed = await getHubAgentsFromSlugRows(rows, limit);
      break;
    }
    case "benchmarked": {
      const rows = await db.execute(sql`
        SELECT a.slug
        FROM agent_benchmark_results abr
        INNER JOIN agents a ON a.id = abr.agent_id
        WHERE a.status = 'ACTIVE' AND a.public_searchable = true
        GROUP BY a.slug
        ORDER BY max(abr.created_at) DESC
        LIMIT ${limit}
      `);
      agentsForFeed = await getHubAgentsFromSlugRows(
        ((rows as unknown as { rows?: Array<{ slug: string }> }).rows ?? []).map((row) => ({
          slug: row.slug,
        })),
        limit
      );
      break;
    }
    case "openapi-ready": {
      const rows = await db
        .select({ slug: agents.slug })
        .from(agents)
        .innerJoin(agentCapabilityContracts, eq(agentCapabilityContracts.agentId, agents.id))
        .where(
          and(
            eq(agents.status, "ACTIVE"),
            eq(agents.publicSearchable, true),
            or(
              isNotNull(agentCapabilityContracts.inputSchemaRef),
              isNotNull(agentCapabilityContracts.outputSchemaRef)
            )
          )
        )
        .orderBy(desc(agentCapabilityContracts.updatedAt), desc(agents.updatedAt))
        .limit(limit);
      agentsForFeed = await getHubAgentsFromSlugRows(rows, limit);
      break;
    }
    case "security-reviewed": {
      if (await hasOptionalTable("agent_capability_handshakes")) {
        const rows = await db.execute(sql`
          SELECT a.slug
          FROM agent_capability_handshakes ach
          INNER JOIN agents a ON a.id = ach.agent_id
          WHERE a.status = 'ACTIVE' AND a.public_searchable = true
          GROUP BY a.slug
          ORDER BY max(ach.verified_at) DESC
          LIMIT ${limit}
        `);
        agentsForFeed = await getHubAgentsFromSlugRows(
          ((rows as unknown as { rows?: Array<{ slug: string }> }).rows ?? []).map((row) => ({
            slug: row.slug,
          })),
          limit
        );
      } else if (await hasOptionalTable("agent_reputation_snapshots")) {
        const rows = await db.execute(sql`
          SELECT a.slug
          FROM agent_reputation_snapshots ars
          INNER JOIN agents a ON a.id = ars.agent_id
          WHERE a.status = 'ACTIVE' AND a.public_searchable = true
          GROUP BY a.slug
          ORDER BY max(ars.computed_at) DESC
          LIMIT ${limit}
        `);
        agentsForFeed = await getHubAgentsFromSlugRows(
          ((rows as unknown as { rows?: Array<{ slug: string }> }).rows ?? []).map((row) => ({
            slug: row.slug,
          })),
          limit
        );
      }
      break;
    }
  }

  const meta = PUBLIC_AGENT_FEED_META[view];
  return {
    view,
    title: meta.title,
    description: meta.description,
    items: agentsForFeed.map((item) => ({
      slug: item.slug,
      name: item.name,
      description: item.description,
      source: item.source,
      protocols: item.protocols,
      capabilities: item.capabilities,
      url: `/agent/${encodeURIComponent(item.slug)}`,
      updatedAt: item.updatedAt,
      whyIncluded:
        view === "benchmarked"
          ? "Public benchmark evidence is available."
          : view === "security-reviewed"
            ? "Trust or verification evidence is available."
            : view === "openapi-ready"
              ? "Machine-readable schema or contract references are published."
              : view === "recent-updates"
                ? "Fresh releases, docs, or trust updates were observed."
                : "Recently updated crawl-visible metadata is available.",
    })),
  };
}

async function getVendorCandidateRows(limit = 360) {
  return db
    .select({
      slug: agents.slug,
      homepage: agents.homepage,
      url: agents.url,
    })
    .from(agents)
    .where(and(eq(agents.status, "ACTIVE"), eq(agents.publicSearchable, true)))
    .orderBy(desc(agents.overallRank), desc(agents.updatedAt))
    .limit(limit);
}

export async function getAgentsByVendorSlug(vendorSlug: string, limit = 30): Promise<HubAgent[]> {
  const normalized = slugifyToken(vendorSlug);
  const rows = await getVendorCandidateRows(500);
  return getHubAgentsFromSlugRows(
    rows
      .filter((row) => deriveVendorToken(row.homepage ?? row.url ?? null) === normalized)
      .map((row) => ({ slug: row.slug }))
      .slice(0, limit),
    limit
  );
}

export async function listPublicVendorSlugs(limit = 24): Promise<Array<{ slug: string; label: string }>> {
  const rows = await getVendorCandidateRows(400);
  const counts = new Map<string, { slug: string; label: string; count: number }>();
  for (const row of rows) {
    const slug = deriveVendorToken(row.homepage ?? row.url ?? null);
    if (!slug) continue;
    const existing = counts.get(slug);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(slug, { slug, label: humanizeToken(slug), count: 1 });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map(({ slug, label }) => ({ slug, label }));
}

export async function getAgentsByArtifactType(artifactType: string, limit = 30): Promise<HubAgent[]> {
  const normalized = slugifyToken(artifactType).replace(/json-schema/g, "schema");

  if (normalized === "openapi" || normalized === "schema") {
    const rows = await db
      .select({ slug: agents.slug })
      .from(agents)
      .innerJoin(agentCapabilityContracts, eq(agentCapabilityContracts.agentId, agents.id))
      .where(
        and(
          eq(agents.status, "ACTIVE"),
          eq(agents.publicSearchable, true),
          or(
            isNotNull(agentCapabilityContracts.inputSchemaRef),
            isNotNull(agentCapabilityContracts.outputSchemaRef)
          )
        )
      )
      .orderBy(desc(agentCapabilityContracts.updatedAt), desc(agents.updatedAt))
      .limit(limit);
    return getHubAgentsFromSlugRows(rows, limit);
  }

  const rows = await db.execute(sql`
    SELECT a.slug
    FROM agent_media_assets ama
    INNER JOIN agents a ON a.id = ama.agent_id
    WHERE
      a.status = 'ACTIVE'
      AND a.public_searchable = true
      AND ama.is_public = true
      AND ama.is_dead = false
      AND lower(coalesce(ama.artifact_type, '')) = ${normalized}
    GROUP BY a.slug
    ORDER BY max(ama.updated_at) DESC
    LIMIT ${limit}
  `);
  return getHubAgentsFromSlugRows(
    ((rows as unknown as { rows?: Array<{ slug: string }> }).rows ?? []).map((row) => ({
      slug: row.slug,
    })),
    limit
  );
}

export async function listPublicArtifactTypes(limit = 24): Promise<Array<{ slug: string; label: string }>> {
  const rows = await db.execute(sql`
    SELECT lower(coalesce(artifact_type, '')) AS artifact_type, count(*)::int AS count
    FROM agent_media_assets
    WHERE is_public = true AND is_dead = false AND artifact_type IS NOT NULL
    GROUP BY lower(coalesce(artifact_type, ''))
    ORDER BY count(*) DESC
    LIMIT ${limit}
  `);

  const items = ((rows as unknown as { rows?: Array<{ artifact_type: string }> }).rows ?? [])
    .filter((row) => row.artifact_type)
    .map((row) => ({
      slug: slugifyToken(row.artifact_type),
      label: humanizeToken(row.artifact_type),
    }));

  const hasSchemas = await db
    .select({ id: agents.id })
    .from(agents)
    .innerJoin(agentCapabilityContracts, eq(agentCapabilityContracts.agentId, agents.id))
    .where(
      and(
        eq(agents.status, "ACTIVE"),
        eq(agents.publicSearchable, true),
        or(
          isNotNull(agentCapabilityContracts.inputSchemaRef),
          isNotNull(agentCapabilityContracts.outputSchemaRef)
        )
      )
    )
    .limit(1);

  if (hasSchemas.length > 0 && !items.some((item) => item.slug === "openapi")) {
    items.unshift({ slug: "openapi", label: "OpenAPI" });
  }

  return items.slice(0, limit);
}

export function buildCollectionJsonLd(input: {
  baseUrl: string;
  title: string;
  description: string;
  pathname: string;
  agents: HubAgent[];
}) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: input.title,
        description: input.description,
        url: `${input.baseUrl}${input.pathname}`,
      },
      {
        "@type": "ItemList",
        name: input.title,
        itemListElement: input.agents.map((agent, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: `${input.baseUrl}/agent/${encodeURIComponent(agent.slug)}`,
          name: agent.name,
        })),
      },
    ],
  };
}
