/**
 * Backfills GPG cluster linkage from historical agent_runs.
 *
 * Usage:
 *   npx tsx scripts/backfill-gpg-from-agent-runs.ts
 *   npx tsx scripts/backfill-gpg-from-agent-runs.ts --batch=200
 */
import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "../lib/db";
import { agentRuns } from "../lib/db/schema";
import { asc, eq, isNull } from "drizzle-orm";
import { ensureTaskCluster, ensureTaskSignature } from "../lib/gpg/task-canonicalization";
import { recomputeAllClusterStats } from "../lib/gpg/stats";

const DEFAULT_BATCH = 200;

function parseBatchArg(): number {
  const found = process.argv.find((arg) => arg.startsWith("--batch="));
  if (!found) return DEFAULT_BATCH;
  const raw = Number(found.split("=")[1]);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_BATCH;
  return Math.min(500, Math.max(50, Math.floor(raw)));
}

function extractTaskInfo(trace: unknown): { taskText: string | null; taskType: string | null } {
  if (!trace || typeof trace !== "object") return { taskText: null, taskType: null };
  const record = trace as Record<string, unknown>;
  const taskText =
    typeof record.taskText === "string"
      ? record.taskText
      : typeof record.task === "string"
        ? record.task
        : null;
  const taskType = typeof record.taskType === "string" ? record.taskType : null;
  return { taskText, taskType };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const batchSize = parseBatchArg();
  let cursor = 0;
  let updated = 0;
  let skipped = 0;
  let totalSeen = 0;

  let generalClusterId: string | null = null;

  while (true) {
    const rows = await db
      .select({
        id: agentRuns.id,
        trace: agentRuns.trace,
      })
      .from(agentRuns)
      .where(isNull(agentRuns.clusterId))
      .orderBy(asc(agentRuns.createdAt), asc(agentRuns.id))
      .limit(batchSize)
      .offset(cursor);

    if (rows.length === 0) break;
    cursor += rows.length;
    totalSeen += rows.length;

    for (const row of rows) {
      const { taskText, taskType } = extractTaskInfo(row.trace);
      if (taskText && taskText.trim().length > 0) {
        const signature = await ensureTaskSignature({
          rawText: taskText,
          taskType: taskType ?? "general",
        });
        await db
          .update(agentRuns)
          .set({
            clusterId: signature.clusterId,
            taskSignatureId: signature.id,
          })
          .where(eq(agentRuns.id, row.id));
        updated += 1;
        continue;
      }

      if (!generalClusterId) {
        const cluster = await ensureTaskCluster({
          normalizedText: "general unspecified",
          taskType: "general",
          tags: ["legacy", "unspecified"],
        });
        generalClusterId = cluster.id;
      }

      await db
        .update(agentRuns)
        .set({
          clusterId: generalClusterId,
        })
        .where(eq(agentRuns.id, row.id));
      updated += 1;
    }
    skipped = totalSeen - updated;
    console.log(`Processed ${totalSeen} rows. updated=${updated}, skipped=${skipped}`);
  }

  console.log("Recomputing GPG stats...");
  await recomputeAllClusterStats();
  console.log(`Backfill complete. updated=${updated}, skipped=${skipped}`);
}

main().catch((err) => {
  console.error("GPG backfill failed:", err);
  process.exit(1);
});
