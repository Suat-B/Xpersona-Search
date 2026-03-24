#!/usr/bin/env npx tsx
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { and, asc, eq, gt } from "drizzle-orm";
import { materializeAgentEvidence } from "@/lib/agents/evidence-materializer";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import {
  completeJob,
  failJob,
  heartbeatJob,
  startJob,
} from "@/lib/search/crawlers/job-lifecycle";

const SOURCE = "AGENT_FACTS_BACKFILL";

function getArg(name: string): string | null {
  const direct = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1] ?? null;
  return null;
}

function toPositiveInt(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

interface BackfillSummary {
  scanned: number;
  updatedAgents: number;
  factsInserted: number;
  changeEventsInserted: number;
  cursor: string | null;
  failures: Array<{ slug: string; message: string }>;
}

async function loadBatch(cursor: string | null, batchSize: number) {
  const base = db
    .select({
      id: agents.id,
      slug: agents.slug,
    })
    .from(agents)
    .orderBy(asc(agents.slug))
    .limit(batchSize);

  if (!cursor) {
    return base.where(and(eq(agents.status, "ACTIVE"), eq(agents.publicSearchable, true)));
  }

  return base.where(
    and(
      eq(agents.status, "ACTIVE"),
      eq(agents.publicSearchable, true),
      gt(agents.slug, cursor)
    )
  );
}

async function runBackfill(params: {
  limit: number;
  cursor: string | null;
  batchSize: number;
  jobId: string;
}): Promise<BackfillSummary> {
  let cursor = params.cursor;
  let scanned = 0;
  let updatedAgents = 0;
  let factsInserted = 0;
  let changeEventsInserted = 0;
  const failures: Array<{ slug: string; message: string }> = [];

  while (true) {
    if (params.limit > 0 && scanned >= params.limit) break;
    const remaining = params.limit > 0 ? Math.max(1, params.limit - scanned) : params.batchSize;
    const batch = await loadBatch(cursor, Math.min(params.batchSize, remaining));
    if (batch.length === 0) break;

    for (const row of batch) {
      if (params.limit > 0 && scanned >= params.limit) break;
      scanned += 1;
      cursor = row.slug;

      try {
        const result = await materializeAgentEvidence({ agentId: row.id, slug: row.slug });
        if (result) {
          updatedAgents += 1;
          factsInserted += result.factsInserted;
          changeEventsInserted += result.changeEventsInserted;
        } else {
          failures.push({
            slug: row.slug,
            message: "Agent was missing or not eligible for public materialization.",
          });
        }
      } catch (error) {
        failures.push({
          slug: row.slug,
          message: error instanceof Error ? error.message : String(error),
        });
      }

      if (scanned % 50 === 0) {
        await heartbeatJob(params.jobId, {
          agentsFound: scanned,
          agentsUpdated: updatedAgents,
          skipped: failures.length,
          cursorSnapshot: { cursor },
        });
      }
    }
  }

  return {
    scanned,
    updatedAgents,
    factsInserted,
    changeEventsInserted,
    cursor,
    failures,
  };
}

async function main() {
  const limitArg = getArg("--limit");
  const cursorArg = getArg("--cursor");
  const batchSizeArg = getArg("--batch-size");

  const limit = toPositiveInt(limitArg, 0);
  const batchSize = toPositiveInt(
    batchSizeArg,
    toPositiveInt(process.env.AGENT_FACTS_BACKFILL_BATCH_SIZE, 200)
  );
  const workerId = `backfill-agent-facts:${process.pid}`;

  const { jobId } = await startJob({
    source: SOURCE,
    mode: "backfill",
    workerId,
  });

  try {
    const summary = await runBackfill({
      limit,
      cursor: cursorArg ?? null,
      batchSize,
      jobId,
    });

    await completeJob(jobId, {
      agentsFound: summary.scanned,
      agentsUpdated: summary.updatedAgents,
      skipped: summary.failures.length,
      finishedReason: summary.failures.length > 0 ? "completed_with_failures" : "completed",
      cursorSnapshot: {
        cursor: summary.cursor,
        factsInserted: summary.factsInserted,
        changeEventsInserted: summary.changeEventsInserted,
      },
    });

    const output = {
      source: SOURCE,
      jobId,
      scanned: summary.scanned,
      updatedAgents: summary.updatedAgents,
      factsInserted: summary.factsInserted,
      changeEventsInserted: summary.changeEventsInserted,
      cursor: summary.cursor,
      failures: summary.failures.slice(0, 50),
      failureCount: summary.failures.length,
    };
    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    await failJob(jobId, error, {
      finishedReason: "failed",
    });
    throw error;
  }
}

main().catch((error) => {
  console.error("[backfill-agent-facts] failed", error);
  process.exit(1);
});
