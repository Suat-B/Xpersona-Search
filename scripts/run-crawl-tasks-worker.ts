#!/usr/bin/env npx tsx
import { config } from "dotenv";
import { enqueueSeedTask } from "@/lib/search/crawl-pipeline/seed";
import { runTaskWorkerLoop } from "@/lib/search/crawl-pipeline/worker";
import type { CrawlTaskType } from "@/lib/search/crawl-pipeline/types";

config({ path: ".env.local" });

type WorkerRole = "seed" | "fetch_extract" | "index" | "all";

const roleArg = process.argv
  .find((arg) => arg.startsWith("--role="))
  ?.split("=")[1]
  ?.toLowerCase();
const role = (roleArg ?? process.env.CRAWL_TASK_WORKER_ROLE ?? "all").toLowerCase() as WorkerRole;
const workerId =
  process.env.CRAWL_TASK_WORKER_ID ??
  `task-worker:${role}:${process.pid}:${Math.random().toString(36).slice(2, 8)}`;

function getTaskTypes(inputRole: WorkerRole): CrawlTaskType[] {
  if (inputRole === "seed") return ["seed"];
  if (inputRole === "fetch_extract") return ["fetch", "extract"];
  if (inputRole === "index") return ["index"];
  return ["seed", "fetch", "extract", "index"];
}

function getDefaultConcurrency(inputRole: WorkerRole): number {
  if (inputRole === "seed") return Number(process.env.CRAWL_TASK_SEED_CONCURRENCY ?? "2");
  if (inputRole === "fetch_extract") {
    return Number(process.env.CRAWL_TASK_FETCH_EXTRACT_CONCURRENCY ?? "16");
  }
  if (inputRole === "index") return Number(process.env.CRAWL_TASK_INDEX_CONCURRENCY ?? "8");
  return Number(process.env.CRAWL_TASK_ALL_CONCURRENCY ?? "12");
}

async function main() {
  const taskTypes = getTaskTypes(role);
  const concurrency = Math.max(1, getDefaultConcurrency(role));
  const pollIntervalMs = Math.max(
    250,
    Number(process.env.CRAWL_TASK_POLL_INTERVAL_MS ?? "1500")
  );
  const leaseMs = Math.max(10_000, Number(process.env.CRAWL_TASK_LEASE_MS ?? "60000"));

  console.log(
    `[${new Date().toISOString()}] [CRAWL_TASK_WORKER] start role=${role} workerId=${workerId} taskTypes=${taskTypes.join(
      ","
    )} concurrency=${concurrency}`
  );

  if (role === "seed" || role === "all") {
    await enqueueSeedTask("bootstrap");
  }

  await runTaskWorkerLoop({
    workerId,
    taskTypes,
    concurrency,
    pollIntervalMs,
    leaseMs,
  });
}

main().catch((err) => {
  console.error("[CRAWL_TASK_WORKER] fatal", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
