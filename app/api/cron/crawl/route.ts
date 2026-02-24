import { NextRequest, NextResponse } from "next/server";
import { runCrawlPool, type CrawlTask } from "@/lib/search/crawlers/pool";
import { crawlOpenClawSkills } from "@/lib/search/crawlers/github-openclaw";
import { crawlGitHubMCP } from "@/lib/search/crawlers/github-mcp";
import { crawlClawHub } from "@/lib/search/crawlers/clawhub";
import { crawlGitHubRepos } from "@/lib/search/crawlers/github-repos";
import { crawlMcpRegistry } from "@/lib/search/crawlers/mcp-registry";
import { crawlPypiPackages } from "@/lib/search/crawlers/pypi";
import { crawlCuratedSeeds } from "@/lib/search/crawlers/curated-seeds";
import { crawlHuggingFaceSpaces } from "@/lib/search/crawlers/huggingface-spaces";
import { crawlDockerHub } from "@/lib/search/crawlers/docker-hub";
import { crawlAgentScape } from "@/lib/search/crawlers/agentscape";
import { crawlReplicate } from "@/lib/search/crawlers/replicate";
import { crawlA2ARegistry } from "@/lib/search/crawlers/a2a-registry";
import { crawlNpmPackages } from "@/lib/search/crawlers/npm";
import { crawlAwesomeLists } from "@/lib/search/crawlers/awesome-lists";
import { crawlSmithery } from "@/lib/search/crawlers/smithery";
import type { CrawlMode, CrawlRuntimeOptions } from "@/lib/search/crawlers/crawler-mode";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sinceDays = parseInt(process.env.CRAWL_SINCE_DAYS ?? "0", 10);
  const since =
    sinceDays <= 0
      ? undefined
      : new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const maxResults = parseInt(process.env.CRAWL_MAX_RESULTS ?? "500", 10);
  const batchSize = parseInt(process.env.CRAWL_BATCH_SIZE ?? "2000", 10);
  const sourceFilter = (process.env.CRAWL_SOURCE_FILTER ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const runSource = (name: string) =>
    sourceFilter.length === 0 || sourceFilter.includes(name.toUpperCase());
  const mode = (process.env.CRAWL_MODE ?? "backfill").toLowerCase() as CrawlMode;
  const runtimeOptions: CrawlRuntimeOptions = {
    mode: mode === "hot" || mode === "warm" ? mode : "backfill",
    githubBudget: parseInt(process.env.CRAWL_GITHUB_BUDGET ?? "800", 10),
    timeBudgetMs: parseInt(process.env.CRAWL_TIME_BUDGET_MS ?? "120000", 10),
    lockOwner: "cron-crawl",
  };

  const tasks: CrawlTask[] = [];

  if (process.env.GITHUB_TOKEN) {
    if (runSource("GITHUB_OPENCLEW")) {
      tasks.push({
        source: "GITHUB_OPENCLEW",
        bucket: "github",
        fn: () => crawlOpenClawSkills(since, maxResults, runtimeOptions),
      });
    }
    if (runSource("GITHUB_MCP")) {
      tasks.push({
        source: "GITHUB_MCP",
        bucket: "github",
        fn: () => crawlGitHubMCP(since, Math.min(maxResults, 300), runtimeOptions),
      });
    }
    if (runSource("CLAWHUB")) {
      tasks.push({
        source: "CLAWHUB",
        bucket: "github",
        fn: () => crawlClawHub(Math.min(maxResults * 10, 5000)),
      });
    }
    if (runSource("GITHUB_REPOS")) {
      tasks.push({
        source: "GITHUB_REPOS",
        bucket: "github",
        fn: () => crawlGitHubRepos(Math.min(maxResults * 4, 2000), runtimeOptions),
      });
    }
  }

  if (runSource("MCP_REGISTRY")) {
    tasks.push({
      source: "MCP_REGISTRY",
      bucket: "registry",
      fn: () => crawlMcpRegistry(500),
    });
  }
  if (runSource("A2A_REGISTRY")) {
    tasks.push({
      source: "A2A_REGISTRY",
      bucket: "registry",
      fn: () => crawlA2ARegistry(200),
    });
  }
  if (runSource("AGENTSCAPE")) {
    tasks.push({
      source: "AGENTSCAPE",
      bucket: "registry",
      fn: () => crawlAgentScape(200),
    });
  }
  if (runSource("SMITHERY")) {
    tasks.push({
      source: "SMITHERY",
      bucket: "registry",
      fn: () => crawlSmithery(500),
    });
  }
  if (runSource("PYPI")) {
    tasks.push({
      source: "PYPI",
      bucket: "package",
      fn: () => crawlPypiPackages(Math.min(maxResults * 2, 500)),
    });
  }
  if (runSource("NPM")) {
    tasks.push({
      source: "NPM",
      bucket: "package",
      fn: () => crawlNpmPackages(200),
    });
  }
  if (runSource("CURATED_SEEDS")) {
    tasks.push({
      source: "CURATED_SEEDS",
      bucket: "github",
      fn: () => crawlCuratedSeeds(2000),
    });
  }
  if (runSource("AWESOME_LISTS")) {
    tasks.push({
      source: "AWESOME_LISTS",
      bucket: "github",
      fn: () => crawlAwesomeLists(2000),
    });
  }
  if (runSource("HUGGINGFACE")) {
    tasks.push({
      source: "HUGGINGFACE",
      bucket: "platform",
      fn: () => crawlHuggingFaceSpaces(batchSize),
    });
  }
  if (runSource("DOCKER")) {
    tasks.push({
      source: "DOCKER",
      bucket: "platform",
      fn: () => crawlDockerHub(300),
    });
  }
  if (runSource("REPLICATE")) {
    tasks.push({
      source: "REPLICATE",
      bucket: "platform",
      fn: () => crawlReplicate(500),
    });
  }

  const results = await runCrawlPool(tasks);
  const total = results.reduce((sum, r) => sum + r.total, 0);
  const errors = results.filter((r) => r.error);

  return NextResponse.json({
    success: errors.length === 0 || total > 0,
    total,
    bySource: results.map((r) => ({
      source: r.source,
      total: r.total,
      durationMs: r.durationMs,
      ...(r.error ? { error: r.error } : {}),
    })),
    ...(errors.length > 0 ? { errors: errors.map((e) => `${e.source}: ${e.error}`) } : {}),
  });
}
