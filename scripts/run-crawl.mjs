#!/usr/bin/env node
/**
 * Standalone crawler entry point. Delegates to run-crawl.ts.
 * Run: node scripts/run-crawl.mjs [maxResults]
 * Or: npx tsx scripts/run-crawl.ts [maxResults]
 */
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptPath = join(__dirname, "run-crawl.ts");

const child = spawn("npx", ["tsx", scriptPath, ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: true,
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
