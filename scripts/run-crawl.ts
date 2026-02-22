#!/usr/bin/env npx tsx
/**
 * Standalone crawler for Xpersona Search.
 * Full backfill (no date filter) — all sources.
 * Run: npx tsx scripts/run-crawl.ts [maxResults]
 *       npx tsx scripts/run-crawl.ts 100k  (100k-scale: aggressive limits for all sources)
 * Requires: DATABASE_URL, GITHUB_TOKEN (for GitHub sources)
 * Optional: maxResults (default 1500), or "100k" for full-scale
 */
import { config } from "dotenv";

config({ path: ".env.local" });

const arg = process.argv[2] ?? "1500";
const fullScale = arg === "100k" || arg === "100000" || parseInt(arg, 10) >= 50000;
const maxResults = fullScale ? 100000 : parseInt(arg, 10) || 1500;

if (fullScale) {
  process.env.CRAWL_BROAD_MODE = "1";
}

const limits = fullScale
  ? {
      openClaw: 2000,
      mcp: 800,
      clawhub: 10000,
      githubRepos: 15000,
      mcpRegistry: 1000,
      a2a: 500,
      pypi: 5000,
      npm: 5000,
      curated: 5000,
      huggingface: 20000,
      docker: 2000,
      agentscape: 500,
      replicate: 3000,
    }
  : {
      openClaw: maxResults,
      mcp: 400,
      clawhub: 5000,
      githubRepos: 2000,
      mcpRegistry: 500,
      a2a: 200,
      pypi: 500,
      npm: 250,
      curated: 2000,
      huggingface: 2000,
      docker: 300,
      agentscape: 200,
      replicate: 500,
    };

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const results: Array<{ source: string; total: number }> = [];

  if (fullScale) console.log("[100k-scale] CRAWL_BROAD_MODE=1, aggressive limits\n");

  if (process.env.GITHUB_TOKEN) {
    const { crawlOpenClawSkills } = await import("@/lib/search/crawlers/github-openclaw");
    const { crawlGitHubMCP } = await import("@/lib/search/crawlers/github-mcp");
    const { crawlClawHub } = await import("@/lib/search/crawlers/clawhub");
    console.log("[OpenClaw] Starting (max=%d)...", limits.openClaw);
    const r1 = await crawlOpenClawSkills(undefined, limits.openClaw);
    results.push({ source: "GITHUB_OPENCLEW", total: r1.total });
    console.log("[OpenClaw] Crawled", r1.total);
    console.log("[MCP] Starting (max=%d)...", limits.mcp);
    const r2 = await crawlGitHubMCP(undefined, limits.mcp);
    results.push({ source: "GITHUB_MCP", total: r2.total });
    console.log("[MCP] Crawled", r2.total);
    console.log("[ClawHub] Starting (max=%d)...", limits.clawhub);
    const rClaw = await crawlClawHub(limits.clawhub);
    results.push({ source: "CLAWHUB", total: rClaw.total });
    console.log("[ClawHub] Crawled", rClaw.total);
    const { crawlGitHubRepos } = await import("@/lib/search/crawlers/github-repos");
    console.log("[GitHub Repos] Starting (max=%d)...", limits.githubRepos);
    const rGhRepos = await crawlGitHubRepos(limits.githubRepos);
    results.push({ source: "GITHUB_REPOS", total: rGhRepos.total });
    console.log("[GitHub Repos] Crawled", rGhRepos.total);
  } else {
    console.warn("GITHUB_TOKEN not set — skipping GitHub crawlers");
  }

  const { crawlA2ARegistry } = await import("@/lib/search/crawlers/a2a-registry");
  const { crawlNpmPackages } = await import("@/lib/search/crawlers/npm");
  const { crawlMcpRegistry } = await import("@/lib/search/crawlers/mcp-registry");
  const rMcp = await crawlMcpRegistry(limits.mcpRegistry);
  results.push({ source: "MCP_REGISTRY", total: rMcp.total });
  console.log("[MCP Registry] Crawled", rMcp.total);
  const r3 = await crawlA2ARegistry(limits.a2a);
  results.push({ source: "A2A_REGISTRY", total: r3.total });
  const { crawlPypiPackages } = await import("@/lib/search/crawlers/pypi");
  const rPypi = await crawlPypiPackages(limits.pypi);
  results.push({ source: "PYPI", total: rPypi.total });
  console.log("[PyPI] Crawled", rPypi.total);
  const r4 = await crawlNpmPackages(limits.npm);
  results.push({ source: "NPM", total: r4.total });
  const { crawlCuratedSeeds } = await import("@/lib/search/crawlers/curated-seeds");
  const rCurated = await crawlCuratedSeeds(limits.curated);
  results.push({ source: "CURATED_SEEDS", total: rCurated.total });
  console.log("[Curated] Crawled", rCurated.total);
  const { crawlHuggingFaceSpaces } = await import("@/lib/search/crawlers/huggingface-spaces");
  const rHf = await crawlHuggingFaceSpaces(limits.huggingface);
  results.push({ source: "HUGGINGFACE", total: rHf.total });
  console.log("[HuggingFace] Crawled", rHf.total);
  const { crawlDockerHub } = await import("@/lib/search/crawlers/docker-hub");
  const { crawlAgentScape } = await import("@/lib/search/crawlers/agentscape");
  const { crawlReplicate } = await import("@/lib/search/crawlers/replicate");
  const rDocker = await crawlDockerHub(limits.docker);
  results.push({ source: "DOCKER", total: rDocker.total });
  console.log("[Docker] Crawled", rDocker.total);
  const rAgentscape = await crawlAgentScape(limits.agentscape);
  results.push({ source: "AGENTSCAPE", total: rAgentscape.total });
  console.log("[AgentScape] Crawled", rAgentscape.total);
  const rReplicate = await crawlReplicate(limits.replicate);
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
