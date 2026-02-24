#!/usr/bin/env node
/**
 * Dedicated crawler worker:
 * - Hot incremental loop every N minutes.
 * - Nightly deep backfill.
 * - Stale RUNNING job reaper at startup and before deep run.
 */
import { spawn } from "node:child_process";
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local" });

const workerId =
  process.env.CRAWL_WORKER_ID ??
  `worker-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
const intervalMs = Number(process.env.CRAWL_WORKER_HOT_INTERVAL_MS ?? "300000");
const hotMaxResults = Number(process.env.CRAWL_WORKER_HOT_MAX_RESULTS ?? "500");
const hotGithubBudget = Number(process.env.CRAWL_WORKER_HOT_GITHUB_BUDGET ?? "800");
const hotTimeBudgetMs = Number(process.env.CRAWL_WORKER_HOT_TIME_BUDGET_MS ?? "120000");
const hotSources =
  process.env.CRAWL_WORKER_HOT_SOURCES ??
  "GITHUB_OPENCLEW,GITHUB_MCP,GITHUB_REPOS,CREWAI,VERCEL_TEMPLATES";
const backfillArg = process.env.CRAWL_WORKER_BACKFILL_SIZE ?? "100k";
const backfillHourUtc = Number(process.env.CRAWL_WORKER_BACKFILL_HOUR_UTC ?? "6");
const backfillMinuteUtc = Number(process.env.CRAWL_WORKER_BACKFILL_MINUTE_UTC ?? "0");
const backfillGithubBudget = Number(process.env.CRAWL_WORKER_BACKFILL_GITHUB_BUDGET ?? "12000");
const backfillTimeBudgetMs = Number(
  process.env.CRAWL_WORKER_BACKFILL_TIME_BUDGET_MS ?? "7200000"
);
const backfillSources = process.env.CRAWL_WORKER_BACKFILL_SOURCES ?? "";
const staleMs = Number(process.env.CRAWL_WORKER_STALE_MS ?? "1800000");

let running = false;
let lastBackfillDate = "";

function log(message, ...args) {
  const ts = new Date().toISOString();
  let out = message;
  for (const value of args) out = out.replace(/%s|%d/, String(value));
  console.log(`[${ts}] [CRAWL_WORKER] ${out}`);
}

async function reapStaleJobs() {
  if (!process.env.DATABASE_URL) {
    log("DATABASE_URL not set, stale reaper skipped");
    return 0;
  }

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const cutoff = new Date(Date.now() - staleMs);
    const res = await client.query(
      `UPDATE crawl_jobs
       SET
         status = 'FAILED',
         completed_at = now(),
         heartbeat_at = now(),
         finished_reason = 'stale_reaped',
         error = COALESCE(NULLIF(error, ''), 'Job stale heartbeat timeout')
       WHERE status = 'RUNNING'
         AND COALESCE(heartbeat_at, started_at, created_at) <= $1`,
      [cutoff]
    );
    return res.rowCount ?? 0;
  } finally {
    await client.end();
  }
}

function runCrawl(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["tsx", "scripts/run-crawl.ts", ...args],
      {
        stdio: "inherit",
        shell: false,
        env: {
          ...process.env,
          CRAWL_WORKER_ID: workerId,
          CRAWL_GITHUB_IN_CRON: "0",
        },
      }
    );
    child.on("error", reject);
    child.on("exit", (code) => {
      if ((code ?? 0) === 0) resolve();
      else reject(new Error(`crawl process exited with code ${code ?? 0}`));
    });
  });
}

async function runHotCycle() {
  if (running) {
    log("hot cycle skipped because previous cycle is still running");
    return;
  }
  running = true;
  try {
    log("hot cycle starting");
    await runCrawl([
      String(hotMaxResults),
      "--mode=hot",
      `--github-budget=${hotGithubBudget}`,
      `--time-budget-ms=${hotTimeBudgetMs}`,
      `--sources=${hotSources}`,
    ]);
    log("hot cycle completed");
  } catch (err) {
    log("hot cycle failed: %s", err instanceof Error ? err.message : String(err));
  } finally {
    running = false;
  }
}

async function maybeRunNightlyBackfill() {
  const now = new Date();
  const dateKey = now.toISOString().slice(0, 10);
  if (dateKey === lastBackfillDate) return;
  if (now.getUTCHours() !== backfillHourUtc || now.getUTCMinutes() !== backfillMinuteUtc) {
    return;
  }
  if (running) {
    log("nightly backfill deferred: worker busy");
    return;
  }
  running = true;
  try {
    const reaped = await reapStaleJobs();
    log("nightly preflight stale reaper affected=%d", reaped);
    const args = [
      String(backfillArg),
      "--mode=backfill",
      `--github-budget=${backfillGithubBudget}`,
      `--time-budget-ms=${backfillTimeBudgetMs}`,
    ];
    if (backfillSources.trim()) args.push(`--sources=${backfillSources}`);
    log("nightly backfill starting");
    await runCrawl(args);
    lastBackfillDate = dateKey;
    log("nightly backfill completed");
  } catch (err) {
    log("nightly backfill failed: %s", err instanceof Error ? err.message : String(err));
  } finally {
    running = false;
  }
}

async function main() {
  log("worker starting id=%s intervalMs=%d", workerId, intervalMs);
  const reaped = await reapStaleJobs();
  log("startup stale reaper affected=%d", reaped);

  await runHotCycle();
  setInterval(runHotCycle, intervalMs);
  setInterval(maybeRunNightlyBackfill, 60_000);
}

main().catch((err) => {
  log("worker fatal: %s", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
