import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDerivedPublicAgentEvidencePack } from "@/lib/agents/public-facts";
import { db } from "@/lib/db";
import { agentChangeEvents, agentFacts, agents } from "@/lib/db/schema";

export interface MaterializeAgentEvidenceInput {
  slug?: string;
  agentId?: string;
}

export interface MaterializeAgentEvidenceOptions {
  now?: Date;
}

export interface MaterializeAgentEvidenceResult {
  agentId: string;
  slug: string;
  factsInserted: number;
  changeEventsInserted: number;
  generatedAt: string;
}

export interface NightlyCandidate {
  agentId: string;
  slug: string;
  reason: "recent" | "stale";
  updatedAt: string | null;
  lastMaterializedAt: string | null;
}

export interface SelectNightlyAgentCandidatesOptions {
  limit?: number;
  recentWindowHours?: number;
  staleAfterHours?: number;
  now?: Date;
}

function toDateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed);
}

function toIsoOrNull(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function normalizeFactSourceUrl(sourceUrl: string | null | undefined, fallback: string): string {
  const trimmed = (sourceUrl ?? "").trim();
  return trimmed || fallback;
}

function normalizeFactText(value: string | null | undefined, fallback: string): string {
  const trimmed = (value ?? "").trim();
  return trimmed || fallback;
}

function normalizeFactsForStorage(input: {
  agentId: string;
  fallbackSourceUrl: string;
  facts: Array<{
    factKey: string;
    category: string;
    label: string;
    value: string;
    href: string | null;
    sourceUrl: string;
    sourceType: string;
    confidence: string;
    observedAt: string | null;
    isPublic: boolean;
    metadata?: Record<string, unknown>;
  }>;
  now: Date;
}) {
  const seen = new Set<string>();
  const rows: Array<typeof agentFacts.$inferInsert> = [];

  for (const fact of input.facts) {
    const factKey = normalizeFactText(fact.factKey, "derived_fact")
      .toLowerCase()
      .replace(/\s+/g, "_")
      .slice(0, 255);
    const value = normalizeFactText(fact.value, "Unknown");
    const dedupeKey = `${factKey}::${value}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    rows.push({
      agentId: input.agentId,
      factKey,
      category: normalizeFactText(fact.category, "identity").slice(0, 32),
      label: normalizeFactText(fact.label, "Fact").slice(0, 255),
      value,
      href: fact.href ?? null,
      sourceUrl: normalizeFactSourceUrl(fact.sourceUrl, input.fallbackSourceUrl),
      sourceType: normalizeFactText(fact.sourceType, "derived").slice(0, 32),
      confidence: normalizeFactText(fact.confidence, "medium").slice(0, 16),
      observedAt: toDateOrNull(fact.observedAt),
      isPublic: Boolean(fact.isPublic),
      position: rows.length,
      metadata: fact.metadata ?? {},
      updatedAt: input.now,
      createdAt: input.now,
    });
  }

  return rows;
}

function normalizeEventsForStorage(input: {
  agentId: string;
  fallbackSourceUrl: string;
  events: Array<{
    eventType: string;
    title: string;
    description: string | null;
    href: string | null;
    sourceUrl: string | null;
    sourceType: string;
    confidence: string;
    observedAt: string | null;
    isPublic: boolean;
    metadata?: Record<string, unknown>;
  }>;
  now: Date;
}) {
  const seen = new Set<string>();
  const rows: Array<typeof agentChangeEvents.$inferInsert> = [];

  for (const event of input.events) {
    const eventType = normalizeFactText(event.eventType, "status_changed")
      .toLowerCase()
      .replace(/\s+/g, "_")
      .slice(0, 32);
    const title = normalizeFactText(event.title, "Evidence update").slice(0, 255);
    const observedAtIso = toIsoOrNull(event.observedAt);
    const dedupeKey = `${eventType}::${title}::${observedAtIso ?? ""}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    rows.push({
      agentId: input.agentId,
      eventType,
      title,
      description: event.description ?? null,
      href: event.href ?? null,
      sourceUrl: normalizeFactSourceUrl(event.sourceUrl, input.fallbackSourceUrl),
      sourceType: normalizeFactText(event.sourceType, "derived").slice(0, 32),
      confidence: normalizeFactText(event.confidence, "medium").slice(0, 16),
      observedAt: toDateOrNull(observedAtIso),
      isPublic: Boolean(event.isPublic),
      metadata: event.metadata ?? {},
      updatedAt: input.now,
      createdAt: input.now,
    });
  }

  return rows;
}

async function resolveAgentTarget(
  input: MaterializeAgentEvidenceInput
): Promise<{ id: string; slug: string } | null> {
  if (!input.agentId && !input.slug) return null;
  const rows = await db
    .select({
      id: agents.id,
      slug: agents.slug,
    })
    .from(agents)
    .where(
      and(
        eq(agents.status, "ACTIVE"),
        eq(agents.publicSearchable, true),
        input.agentId ? eq(agents.id, input.agentId) : eq(agents.slug, input.slug ?? "")
      )
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function materializeAgentEvidence(
  input: MaterializeAgentEvidenceInput,
  options?: MaterializeAgentEvidenceOptions
): Promise<MaterializeAgentEvidenceResult | null> {
  const target = await resolveAgentTarget(input);
  if (!target) return null;

  const pack = await getDerivedPublicAgentEvidencePack(target.slug);
  if (!pack) return null;

  const now = options?.now ?? new Date();
  const fallbackSourceUrl = pack.card.canonicalUrl;
  const factRows = normalizeFactsForStorage({
    agentId: target.id,
    fallbackSourceUrl,
    facts: pack.facts,
    now,
  });
  const eventRows = normalizeEventsForStorage({
    agentId: target.id,
    fallbackSourceUrl,
    events: pack.changeEvents,
    now,
  });

  await db.transaction(async (tx) => {
    await tx.delete(agentFacts).where(eq(agentFacts.agentId, target.id));
    await tx.delete(agentChangeEvents).where(eq(agentChangeEvents.agentId, target.id));
    if (factRows.length > 0) {
      await tx.insert(agentFacts).values(factRows);
    }
    if (eventRows.length > 0) {
      await tx.insert(agentChangeEvents).values(eventRows);
    }
  });

  return {
    agentId: target.id,
    slug: target.slug,
    factsInserted: factRows.length,
    changeEventsInserted: eventRows.length,
    generatedAt: now.toISOString(),
  };
}

type StaleRow = {
  agent_id: string;
  slug: string;
  updated_at: Date | null;
  last_materialized_at: Date | null;
};

function staleRowToCandidate(row: StaleRow): NightlyCandidate {
  return {
    agentId: row.agent_id,
    slug: row.slug,
    reason: "stale",
    updatedAt: toIsoOrNull(row.updated_at),
    lastMaterializedAt: toIsoOrNull(row.last_materialized_at),
  };
}

export async function selectNightlyAgentCandidates(
  options?: SelectNightlyAgentCandidatesOptions
): Promise<NightlyCandidate[]> {
  const limit = Math.max(1, options?.limit ?? 3000);
  const now = options?.now ?? new Date();
  const recentWindowHours = Math.max(1, options?.recentWindowHours ?? 48);
  const staleAfterHours = Math.max(1, options?.staleAfterHours ?? 168);
  const recentCutoff = new Date(now.getTime() - recentWindowHours * 60 * 60 * 1000);
  const staleCutoff = new Date(now.getTime() - staleAfterHours * 60 * 60 * 1000);

  const recentLimit = Math.min(limit, Math.ceil(limit / 2));
  const recentRows = await db
    .select({
      agentId: agents.id,
      slug: agents.slug,
      updatedAt: agents.updatedAt,
    })
    .from(agents)
    .where(
      and(
        eq(agents.status, "ACTIVE"),
        eq(agents.publicSearchable, true),
        sql`${agents.updatedAt} >= ${recentCutoff}`
      )
    )
    .orderBy(desc(agents.updatedAt), asc(agents.slug))
    .limit(recentLimit);

  const selected = new Map<string, NightlyCandidate>();
  for (const row of recentRows) {
    selected.set(row.agentId, {
      agentId: row.agentId,
      slug: row.slug,
      reason: "recent",
      updatedAt: toIsoOrNull(row.updatedAt),
      lastMaterializedAt: null,
    });
  }

  if (selected.size >= limit) {
    return [...selected.values()].slice(0, limit);
  }

  const staleFetchLimit = Math.max(limit * 2, 200);
  const staleResult = await db.execute(sql`
    WITH fact_stats AS (
      SELECT
        agent_id,
        count(*)::int AS fact_count,
        max(updated_at) AS fact_updated_at
      FROM agent_facts
      GROUP BY agent_id
    ),
    event_stats AS (
      SELECT
        agent_id,
        count(*)::int AS event_count,
        max(updated_at) AS event_updated_at
      FROM agent_change_events
      GROUP BY agent_id
    ),
    agent_materialization AS (
      SELECT
        a.id AS agent_id,
        a.slug AS slug,
        a.updated_at AS updated_at,
        COALESCE(fs.fact_count, 0) AS fact_count,
        COALESCE(es.event_count, 0) AS event_count,
        GREATEST(fs.fact_updated_at, es.event_updated_at) AS last_materialized_at
      FROM agents a
      LEFT JOIN fact_stats fs ON fs.agent_id = a.id
      LEFT JOIN event_stats es ON es.agent_id = a.id
      WHERE a.status = 'ACTIVE' AND a.public_searchable = true
    )
    SELECT
      agent_id,
      slug,
      updated_at,
      last_materialized_at
    FROM agent_materialization
    WHERE
      fact_count = 0
      OR event_count = 0
      OR last_materialized_at IS NULL
      OR last_materialized_at < ${staleCutoff}
    ORDER BY
      CASE WHEN last_materialized_at IS NULL THEN 0 ELSE 1 END,
      last_materialized_at ASC NULLS FIRST,
      updated_at DESC
    LIMIT ${staleFetchLimit}
  `);

  const staleRows =
    (staleResult as unknown as { rows?: StaleRow[] }).rows ?? [];
  for (const row of staleRows) {
    if (selected.has(row.agent_id)) continue;
    selected.set(row.agent_id, staleRowToCandidate(row));
    if (selected.size >= limit) break;
  }

  return [...selected.values()].slice(0, limit);
}
