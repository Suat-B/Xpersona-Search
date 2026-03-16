#!/usr/bin/env node
import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildSnapshot } from "./crawl-progress-snapshot.mjs";

const intervalSeconds = Math.max(30, Number(process.env.CRAWL_PROGRESS_INTERVAL_SEC ?? "600"));
const outputPath = resolve(process.cwd(), process.env.CRAWL_PROGRESS_LOG_PATH ?? "logs/crawl-progress.log");

async function writeLine(line) {
  await mkdir(dirname(outputPath), { recursive: true });
  await appendFile(outputPath, `${line}\n`, "utf8");
}

async function runOnce() {
  const snapshot = await buildSnapshot();
  const line = JSON.stringify(snapshot);
  console.log(line);
  await writeLine(line);
}

async function main() {
  console.log(
    `[crawl-progress-monitor] start intervalSec=${intervalSeconds} output=${outputPath}`
  );
  while (true) {
    try {
      await runOnce();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const failureLine = JSON.stringify({
        at: new Date().toISOString(),
        error: message,
      });
      console.error(failureLine);
      await writeLine(failureLine);
    }
    await new Promise((resolveTimer) => setTimeout(resolveTimer, intervalSeconds * 1000));
  }
}

main().catch((err) => {
  console.error("[crawl-progress-monitor] fatal", err instanceof Error ? err.message : String(err));
  process.exit(1);
});

