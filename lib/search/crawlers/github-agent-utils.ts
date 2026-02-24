import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { GitHubRepo } from "../utils/github";

export function getRepoVisibility(repo: GitHubRepo): {
  visibility: "PUBLIC" | "PRIVATE";
  publicSearchable: boolean;
} {
  const isPrivate =
    repo.private === true ||
    repo.visibility === "private" ||
    repo.visibility === "internal";
  return {
    visibility: isPrivate ? "PRIVATE" : "PUBLIC",
    publicSearchable: !isPrivate,
  };
}

export async function shouldRecrawlSource(
  sourceId: string,
  minIntervalHours: number
): Promise<boolean> {
  if (minIntervalHours <= 0) return true;
  const [existing] = await db
    .select({
      lastCrawledAt: agents.lastCrawledAt,
      nextCrawlAt: agents.nextCrawlAt,
    })
    .from(agents)
    .where(eq(agents.sourceId, sourceId))
    .limit(1);

  if (!existing) return true;
  const now = Date.now();
  const minIntervalMs = minIntervalHours * 60 * 60 * 1000;
  const last = existing.lastCrawledAt?.getTime?.() ?? 0;
  if (last > 0 && now - last < minIntervalMs) return false;
  const next = existing.nextCrawlAt?.getTime?.() ?? 0;
  if (next > now) return false;
  return true;
}
