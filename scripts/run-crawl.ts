#!/usr/bin/env npx tsx
/**
 * Standalone crawler for Xpersona Search.
 * Full backfill (no date filter) — all sources.
 *
 * Run: npx tsx scripts/run-crawl.ts [maxResults]
 *      npx tsx scripts/run-crawl.ts 100k  (100k-scale: aggressive limits)
 *      npx tsx scripts/run-crawl.ts 100k --sources=GITHUB_MCP,CLAWHUB  (run only these)
 *
 * Requires: DATABASE_URL, GITHUB_TOKEN (for GitHub sources)
 */
import { config } from "dotenv";

config({ path: ".env.local" });

const args = process.argv.slice(2);
const maxArg = args.find((a) => !a.startsWith("--"));
const sourcesArg = args.find((a) => a.startsWith("--sources="));

const arg = maxArg ?? "1500";
const fullScale = arg === "100k" || arg === "100000" || parseInt(arg, 10) >= 50000;
const maxResults = fullScale ? 100000 : parseInt(arg, 10) || 1500;

const selectedSources = sourcesArg
  ? new Set(
      sourcesArg
        .replace("--sources=", "")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    )
  : null;

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

function log(source: string, msg: string, ...rest: unknown[]) {
  const ts = new Date().toISOString();
  let out = msg;
  for (const v of rest) out = out.replace(/%[sd]/, String(v));
  console.log(`[${ts}] [${source}]`, out);
}

type CrawlResult = { source: string; total: number; error?: string };

async function runCrawler(
  source: string,
  fn: () => Promise<{ total: number }>
): Promise<CrawlResult> {
  try {
    const r = await fn();
    return { source, total: r.total };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { source, total: 0, error: msg };
  }
}

