#!/usr/bin/env npx tsx
/**
 * Standalone crawler for Xpersona Search.
 * Run: npx tsx scripts/run-crawl.ts [maxResults]
 * Requires: DATABASE_URL, GITHUB_TOKEN
 * Optional: maxResults (default 1000)
 */
import { config } from "dotenv";
import { crawlOpenClawSkills } from "@/lib/search/crawlers/github-openclaw";

config({ path: ".env.local" });

const maxResults = parseInt(process.argv[2] ?? "1000", 10);

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  if (!process.env.GITHUB_TOKEN) {
    console.error("GITHUB_TOKEN not set");
    process.exit(1);
  }

  console.log("Starting crawl (maxResults=%d)...", maxResults);
  const { total, jobId } = await crawlOpenClawSkills(undefined, maxResults);
  console.log("Crawled", total, "agents (jobId:", jobId, ")");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
