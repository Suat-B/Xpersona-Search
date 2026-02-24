import { db } from "@/lib/db";
import { mediaWebFrontier } from "@/lib/db/schema";
import { and, asc, eq, lte, sql } from "drizzle-orm";

export async function enqueueMediaWebUrls(params: {
  urls: string[];
  source?: string;
  discoveredFrom?: string | null;
  priority?: number;
}): Promise<number> {
  if (params.urls.length === 0) return 0;
  const now = new Date();
  let inserted = 0;
  for (const raw of params.urls) {
    try {
      const parsed = new URL(raw);
      await db
        .insert(mediaWebFrontier)
        .values({
          url: parsed.toString(),
          domain: parsed.hostname.toLowerCase(),
          source: params.source ?? "WEB",
          discoveredFrom: params.discoveredFrom ?? null,
          priority: params.priority ?? 0,
          status: "PENDING",
          updatedAt: now,
        })
        .onConflictDoNothing();
      inserted += 1;
    } catch {
      // ignore invalid URL
    }
  }
  return inserted;
}

export async function leaseMediaWebUrls(params: {
  lockOwner: string;
  limit: number;
}): Promise<Array<{ id: string; url: string; domain: string }>> {
  const now = new Date();
  const rows = await db
    .select({
      id: mediaWebFrontier.id,
      url: mediaWebFrontier.url,
      domain: mediaWebFrontier.domain,
    })
    .from(mediaWebFrontier)
    .where(
      and(
        eq(mediaWebFrontier.status, "PENDING"),
        sql`coalesce(${mediaWebFrontier.nextAttemptAt}, now()) <= now()`
      )
    )
    .orderBy(asc(mediaWebFrontier.priority), asc(mediaWebFrontier.createdAt))
    .limit(params.limit);

  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  await db
    .update(mediaWebFrontier)
    .set({
      status: "RUNNING",
      lockOwner: params.lockOwner,
      lockedAt: now,
      updatedAt: now,
    })
    .where(sql`${mediaWebFrontier.id} = ANY(ARRAY[${sql.join(ids.map((id) => sql`${id}`), sql`, `)}]::uuid[])`);

  return rows;
}

export async function ackMediaWebUrl(id: string): Promise<void> {
  await db
    .update(mediaWebFrontier)
    .set({
      status: "COMPLETED",
      lockOwner: null,
      lockedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(mediaWebFrontier.id, id));
}

export async function retryMediaWebUrl(
  id: string,
  error: string,
  delayMs: number
): Promise<void> {
  await db
    .update(mediaWebFrontier)
    .set({
      status: "PENDING",
      attempts: sql`${mediaWebFrontier.attempts} + 1`,
      lastError: error.slice(0, 1024),
      lockOwner: null,
      lockedAt: null,
      nextAttemptAt: new Date(Date.now() + delayMs),
      updatedAt: new Date(),
    })
    .where(eq(mediaWebFrontier.id, id));
}

export async function markStaleMediaUrlsDead(params?: { staleDays?: number }): Promise<number> {
  const staleDays = params?.staleDays ?? 30;
  const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);
  const result = await db.execute(sql`
    UPDATE agent_media_assets
    SET is_dead = true,
        dead_checked_at = now(),
        crawl_status = 'STALE',
        updated_at = now()
    WHERE updated_at <= ${cutoff}
      AND coalesce(is_dead, false) = false
  `);
  return (result as unknown as { rowCount?: number }).rowCount ?? 0;
}
