import { createHash } from "crypto";
import { db } from "@/lib/db";
import { gpgTaskClusters, gpgTaskSignatures } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { getEmbeddingProvider } from "@/lib/search/semantic/config";
import type { TaskSignature } from "./types";

const DEFAULT_SIM_THRESHOLD = Number(process.env.GPG_CLUSTER_SIM_THRESHOLD ?? "0.86");
const MAX_LABEL = 80;

function normalizeText(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 500);
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 191);
}

function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function findNearestCluster(
  embedding: number[],
  normalized: string
): Promise<{ id: string; similarity: number } | null> {
  const token = normalized.split(" ").slice(0, 5).join(" ");
  if (!token) return null;

  const rows = await db.execute(sql`
    SELECT id, embedding
    FROM gpg_task_clusters
    WHERE embedding IS NOT NULL
      AND normalized_label ILIKE ${`%${token}%`}
    ORDER BY volume_30d DESC, created_at DESC
    LIMIT 50
  `);

  const candidates = (rows as unknown as { rows?: Array<{ id: string; embedding: number[] | null }> }).rows ?? [];
  let best: { id: string; similarity: number } | null = null;
  for (const candidate of candidates) {
    if (!Array.isArray(candidate.embedding)) continue;
    const similarity = cosineSimilarity(embedding, candidate.embedding);
    if (!best || similarity > best.similarity) {
      best = { id: candidate.id, similarity };
    }
  }
  return best;
}

async function findNearestClusterLexical(normalized: string): Promise<string | null> {
  const token = normalized.split(" ").slice(0, 5).join(" ");
  if (!token) return null;
  const rows = await db.execute(sql`
    SELECT id
    FROM gpg_task_clusters
    WHERE normalized_label ILIKE ${`%${token}%`}
    ORDER BY volume_30d DESC, created_at DESC
    LIMIT 1
  `);
  const row = (rows as unknown as { rows?: Array<{ id: string }> }).rows?.[0];
  return row?.id ?? null;
}

export async function ensureTaskSignature(params: {
  rawText: string;
  taskType?: string;
  tags?: string[];
}): Promise<TaskSignature> {
  const raw = params.rawText.trim();
  const normalized = normalizeText(raw);
  const textHash = hashText(normalized);
  const taskType = params.taskType ?? "general";
  const tags = (params.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean);

  const existing = await db
    .select()
    .from(gpgTaskSignatures)
    .where(and(eq(gpgTaskSignatures.textHash, textHash), eq(gpgTaskSignatures.taskType, taskType)))
    .limit(1);
  if (existing[0]) {
    return {
      id: existing[0].id,
      rawText: existing[0].rawText,
      normalizedText: existing[0].normalizedText,
      taskType: existing[0].taskType,
      tags: (existing[0].tags as string[]) ?? [],
      clusterId: existing[0].clusterId ?? null,
    };
  }

  const provider = getEmbeddingProvider();
  let embedding: number[] | null = null;
  if (provider && provider.isAvailable()) {
    try {
      const vectors = await provider.embed([normalized]);
      embedding = vectors[0] ?? null;
    } catch {
      embedding = null;
    }
  }

  let clusterId: string | null = null;
  if (embedding && embedding.length > 0) {
    const nearest = await findNearestCluster(embedding, normalized);
    if (nearest && nearest.similarity >= DEFAULT_SIM_THRESHOLD) {
      clusterId = nearest.id;
    }
  }
  if (!clusterId) {
    clusterId = await findNearestClusterLexical(normalized);
  }
  if (!clusterId) {
    const cluster = await ensureTaskCluster({
      normalizedText: normalized,
      taskType,
      tags,
      embedding,
    });
    clusterId = cluster.id;
  }

  const signature = await db
    .insert(gpgTaskSignatures)
    .values({
      rawText: raw,
      normalizedText: normalized,
      textHash,
      tags,
      embedding,
      taskType,
    clusterId,
    createdAt: new Date(),
  })
    .returning();

  return {
    id: signature[0].id,
    rawText: signature[0].rawText,
    normalizedText: signature[0].normalizedText,
    taskType: signature[0].taskType,
    tags: (signature[0].tags as string[]) ?? [],
    clusterId: signature[0].clusterId ?? null,
  };
}

export async function ensureTaskCluster(params: {
  normalizedText: string;
  taskType: string;
  tags?: string[];
  embedding?: number[] | null;
}): Promise<{ id: string; slug: string; name: string }>
{
  const normalized = params.normalizedText.trim();
  const label = normalized.slice(0, MAX_LABEL) || "general";
  const signatureHash = hashText(`${params.taskType}:${label}`);
  const slug = slugify(`${params.taskType}-${label}`) || `cluster-${signatureHash.slice(0, 8)}`;
  const tags = (params.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean);

  const existing = await db
    .select({ id: gpgTaskClusters.id, slug: gpgTaskClusters.slug, name: gpgTaskClusters.name })
    .from(gpgTaskClusters)
    .where(eq(gpgTaskClusters.signatureHash, signatureHash))
    .limit(1);
  if (existing[0]) return existing[0];

  const inserted = await db
    .insert(gpgTaskClusters)
    .values({
      slug,
      name: label,
      description: null,
      normalizedLabel: label,
      signatureHash,
      taskType: params.taskType,
      tags,
      embedding: params.embedding ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: gpgTaskClusters.id, slug: gpgTaskClusters.slug, name: gpgTaskClusters.name });

  return inserted[0];
}
