#!/usr/bin/env node
/**
 * Self-hosted near-real-time crawler loop.
 * Runs hot-mode crawl every N minutes.
 *
 * Usage:
 *   node scripts/run-crawl-hot-loop.mjs
 * Env:
 *   CRAWL_HOT_INTERVAL_MS (default: 300000 / 5m)
 *   CRAWL_HOT_MAX_RESULTS (default: 500)
 *   CRAWL_HOT_GITHUB_BUDGET (default: 800)
 *   CRAWL_HOT_TIME_BUDGET_MS (default: 120000)
 */
import { spawn } from "node:child_process";

const intervalMs = Number(process.env.CRAWL_HOT_INTERVAL_MS ?? "300000");
const maxResults = Number(process.env.CRAWL_HOT_MAX_RESULTS ?? "500");
const githubBudget = Number(process.env.CRAWL_HOT_GITHUB_BUDGET ?? "800");
const timeBudgetMs = Number(process.env.CRAWL_HOT_TIME_BUDGET_MS ?? "120000");

function runOnce() {
  const child = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    [
      "tsx",
      "scripts/run-crawl.ts",
      String(maxResults),
      "--mode=hot",
      `--github-budget=${githubBudget}`,
      `--time-budget-ms=${timeBudgetMs}`,
    ],
    { stdio: "inherit", shell: false }
  );

  child.on("exit", (code) => {
    const ts = new Date().toISOString();
    console.log(`[${ts}] [CRAWL_HOT_LOOP] cycle finished with code=${code ?? 0}`);
  });
}

console.log(
  `[${new Date().toISOString()}] [CRAWL_HOT_LOOP] started intervalMs=${intervalMs} maxResults=${maxResults}`
);
runOnce();
setInterval(runOnce, intervalMs);

