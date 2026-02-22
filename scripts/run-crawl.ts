#!/usr/bin/env npx tsx
/**
 * Standalone crawler for Xpersona Search.
 * Full backfill (no date filter) — all sources.
 * Run: npx tsx scripts/run-crawl.ts [maxResults]
 * Requires: DATABASE_URL, GITHUB_TOKEN (for GitHub sources)
 * Optional: maxResults (default 1500)
 */
import { config } from "dotenv";

config({ path: ".env.local" });

const maxResults = parseInt(process.argv[2] ?? "1500", 10);

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const results: Array<{ source: string; total: number }> = [];

  if (process.env.GITHUB_TOKEN) {
    const { crawlOpenClawSkills } = await import("@/lib/search/crawlers/github-openclaw");
    const { crawlGitHubMCP } = await import("@/lib/search/crawlers/github-mcp");
    console.log("[OpenClaw] Starting (full backfill, max=%d)...", maxResults);
    const r1 = await crawlOpenClawSkills(undefined, maxResults);
    results.push({ source: "GITHUB_OPENCLEW", total: r1.total });
    console.log("[OpenClaw] Crawled", r1.total);
    console.log("[MCP] Starting (max=400)...");
    const r2 = await crawlGitHubMCP(undefined, 400);
    results.push({ source: "GITHUB_MCP", total: r2.total });
    console.log("[MCP] Crawled", r2.total);
  } else {
    console.warn("GITHUB_TOKEN not set — skipping GitHub crawlers");
  }

  const { crawlA2ARegistry } = await import("@/lib/search/crawlers/a2a-registry");
  const { crawlNpmPackages } = await import("@/lib/search/crawlers/npm");
  const r3 = await crawlA2ARegistry(200);
  results.push({ source: "A2A_REGISTRY", total: r3.total });
  const r4 = await crawlNpmPackages(250);
  results.push({ source: "NPM", total: r4.total });

  const total = results.reduce((s, r) => s + r.total, 0);
  console.log("\nTotal:", total, "agents");
  results.forEach((r) => console.log("  ", r.source + ":", r.total));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