function shouldRun(source: string): boolean {
  if (!selectedSources) return true;
  return selectedSources.has(source.toUpperCase());
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const results: CrawlResult[] = [];

  if (fullScale) log("CRAWL", "100k-scale CRAWL_BROAD_MODE=1, aggressive limits\n");

  if (process.env.GITHUB_TOKEN) {
    if (shouldRun("GITHUB_OPENCLEW")) {
      const { crawlOpenClawSkills } = await import("@/lib/search/crawlers/github-openclaw");
      log("GITHUB_OPENCLEW", "Starting (max=%d)...", limits.openClaw);
      const r = await runCrawler("GITHUB_OPENCLEW", () =>
        crawlOpenClawSkills(undefined, limits.openClaw)
      );
      results.push(r);
      if (r.error) log("GITHUB_OPENCLEW", "Failed:", r.error);
      else log("GITHUB_OPENCLEW", "Crawled %d", r.total);
    }
    if (shouldRun("GITHUB_MCP")) {
      const { crawlGitHubMCP } = await import("@/lib/search/crawlers/github-mcp");
      log("GITHUB_MCP", "Starting (max=%d)...", limits.mcp);
      const r = await runCrawler("GITHUB_MCP", () => crawlGitHubMCP(undefined, limits.mcp));
      results.push(r);
      if (r.error) log("GITHUB_MCP", "Failed:", r.error);
      else log("GITHUB_MCP", "Crawled %d", r.total);
    }
    if (shouldRun("CLAWHUB")) {
      const { crawlClawHub } = await import("@/lib/search/crawlers/clawhub");
      log("CLAWHUB", "Starting (max=%d)...", limits.clawhub);
      const r = await runCrawler("CLAWHUB", () => crawlClawHub(limits.clawhub));
      results.push(r);
      if (r.error) log("CLAWHUB", "Failed:", r.error);
      else log("CLAWHUB", "Crawled %d", r.total);
    }
    if (shouldRun("GITHUB_REPOS")) {
      const { crawlGitHubRepos } = await import("@/lib/search/crawlers/github-repos");
      log("GITHUB_REPOS", "Starting (max=%d)...", limits.githubRepos);
      const r = await runCrawler("GITHUB_REPOS", () => crawlGitHubRepos(limits.githubRepos));
      results.push(r);
      if (r.error) log("GITHUB_REPOS", "Failed:", r.error);
      else log("GITHUB_REPOS", "Crawled %d", r.total);
    }
  } else if (shouldRun("GITHUB_OPENCLEW") || shouldRun("GITHUB_MCP") || shouldRun("CLAWHUB") || shouldRun("GITHUB_REPOS")) {
    log("CRAWL", "GITHUB_TOKEN not set — skipping GitHub crawlers");
  }

  if (shouldRun("MCP_REGISTRY")) {
    const { crawlMcpRegistry } = await import("@/lib/search/crawlers/mcp-registry");
    log("MCP_REGISTRY", "Starting (max=%d)...", limits.mcpRegistry);
    const r = await runCrawler("MCP_REGISTRY", () => crawlMcpRegistry(limits.mcpRegistry));
    results.push(r);
    if (r.error) log("MCP_REGISTRY", "Failed:", r.error);
    else log("MCP_REGISTRY", "Crawled %d", r.total);
  }
  if (shouldRun("A2A_REGISTRY")) {
    const { crawlA2ARegistry } = await import("@/lib/search/crawlers/a2a-registry");
    log("A2A_REGISTRY", "Starting (max=%d)...", limits.a2a);
    const r = await runCrawler("A2A_REGISTRY", () => crawlA2ARegistry(limits.a2a));
    results.push(r);
    if (r.error) log("A2A_REGISTRY", "Failed:", r.error);
    else log("A2A_REGISTRY", "Crawled %d", r.total);
  }
  if (shouldRun("PYPI")) {
    const { crawlPypiPackages } = await import("@/lib/search/crawlers/pypi");
    log("PYPI", "Starting (max=%d)...", limits.pypi);
    const r = await runCrawler("PYPI", () => crawlPypiPackages(limits.pypi));
    results.push(r);
    if (r.error) log("PYPI", "Failed:", r.error);
    else log("PYPI", "Crawled %d", r.total);
  }
  if (shouldRun("NPM")) {
    const { crawlNpmPackages } = await import("@/lib/search/crawlers/npm");
    log("NPM", "Starting (max=%d)...", limits.npm);
    const r = await runCrawler("NPM", () => crawlNpmPackages(limits.npm));
    results.push(r);
    if (r.error) log("NPM", "Failed:", r.error);
    else log("NPM", "Crawled %d", r.total);
  }
  if (shouldRun("CURATED_SEEDS")) {
    const { crawlCuratedSeeds } = await import("@/lib/search/crawlers/curated-seeds");
    log("CURATED_SEEDS", "Starting (max=%d)...", limits.curated);
    const r = await runCrawler("CURATED_SEEDS", () => crawlCuratedSeeds(limits.curated));
    results.push(r);
    if (r.error) log("CURATED_SEEDS", "Failed:", r.error);
    else log("CURATED_SEEDS", "Crawled %d", r.total);
  }
  if (shouldRun("HUGGINGFACE")) {
    const { crawlHuggingFaceSpaces } = await import("@/lib/search/crawlers/huggingface-spaces");
    log("HUGGINGFACE", "Starting (max=%d)...", limits.huggingface);
    const r = await runCrawler("HUGGINGFACE", () => crawlHuggingFaceSpaces(limits.huggingface));
    results.push(r);
    if (r.error) log("HUGGINGFACE", "Failed:", r.error);
    else log("HUGGINGFACE", "Crawled %d", r.total);
  }
  if (shouldRun("DOCKER")) {
    const { crawlDockerHub } = await import("@/lib/search/crawlers/docker-hub");
    log("DOCKER", "Starting (max=%d)...", limits.docker);
    const r = await runCrawler("DOCKER", () => crawlDockerHub(limits.docker));
    results.push(r);
    if (r.error) log("DOCKER", "Failed:", r.error);
    else log("DOCKER", "Crawled %d", r.total);
  }
  if (shouldRun("AGENTSCAPE")) {
    const { crawlAgentScape } = await import("@/lib/search/crawlers/agentscape");
    log("AGENTSCAPE", "Starting (max=%d)...", limits.agentscape);
    const r = await runCrawler("AGENTSCAPE", () => crawlAgentScape(limits.agentscape));
    results.push(r);
    if (r.error) log("AGENTSCAPE", "Failed:", r.error);
    else log("AGENTSCAPE", "Crawled %d", r.total);
  }
  if (shouldRun("REPLICATE")) {
    const { crawlReplicate } = await import("@/lib/search/crawlers/replicate");
    log("REPLICATE", "Starting (max=%d)...", limits.replicate);
    const r = await runCrawler("REPLICATE", () => crawlReplicate(limits.replicate));
    if (r.total > 0 || r.error) results.push(r);
    if (r.error) log("REPLICATE", "Failed:", r.error);
    else if (process.env.REPLICATE_API_TOKEN) log("REPLICATE", "Crawled %d", r.total);
  }

  const total = results.reduce((s, r) => s + r.total, 0);
  const succeeded = results.filter((r) => !r.error);
  const failed = results.filter((r) => r.error);

  log("CRAWL", "\n--- Summary ---");
  log("CRAWL", "Total agents: %d", total);
  if (succeeded.length > 0) {
    succeeded.forEach((r) => log("CRAWL", "  OK %s: %d", r.source, r.total));
  }
  if (failed.length > 0) {
    failed.forEach((r) => log("CRAWL", "  FAIL %s: %s", r.source, r.error));
  }

  if (succeeded.length === 0 && failed.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
