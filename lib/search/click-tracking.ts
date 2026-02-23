import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

/**
 * Records a search result click for learning-to-rank CTR signals.
 * Fire-and-forget with error logging.
 */
export async function recordSearchClick(params: {
  queryHash: string;
  agentId: string;
  position: number;
  userId?: string;
}): Promise<void> {
  const { queryHash, agentId, position, userId } = params;

  if (!queryHash || !agentId || position < 0) return;

  try {
    await db.execute(
      sql`INSERT INTO search_clicks (id, query_hash, agent_id, position, user_id, clicked_at)
          VALUES (gen_random_uuid(), ${queryHash}, ${agentId}::uuid, ${position}, ${userId ?? null}, now())`
    );
  } catch (err) {
    console.error("[ClickTracking] Failed to record click:", err);
  }
}

/**
 * Computes a simple hash of a search query for grouping clicks.
 * Uses a fast non-cryptographic hash.
 */
export function hashQuery(query: string): string {
  const normalized = query.toLowerCase().trim();
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Gets aggregated CTR boost for an agent based on click history.
 * Used during rank recalculation.
 *
 * Returns a score in [0, 20] range:
 *   boost = log(totalClicks + 1) * 2, capped at 20
 *
 * This is a Bayesian smooth that prevents low-click agents from
 * getting zero boost while preventing manipulation via click-bombing.
 */
export async function getCtrBoost(agentId: string): Promise<number> {
  try {
    const result = await db.execute(
      sql`SELECT count(*)::int AS total_clicks
          FROM search_clicks
          WHERE agent_id = ${agentId}::uuid
            AND clicked_at >= now() - interval '30 days'`
    );
    const rows = (result as unknown as { rows?: Array<{ total_clicks: number }> }).rows ?? [];
    const totalClicks = rows[0]?.total_clicks ?? 0;
    return Math.min(20, Math.log(totalClicks + 1) * 2);
  } catch (err) {
    console.error("[ClickTracking] Failed to compute CTR boost:", err);
    return 0;
  }
}
