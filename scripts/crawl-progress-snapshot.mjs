#!/usr/bin/env node
import { Client } from "pg";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

function asNumber(value) {
  return Number(value ?? 0);
}

export async function buildSnapshot() {
  const target = Number(process.env.CRAWL_PROGRESS_TARGET ?? "500000");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const docsTotal = asNumber(
      (await client.query("SELECT COUNT(*)::int AS c FROM search_documents")).rows[0]?.c
    );
    const docs1m = asNumber(
      (
        await client.query(
          "SELECT COUNT(*)::int AS c FROM search_documents WHERE indexed_at >= now() - interval '1 minute'"
        )
      ).rows[0]?.c
    );
    const docs5m = asNumber(
      (
        await client.query(
          "SELECT COUNT(*)::int AS c FROM search_documents WHERE indexed_at >= now() - interval '5 minutes'"
        )
      ).rows[0]?.c
    );
    const docs15m = asNumber(
      (
        await client.query(
          "SELECT COUNT(*)::int AS c FROM search_documents WHERE indexed_at >= now() - interval '15 minutes'"
        )
      ).rows[0]?.c
    );

    const queue = (
      await client.query(`
        SELECT task_type, status, COUNT(*)::int AS count
        FROM crawl_tasks
        GROUP BY task_type, status
        ORDER BY task_type, status
      `)
    ).rows;

    const failedTop = (
      await client.query(`
        SELECT task_type, COALESCE(last_error, '') AS last_error, COUNT(*)::int AS count
        FROM crawl_tasks
        WHERE status = 'FAILED'
        GROUP BY task_type, COALESCE(last_error, '')
        ORDER BY count DESC
        LIMIT 8
      `)
    ).rows;

    const perMin15m = docs15m / 15;
    const remaining = Math.max(0, target - docsTotal);
    const etaMinutes = perMin15m > 0 ? remaining / perMin15m : null;

    return {
      at: new Date().toISOString(),
      docs: {
        total: docsTotal,
        last1m: docs1m,
        last5m: docs5m,
        last15m: docs15m,
        perMin15m: Number(perMin15m.toFixed(2)),
      },
      target: {
        goal: target,
        remaining,
        etaMinutesAt15mRate: etaMinutes == null ? null : Number(etaMinutes.toFixed(1)),
      },
      queue,
      failedTop,
    };
  } finally {
    await client.end();
  }
}

async function main() {
  const snapshot = await buildSnapshot();
  console.log(JSON.stringify(snapshot));
}

const isDirectRun = process.argv[1]?.endsWith("crawl-progress-snapshot.mjs");
if (isDirectRun) {
  main().catch((err) => {
    console.error("[crawl-progress-snapshot] error", err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}

