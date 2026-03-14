#!/usr/bin/env node
import { spawn } from "node:child_process";

const seedWorkers = Math.max(
  0,
  Number(process.env.CRAWL_TOPOLOGY_SEED_WORKERS ?? "2")
);
const fetchExtractWorkers = Math.max(
  0,
  Number(process.env.CRAWL_TOPOLOGY_FETCH_EXTRACT_WORKERS ?? "8")
);
const indexWorkers = Math.max(
  0,
  Number(process.env.CRAWL_TOPOLOGY_INDEX_WORKERS ?? "2")
);

const children = new Set();

function startWorker(role, index) {
  const workerId = `topology:${role}:${index}:${process.pid}`;
  const command = `npm run crawl:tasks:worker -- --role=${role}`;
  const child = spawn(
    command,
    {
      stdio: "inherit",
      shell: true,
      env: {
        ...process.env,
        CRAWL_TASK_WORKER_ID: workerId,
      },
    }
  );

  children.add(child);
  child.on("exit", (code, signal) => {
    children.delete(child);
    console.log(
      `[crawl-topology] worker_exit role=${role} index=${index} code=${code ?? "null"} signal=${
        signal ?? "null"
      }`
    );
    if (children.size === 0) {
      process.exit(code ?? 0);
    }
  });
}

for (let i = 1; i <= seedWorkers; i += 1) {
  startWorker("seed", i);
}
for (let i = 1; i <= fetchExtractWorkers; i += 1) {
  startWorker("fetch_extract", i);
}
for (let i = 1; i <= indexWorkers; i += 1) {
  startWorker("index", i);
}

console.log(
  `[crawl-topology] started seed=${seedWorkers} fetch_extract=${fetchExtractWorkers} index=${indexWorkers}`
);

if (seedWorkers + fetchExtractWorkers + indexWorkers === 0) {
  console.log("[crawl-topology] no workers requested, exiting");
  process.exit(0);
}

function shutdown(signal) {
  console.log(`[crawl-topology] shutdown signal=${signal}`);
  for (const child of children) {
    child.kill("SIGINT");
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
