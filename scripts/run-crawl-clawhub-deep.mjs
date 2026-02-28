/**
 * One-command deep ClawHub crawl wrapper.
 * Sets opinionated defaults for downloads-sorted + archive-rich ingestion,
 * then runs the CLAWHUB-only crawler.
 *
 * Usage:
 *   node scripts/run-crawl-clawhub-deep.mjs
 *   node scripts/run-crawl-clawhub-deep.mjs 50000
 */
import { spawn } from "node:child_process";

const argv = process.argv.slice(2);
const maxResults = argv[0] && !argv[0].startsWith("--") ? argv[0] : "999999";
const passthrough = argv[0] && !argv[0].startsWith("--") ? argv.slice(1) : argv;

const env = {
  ...process.env,
  // TLS compatibility for Windows — prevent session corruption
  NODE_OPTIONS: [process.env.NODE_OPTIONS ?? "", "--tls-min-v1.2"].filter(Boolean).join(" "),
  // ── Aggressive performance tuning ──
  CLAWHUB_DETAIL_CONCURRENCY: process.env.CLAWHUB_DETAIL_CONCURRENCY ?? "8",
  CLAWHUB_API_PAGE_DELAY_MS: process.env.CLAWHUB_API_PAGE_DELAY_MS ?? "100",
  CLAWHUB_API_BASE_BACKOFF_MS: process.env.CLAWHUB_API_BASE_BACKOFF_MS ?? "500",
  CLAWHUB_PAGE_LIMIT: process.env.CLAWHUB_PAGE_LIMIT ?? "500",
  CLAWHUB_PAGE_META_TIMEOUT_MS: process.env.CLAWHUB_PAGE_META_TIMEOUT_MS ?? "8000",
  CLAWHUB_API_MAX_RETRIES: process.env.CLAWHUB_API_MAX_RETRIES ?? "4",
  // ── Sort + Archive config ──
  CLAWHUB_SORT: process.env.CLAWHUB_SORT ?? "downloads",
  CLAWHUB_DIR: process.env.CLAWHUB_DIR ?? "desc",
  CLAWHUB_ARCHIVE_ENABLED: process.env.CLAWHUB_ARCHIVE_ENABLED ?? "1",
  CLAWHUB_ARCHIVE_MAX_VERSIONS: process.env.CLAWHUB_ARCHIVE_MAX_VERSIONS ?? "2",
  CLAWHUB_ARCHIVE_MAX_DOWNLOAD_BYTES:
    process.env.CLAWHUB_ARCHIVE_MAX_DOWNLOAD_BYTES ?? "10000000",
  CLAWHUB_ARCHIVE_MAX_FILES_PER_VERSION:
    process.env.CLAWHUB_ARCHIVE_MAX_FILES_PER_VERSION ?? "400",
  CLAWHUB_ARCHIVE_MAX_TEXT_FILES_PER_VERSION:
    process.env.CLAWHUB_ARCHIVE_MAX_TEXT_FILES_PER_VERSION ?? "12",
  CLAWHUB_ARCHIVE_MAX_TEXT_BYTES_PER_FILE:
    process.env.CLAWHUB_ARCHIVE_MAX_TEXT_BYTES_PER_FILE ?? "250000",
  CLAWHUB_ARCHIVE_MAX_TEXT_CHARS_PER_FILE:
    process.env.CLAWHUB_ARCHIVE_MAX_TEXT_CHARS_PER_FILE ?? "50000",
  CLAWHUB_ARCHIVE_MAX_TOTAL_TEXT_CHARS_PER_SKILL:
    process.env.CLAWHUB_ARCHIVE_MAX_TOTAL_TEXT_CHARS_PER_SKILL ?? "140000",
};

const isWin = process.platform === "win32";
const runner = isWin ? "cmd" : "npx";
const args = isWin
  ? ["/d", "/s", "/c", "npx", "tsx", "scripts/run-crawl.ts", maxResults, "--sources=CLAWHUB", ...passthrough]
  : ["tsx", "scripts/run-crawl.ts", maxResults, "--sources=CLAWHUB", ...passthrough];

const child = spawn(runner, args, {
  env,
  stdio: "inherit",
  shell: false,
});

child.on("exit", (code, signal) => {
  if (typeof code === "number") {
    process.exit(code);
  }
  if (signal) {
    process.kill(process.pid, signal);
  }
  process.exit(1);
});

child.on("error", (err) => {
  console.error("[CRAWL] Failed to start deep ClawHub crawl:", err);
  process.exit(1);
});
