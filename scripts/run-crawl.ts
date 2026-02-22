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
    const { crawlClawHub } = await import("@/lib/search/crawlers/clawhub");
    console.log("[OpenClaw] Starting (full backfill, max=%d)...", maxResults);
    const r1 = await crawlOpenClawSkills(undefined, maxResults);
    results.push({ source: "GITHUB_OPENCLEW", total: r1.total });
    console.log("[OpenClaw] Crawled", r1.total);
    console.log("[MCP] Starting (max=400)...");
    const r2 = await crawlGitHubMCP(undefined, 400);
    results.push({ source: "GITHUB_MCP", total: r2.total });
    console.log("[MCP] Crawled", r2.total);
    console.log("[ClawHub] Starting (max=5000)...");
    const rClaw = await crawlClawHub(5000);
    results.push({ source: "CLAWHUB", total: rClaw.total });
    console.log("[ClawHub] Crawled", rClaw.total);
    const { crawlGitHubRepos } = await import("@/lib/search/crawlers/github-repos");
    console.log("[GitHub Repos] Starting (max=2000)...");
    const rGhRepos = await crawlGitHubRepos(2000);
    results.push({ source: "GITHUB_REPOS", total: rGhRepos.total });
    console.log("[GitHub Repos] Crawled", rGhRepos.total);
  } else {
    console.warn("GITHUB_TOKEN not set — skipping GitHub crawlers");
  }

  const { crawlA2ARegistry } = await import("@/lib/search/crawlers/a2a-registry");
  const { crawlNpmPackages } = await import("@/lib/search/crawlers/npm");
  const { crawlMcpRegistry } = await import("@/lib/search/crawlers/mcp-registry");
  const rMcp = await crawlMcpRegistry(500);
  results.push({ source: "MCP_REGISTRY", total: rMcp.total });
  console.log("[MCP Registry] Crawled", rMcp.total);
  const r3 = await crawlA2ARegistry(200);
  results.push({ source: "A2A_REGISTRY", total: r3.total });
  const { crawlPypiPackages } = await import("@/lib/search/crawlers/pypi");
  const rPypi = await crawlPypiPackages(500);
  results.push({ source: "PYPI", total: rPypi.total });
  console.log("[PyPI] Crawled", rPypi.total);
  const r4 = await crawlNpmPackages(250);
  results.push({ source: "NPM", total: r4.total });
  const { crawlCuratedSeeds } = await import("@/lib/search/crawlers/curated-seeds");
  const rCurated = await crawlCuratedSeeds(2000);
  results.push({ source: "CURATED_SEEDS", total: rCurated.total });
  console.log("[Curated] Crawled", rCurated.total);
  const { crawlHuggingFaceSpaces } = await import("@/lib/search/crawlers/huggingface-spaces");
  const rHf = await crawlHuggingFaceSpaces(2000);
  results.push({ source: "HUGGINGFACE", total: rHf.total });
  console.log("[HuggingFace] Crawled", rHf.total);
  const { crawlDockerHub } = await import("@/lib/search/crawlers/docker-hub");
  const { crawlAgentScape } = await import("@/lib/search/crawlers/agentscape");
  const { crawlReplicate } = await import("@/lib/search/crawlers/replicate");
  const rDocker = await crawlDockerHub(300);
  results.push({ source: "DOCKER", total: rDocker.total });
  console.log("[Docker] Crawled", rDocker.total);
  const rAgentscape = await crawlAgentScape(200);
  results.push({ source: "AGENTSCAPE", total: rAgentscape.total });
  console.log("[AgentScape] Crawled", rAgentscape.total);
  const rReplicate = await crawlReplicate(500);
  if (rReplicate.total > 0) results.push({ source: "REPLICATE", total: rReplicate.total });
  if (process.env.REPLICATE_API_TOKEN) console.log("[Replicate] Crawled", rReplicate.total);

  const total = results.reduce((s, r) => s + r.total, 0);
  console.log("\nTotal:", total, "agents");
  results.forEach((r) => console.log("  ", r.source + ":", r.total));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
