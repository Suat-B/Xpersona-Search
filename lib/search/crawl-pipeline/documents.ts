import { db } from "@/lib/db";
import { searchDocuments } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  boolean,
  text,
  jsonb,
  integer,
  doublePrecision,
  timestamp,
} from "drizzle-orm/pg-core";
import { buildSnippet, chunkText } from "./text";
import { computeContentHash, normalizedUrlHash, simhash64 } from "./hash";

export type SearchDocumentType = "agent" | "artifact" | "web_page" | "web_chunk";

export interface SearchDocumentInput {
  docType: SearchDocumentType;
  source: string;
  sourceId: string;
  canonicalUrl: string;
  domain: string;
  title?: string | null;
  bodyText: string;
  snippet?: string | null;
  qualityScore?: number;
  safetyScore?: number;
  freshnessScore?: number;
  confidenceScore?: number;
  isPublic?: boolean;
  indexedAt?: Date;
}

const agentsCompat = pgTable("agents", {
  sourceId: varchar("source_id", { length: 255 }).notNull(),
  source: varchar("source", { length: 32 }).notNull(),
  visibility: varchar("visibility", { length: 16 }).notNull(),
  publicSearchable: boolean("public_searchable").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull(),
  description: text("description"),
  url: varchar("url", { length: 1024 }).notNull(),
  homepage: varchar("homepage", { length: 1024 }),
  capabilities: jsonb("capabilities").$type<string[]>(),
  protocols: jsonb("protocols").$type<string[]>(),
  languages: jsonb("languages").$type<string[]>(),
  safetyScore: integer("safety_score").notNull(),
  popularityScore: integer("popularity_score").notNull(),
  freshnessScore: integer("freshness_score").notNull(),
  performanceScore: integer("performance_score").notNull(),
  overallRank: doublePrecision("overall_rank").notNull(),
  status: varchar("status", { length: 24 }).notNull(),
  readme: text("readme"),
  lastCrawledAt: timestamp("last_crawled_at", { withTimezone: true }).notNull(),
  lastIndexedAt: timestamp("last_indexed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

function clampScore(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function scoreDocument(input: {
  bodyText: string;
  title?: string | null;
  source: string;
}): { quality: number; safety: number; freshness: number; confidence: number } {
  const bodyLen = input.bodyText.length;
  let quality = 35;
  if (bodyLen >= 300) quality += 18;
  if (bodyLen >= 1200) quality += 20;
  if (input.title && input.title.trim().length >= 6) quality += 8;
  if (input.source.toUpperCase().includes("GITHUB")) quality += 6;

  const lower = `${input.title ?? ""} ${input.bodyText}`.toLowerCase();
  const unsafe = /(porn|xxx|casino|betting|malware|phishing)/.test(lower);
  const safety = unsafe ? 8 : 80;
  const freshness = 70;
  const confidence = Math.min(100, 30 + Math.round(Math.log10(bodyLen + 10) * 22));
  return {
    quality: clampScore(quality, 50),
    safety: clampScore(safety, 80),
    freshness: clampScore(freshness, 70),
    confidence: clampScore(confidence, 60),
  };
}

export function buildChunkDocuments(input: {
  source: string;
  sourceId: string;
  canonicalUrl: string;
  domain: string;
  title?: string | null;
  plainText: string;
  isPublic?: boolean;
}): SearchDocumentInput[] {
  const chunks = chunkText(input.plainText, 900, 120);
  return chunks.map((chunk, idx) => {
    const scores = scoreDocument({
      bodyText: chunk,
      title: input.title,
      source: input.source,
    });
    return {
      docType: idx === 0 ? "web_page" : "web_chunk",
      source: input.source,
      sourceId: `${input.sourceId}#${idx}`,
      canonicalUrl: input.canonicalUrl,
      domain: input.domain,
      title: idx === 0 ? input.title ?? null : null,
      bodyText: chunk,
      snippet: buildSnippet(chunk),
      qualityScore: scores.quality,
      safetyScore: scores.safety,
      freshnessScore: scores.freshness,
      confidenceScore: scores.confidence,
      isPublic: input.isPublic ?? true,
      indexedAt: new Date(),
    };
  });
}

function trimTo(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max).trim();
}

async function upsertSyntheticAgentsFromDocuments(
  rows: Array<{
    source: string;
    canonicalUrl: string;
    domain: string;
    title: string | null;
    snippet: string;
    bodyText: string;
    contentHash: string;
    urlNormHash: string;
    qualityScore: number;
    safetyScore: number;
    freshnessScore: number;
    confidenceScore: number;
    isPublic: boolean;
    indexedAt: Date;
  }>
): Promise<void> {
  if (rows.length === 0) return;
  const now = new Date();
  const syntheticRows = rows.map((row) => {
    const sourceId = `CRAWLED_DOC:${row.urlNormHash}:${row.contentHash.slice(0, 16)}`;
    const slug = `crawl-${row.urlNormHash.slice(0, 16)}-${row.contentHash.slice(0, 12)}`;
    const title = trimTo(
      row.title?.trim() || `Crawled ${row.domain || "document"} ${row.contentHash.slice(0, 8)}`,
      255
    );
    const description = trimTo(row.snippet || row.bodyText || title, 1500);
    const overallRank = Math.max(
      0,
      Math.min(
        100,
        Number(
          (
            row.qualityScore * 0.35 +
            row.safetyScore * 0.20 +
            row.freshnessScore * 0.20 +
            row.confidenceScore * 0.25
          ).toFixed(2)
        )
      )
    );

    return {
      sourceId,
      source: trimTo((row.source || "WEB_CRAWL").toUpperCase(), 32),
      visibility: "PUBLIC",
      publicSearchable: row.isPublic,
      name: title,
      slug,
      description,
      url: row.canonicalUrl,
      homepage: row.canonicalUrl,
      capabilities: [] as string[],
      protocols: [] as string[],
      languages: [] as string[],
      safetyScore: row.safetyScore,
      popularityScore: row.qualityScore,
      freshnessScore: row.freshnessScore,
      performanceScore: row.confidenceScore,
      overallRank,
      status: "ACTIVE",
      readme: trimTo(row.bodyText, 24000),
      lastCrawledAt: row.indexedAt ?? now,
      lastIndexedAt: row.indexedAt ?? now,
      updatedAt: now,
    };
  });
  const dedupedRows = Array.from(
    syntheticRows.reduce((acc, row) => {
      acc.set(row.sourceId, row);
      return acc;
    }, new Map<string, (typeof syntheticRows)[number]>()).values()
  );

  await db
    .insert(agentsCompat)
    .values(dedupedRows)
    .onConflictDoUpdate({
      target: agentsCompat.sourceId,
      set: {
        source: sql`excluded.source`,
        visibility: sql`excluded.visibility`,
        publicSearchable: sql`excluded.public_searchable`,
        name: sql`excluded.name`,
        slug: sql`excluded.slug`,
        description: sql`excluded.description`,
        url: sql`excluded.url`,
        homepage: sql`excluded.homepage`,
        capabilities: sql`excluded.capabilities`,
        protocols: sql`excluded.protocols`,
        languages: sql`excluded.languages`,
        safetyScore: sql`excluded.safety_score`,
        popularityScore: sql`excluded.popularity_score`,
        freshnessScore: sql`excluded.freshness_score`,
        performanceScore: sql`excluded.performance_score`,
        overallRank: sql`excluded.overall_rank`,
        status: sql`excluded.status`,
        readme: sql`excluded.readme`,
        lastCrawledAt: sql`excluded.last_crawled_at`,
        lastIndexedAt: sql`excluded.last_indexed_at`,
        updatedAt: now,
      },
    });
}

export async function upsertSearchDocuments(
  docs: SearchDocumentInput[]
): Promise<number> {
  if (docs.length === 0) return 0;
  const now = new Date();
  const coerceDate = (value: unknown, fallback: Date): Date => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === "string" || typeof value === "number") {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return fallback;
  };
  const rows = docs.map((doc) => {
    const scores = scoreDocument({
      bodyText: doc.bodyText,
      title: doc.title,
      source: doc.source,
    });
    const snippet = doc.snippet ?? buildSnippet(doc.bodyText);
    const contentHash = computeContentHash({
      title: doc.title,
      snippet,
      bodyText: doc.bodyText,
    });
    return {
      docType: doc.docType,
      source: doc.source,
      sourceId: doc.sourceId,
      canonicalUrl: doc.canonicalUrl,
      domain: doc.domain,
      title: doc.title ?? null,
      snippet,
      bodyText: doc.bodyText,
      bodyTsv: "",
      urlNormHash: normalizedUrlHash(doc.canonicalUrl),
      contentHash,
      simhash64: simhash64(doc.bodyText),
      qualityScore: clampScore(doc.qualityScore ?? scores.quality, scores.quality),
      safetyScore: clampScore(doc.safetyScore ?? scores.safety, scores.safety),
      freshnessScore: clampScore(doc.freshnessScore ?? scores.freshness, scores.freshness),
      confidenceScore: clampScore(doc.confidenceScore ?? scores.confidence, scores.confidence),
      isPublic: doc.isPublic ?? true,
      indexedAt: coerceDate(doc.indexedAt, now),
      updatedAt: now,
    };
  });

  const result = await db
    .insert(searchDocuments)
    .values(rows)
    .onConflictDoUpdate({
      target: [searchDocuments.urlNormHash, searchDocuments.contentHash],
      set: {
        docType: sql`excluded.doc_type`,
        source: sql`excluded.source`,
        sourceId: sql`excluded.source_id`,
        canonicalUrl: sql`excluded.canonical_url`,
        domain: sql`excluded.domain`,
        title: sql`excluded.title`,
        snippet: sql`excluded.snippet`,
        bodyText: sql`excluded.body_text`,
        simhash64: sql`excluded.simhash64`,
        qualityScore: sql`excluded.quality_score`,
        safetyScore: sql`excluded.safety_score`,
        freshnessScore: sql`excluded.freshness_score`,
        confidenceScore: sql`excluded.confidence_score`,
        isPublic: sql`excluded.is_public`,
        indexedAt: sql`excluded.indexed_at`,
        updatedAt: now,
      },
    })
    .returning({ id: searchDocuments.id });

  await upsertSyntheticAgentsFromDocuments(rows);

  return result.length;
}
