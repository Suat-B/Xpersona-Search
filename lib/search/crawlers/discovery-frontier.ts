import { db } from "@/lib/db";
import { crawlFrontier } from "@/lib/db/schema";
import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";

export type CandidateStatus = "PENDING" | "PROCESSING" | "DONE" | "FAILED";
export type ConfidenceTier = "HIGH" | "MEDIUM" | "LOW";

export interface CandidateRepo {
  id: string;
  repoFullName: string;
  url: string;
  originSource: string;
  discoveryAt: Date;
  confidence: number;
  reasons: string[];
  status: CandidateStatus;
  attempts: number;
}

export interface EnqueueCandidateInput {
  repoFullName: string;
  originSource: string;
  confidence: number;
  reasons: string[];
  priority?: number;
}

export function getConfidenceTier(score: number): ConfidenceTier {
  if (score >= 80) return "HIGH";
  if (score >= 50) return "MEDIUM";
  return "LOW";
}

export async function enqueueCandidates(
  candidates: EnqueueCandidateInput[]
): Promise<number> {
  let inserted = 0;
  for (const c of candidates) {
    const cleanRepo = c.repoFullName.trim().replace(/\.git$/, "");
    if (!cleanRepo.includes("/")) continue;
    const url = `https://github.com/${cleanRepo}`;
    await db
      .insert(crawlFrontier)
      .values({
        url,
        repoFullName: cleanRepo,
        originSource: c.originSource,
        confidence: c.confidence,
        reasons: c.reasons,
        priority: c.priority ?? c.confidence,
        status: "PENDING",
        nextAttemptAt: new Date(),
      })
      .onConflictDoUpdate({
        target: crawlFrontier.url,
        set: {
          repoFullName: cleanRepo,
          originSource: c.originSource,
          confidence: sql`GREATEST(${crawlFrontier.confidence}, ${c.confidence})`,
          reasons: c.reasons,
          priority: sql`GREATEST(${crawlFrontier.priority}, ${c.priority ?? c.confidence})`,
          status: sql`CASE WHEN ${crawlFrontier.status} = 'DONE' THEN ${crawlFrontier.status} ELSE 'PENDING' END`,
          nextAttemptAt: new Date(),
        },
      });
    inserted++;
  }
  return inserted;
}

export async function leaseCandidates(params: {
  lockOwner: string;
  limit: number;
  minConfidence?: number;
}): Promise<CandidateRepo[]> {
  const now = new Date();
  const rows = await db
    .select({
      id: crawlFrontier.id,
      repoFullName: crawlFrontier.repoFullName,
      url: crawlFrontier.url,
      originSource: crawlFrontier.originSource,
      discoveryAt: crawlFrontier.discoveryAt,
      confidence: crawlFrontier.confidence,
      reasons: crawlFrontier.reasons,
      status: crawlFrontier.status,
      attempts: crawlFrontier.attempts,
    })
    .from(crawlFrontier)
    .where(
      and(
        eq(crawlFrontier.status, "PENDING"),
        gte(crawlFrontier.confidence, 0),
        params.minConfidence != null
          ? gte(crawlFrontier.confidence, params.minConfidence)
          : sql`true`,
        or(isNull(crawlFrontier.nextAttemptAt), lte(crawlFrontier.nextAttemptAt, now))
      )
    )
    .orderBy(asc(crawlFrontier.nextAttemptAt), asc(sql`-${crawlFrontier.priority}`))
    .limit(params.limit);

  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return [];

  await db
    .update(crawlFrontier)
    .set({
      status: "PROCESSING",
      lockOwner: params.lockOwner,
      lockedAt: now,
      lastAttemptAt: now,
      attempts: sql`${crawlFrontier.attempts} + 1`,
    })
    .where(inArray(crawlFrontier.id, ids));

  return rows
    .filter((r) => !!r.repoFullName)
    .map((r) => ({
      id: r.id,
      repoFullName: r.repoFullName!,
      url: r.url,
      originSource: r.originSource ?? "unknown",
      discoveryAt: r.discoveryAt ?? now,
      confidence: r.confidence ?? 0,
      reasons: r.reasons ?? [],
      status: "PROCESSING",
      attempts: r.attempts ?? 0,
    }));
}

export async function ackCandidate(id: string): Promise<void> {
  await db
    .update(crawlFrontier)
    .set({
      status: "DONE",
      lastError: null,
      lockOwner: null,
      lockedAt: null,
      nextAttemptAt: null,
    })
    .where(eq(crawlFrontier.id, id));
}

export async function requeueCandidate(
  id: string,
  error: string,
  backoffMs: number
): Promise<void> {
  await db
    .update(crawlFrontier)
    .set({
      status: "PENDING",
      lastError: error.slice(0, 1000),
      lockOwner: null,
      lockedAt: null,
      nextAttemptAt: new Date(Date.now() + backoffMs),
    })
    .where(eq(crawlFrontier.id, id));
}

export async function failCandidate(id: string, error: string): Promise<void> {
  await db
    .update(crawlFrontier)
    .set({
      status: "FAILED",
      lastError: error.slice(0, 1000),
      lockOwner: null,
      lockedAt: null,
    })
    .where(eq(crawlFrontier.id, id));
}
