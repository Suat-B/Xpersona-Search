/**
 * Upsert an agent row with slug conflict retry.
 * If insert fails due to unique violation on slug (different sourceId, same slug),
 * retries with slug-2, slug-3, ... so the crawl does not stop on slug collision.
 */
import { db } from "@/lib/db";
import { agentMediaAssets, agents } from "@/lib/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";

type AgentInsert = typeof agents.$inferInsert;
type ConflictSet = Partial<AgentInsert>;

const SLUG_CONSTRAINT_PATTERN = /slug|agents_slug/;
const PG_UNIQUE_VIOLATION = "23505";
const MAX_SLUG_RETRIES = 10;

function isSlugUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  const constraint = (err as { constraint?: string })?.constraint;
  const message = (err as { message?: string })?.message ?? "";
  return (
    code === PG_UNIQUE_VIOLATION &&
    (SLUG_CONSTRAINT_PATTERN.test(constraint ?? "") ||
      SLUG_CONSTRAINT_PATTERN.test(message))
  );
}

function nextSlug(baseSlug: string, attempt: number): string {
  const base = baseSlug.replace(/-?\d+$/, "").slice(0, 60);
  const suffix = attempt + 2;
  return `${base}-${suffix}`.slice(0, 255);
}

/**
 * Insert or update agent. On slug unique violation, retries with suffixed slug.
 */
export async function upsertAgent(
  values: AgentInsert,
  conflictSet: ConflictSet
): Promise<void> {
  let slug = values.slug;
  for (let attempt = 0; attempt < MAX_SLUG_RETRIES; attempt++) {
    try {
      await db
        .insert(agents)
        .values({ ...values, slug })
        .onConflictDoUpdate({
          target: agents.sourceId,
          set: { ...conflictSet, slug, updatedAt: new Date() },
        });
      return;
    } catch (err) {
      if (isSlugUniqueViolation(err) && attempt < MAX_SLUG_RETRIES - 1) {
        slug = nextSlug(slug, attempt);
      } else {
        throw err;
      }
    }
  }
}

export interface AgentMediaAssetUpsertInput {
  agentId: string;
  source: string;
  assetKind: "IMAGE" | "ARTIFACT";
  artifactType?:
    | "OPENAPI"
    | "JSON_SCHEMA"
    | "DIAGRAM"
    | "MODEL_CARD"
    | "BENCHMARK"
    | "UI_SCREENSHOT"
    | "OTHER"
    | null;
  url: string;
  sourcePageUrl?: string | null;
  sha256: string;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  byteSize?: number | null;
  title?: string | null;
  caption?: string | null;
  altText?: string | null;
  contextText?: string | null;
  licenseGuess?: string | null;
  crawlDomain?: string | null;
  discoveryMethod?: string | null;
  urlNormHash?: string | null;
  isPublic?: boolean;
  isDead?: boolean;
  deadCheckedAt?: Date | null;
  qualityScore?: number;
  safetyScore?: number;
  rankScore?: number;
  crawlStatus?: string;
}

export async function getAgentBySourceId(sourceId: string): Promise<{
  id: string;
  sourceId: string;
  primaryImageUrl: string | null;
  mediaAssetCount: number;
} | null> {
  const [row] = await db
    .select({
      id: agents.id,
      sourceId: agents.sourceId,
      primaryImageUrl: agents.primaryImageUrl,
      mediaAssetCount: agents.mediaAssetCount,
    })
    .from(agents)
    .where(eq(agents.sourceId, sourceId))
    .limit(1);
  return row ?? null;
}

export async function upsertMediaAsset(input: AgentMediaAssetUpsertInput): Promise<void> {
  const now = new Date();
  await db
    .insert(agentMediaAssets)
    .values({
      agentId: input.agentId,
      source: input.source,
      assetKind: input.assetKind,
      artifactType: input.artifactType ?? null,
      url: input.url,
      sourcePageUrl: input.sourcePageUrl ?? null,
      sha256: input.sha256,
      mimeType: input.mimeType ?? null,
      width: input.width ?? null,
      height: input.height ?? null,
      byteSize: input.byteSize ?? null,
      title: input.title ?? null,
      caption: input.caption ?? null,
      altText: input.altText ?? null,
      contextText: input.contextText ?? null,
      licenseGuess: input.licenseGuess ?? null,
      crawlDomain: input.crawlDomain ?? null,
      discoveryMethod: input.discoveryMethod ?? null,
      urlNormHash: input.urlNormHash ?? null,
      isPublic: input.isPublic ?? true,
      isDead: input.isDead ?? false,
      deadCheckedAt: input.deadCheckedAt ?? now,
      qualityScore: input.qualityScore ?? 0,
      safetyScore: input.safetyScore ?? 0,
      rankScore: input.rankScore ?? 0,
      crawlStatus: input.crawlStatus ?? "DISCOVERED",
      lastVerifiedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [agentMediaAssets.sha256, agentMediaAssets.agentId],
      set: {
        sourcePageUrl: input.sourcePageUrl ?? null,
        mimeType: input.mimeType ?? null,
        width: input.width ?? null,
        height: input.height ?? null,
        byteSize: input.byteSize ?? null,
        title: input.title ?? null,
        caption: input.caption ?? null,
        altText: input.altText ?? null,
        contextText: input.contextText ?? null,
        licenseGuess: input.licenseGuess ?? null,
        crawlDomain: input.crawlDomain ?? null,
        discoveryMethod: input.discoveryMethod ?? null,
        urlNormHash: input.urlNormHash ?? null,
        isPublic: input.isPublic ?? true,
        isDead: input.isDead ?? false,
        deadCheckedAt: input.deadCheckedAt ?? now,
        qualityScore: input.qualityScore ?? 0,
        safetyScore: input.safetyScore ?? 0,
        rankScore: input.rankScore ?? 0,
        crawlStatus: input.crawlStatus ?? "DISCOVERED",
        lastVerifiedAt: now,
        updatedAt: now,
      },
    });

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(agentMediaAssets)
    .where(and(eq(agentMediaAssets.agentId, input.agentId), eq(agentMediaAssets.isPublic, true)));

  const total = Number(countRow?.count ?? 0);
  const [bestImage] = await db
    .select({ url: agentMediaAssets.url })
    .from(agentMediaAssets)
    .where(
      and(
        eq(agentMediaAssets.agentId, input.agentId),
        eq(agentMediaAssets.isPublic, true),
        eq(agentMediaAssets.assetKind, "IMAGE")
      )
    )
    .orderBy(
      desc(agentMediaAssets.qualityScore),
      desc(sql<number>`coalesce(${agentMediaAssets.width}, 0) * coalesce(${agentMediaAssets.height}, 0)`),
      desc(agentMediaAssets.updatedAt)
    )
    .limit(1);

  const updateSet: Partial<AgentInsert> & { mediaAssetCount: number; updatedAt: Date } = {
    mediaAssetCount: total,
    updatedAt: now,
  };
  if (bestImage?.url) {
    updateSet.primaryImageUrl = bestImage.url;
  }
  await db.update(agents).set(updateSet).where(eq(agents.id, input.agentId));
}

export async function upsertMediaAssetsBulk(
  inputs: AgentMediaAssetUpsertInput[]
): Promise<void> {
  for (const input of inputs) {
    await upsertMediaAsset(input);
  }
}

export function computeMediaRankScore(input: {
  qualityScore: number;
  safetyScore: number;
  assetKind: "IMAGE" | "ARTIFACT";
  artifactType?: string | null;
  parentOverallRank?: number | null;
  freshnessDays?: number;
  lexicalMatch?: number;
}): number {
  const freshnessPenalty = Math.min(20, Math.max(0, input.freshnessDays ?? 0) * 0.2);
  const artifactBoost =
    input.assetKind === "ARTIFACT" &&
    ["OPENAPI", "JSON_SCHEMA", "BENCHMARK", "DIAGRAM"].includes(
      (input.artifactType ?? "").toUpperCase()
    )
      ? 8
      : 0;
  const lexical = Math.max(0, Math.min(20, input.lexicalMatch ?? 0));
  const parent = Math.max(0, Math.min(20, (input.parentOverallRank ?? 0) / 5));
  return Math.max(
    0,
    Math.round(input.qualityScore * 0.45 + input.safetyScore * 0.25 + parent + lexical + artifactBoost - freshnessPenalty)
  );
}
