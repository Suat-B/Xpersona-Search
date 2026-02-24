#!/usr/bin/env npx tsx
/**
 * Standalone crawler for Xpersona Search.
 * Full backfill (no date filter) — all sources.
 *
 * Run: npx tsx scripts/run-crawl.ts [maxResults]
 *      npx tsx scripts/run-crawl.ts 100k  (100k-scale: aggressive limits)
 *      npx tsx scripts/run-crawl.ts 250k  (250k-scale: maximum expansion)
 *      npx tsx scripts/run-crawl.ts 100k --sources=GITHUB_MCP,CLAWHUB  (run only these)
 *      On PowerShell, quote the list: --sources="HUGGINGFACE,DOCKER,REPLICATE"
 *      npx tsx scripts/run-crawl.ts 100k --parallel  (run all buckets in parallel)
 *      npx tsx scripts/run-crawl.ts 500 --mode=hot --github-budget=800 --time-budget-ms=120000
 * Optional env:
 *      GITHUB_REQUEST_TIMEOUT_MS=15000 (default) to fail slow GitHub calls faster
 *
 * Requires: DATABASE_URL, and GitHub auth for GitHub sources
 * (GITHUB_TOKEN or GitHub App env vars)
 */
import { config } from "dotenv";

config({ path: ".env.local" });

import { runCrawlPool, type CrawlTask, type CrawlResult } from "@/lib/search/crawlers/pool";
import type { CrawlMode, CrawlRuntimeOptions } from "@/lib/search/crawlers/crawler-mode";
import { db } from "@/lib/db";
import { crawlJobs } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";

const args = process.argv.slice(2);
const maxArg = args.find((a) => !a.startsWith("--"));
const parallelMode = args.includes("--parallel");
const modeArg = args.find((a) => a.startsWith("--mode="))?.split("=")[1]?.toLowerCase();
const budgetArg = args.find((a) => a.startsWith("--github-budget="))?.split("=")[1];
const timeBudgetArg = args.find((a) => a.startsWith("--time-budget-ms="))?.split("=")[1];
const requestedMode: CrawlMode = modeArg === "hot" || modeArg === "warm" ? (modeArg as CrawlMode) : "backfill";
const mode: CrawlMode = process.env.CRAWL_HYBRID_MODE === "0" ? "backfill" : requestedMode;
const githubBudget = budgetArg ? parseInt(budgetArg, 10) : undefined;
const timeBudgetMs = timeBudgetArg ? parseInt(timeBudgetArg, 10) : undefined;
const lockOwner = `run-crawl:${process.pid}`;
const workerId = process.env.CRAWL_WORKER_ID ?? `worker:${process.pid}`;

// Support both --sources=X,Y,Z and --sources X,Y,Z (PowerShell may split on =)
const sourcesIdx = args.findIndex((a) => a === "--sources" || a.startsWith("--sources="));
let sourcesStr: string | null = null;
if (sourcesIdx >= 0) {
  const arg = args[sourcesIdx];
  if (arg.startsWith("--sources=")) {
    sourcesStr = arg.replace("--sources=", "");
  } else if (args[sourcesIdx + 1]) {
    sourcesStr = args[sourcesIdx + 1];
  }
}

const arg = maxArg ?? "1500";
const scale250k = arg === "250k" || arg === "250000" || parseInt(arg, 10) >= 200000;
const fullScale = scale250k || arg === "100k" || arg === "100000" || parseInt(arg, 10) >= 50000;
const maxResults = scale250k ? 250000 : fullScale ? 100000 : parseInt(arg, 10) || 1500;

const selectedSources = sourcesStr
  ? new Set(
      sourcesStr
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    )
  : null;

if (fullScale) {
  process.env.CRAWL_BROAD_MODE = "1";
}

const limits = scale250k
  ? {
      openClaw: 5000,
      mcp: 2000,
      clawhub: 15000,
      githubRepos: 30000,
      mcpRegistry: 2000,
      a2a: 1000,
      pypi: 15000,
      npm: 15000,
      curated: 5000,
      huggingface: 50000,
      docker: 5000,
      agentscape: 1000,
      replicate: 5000,
      awesomeLists: 10000,
      smithery: 5000,
      langchainHub: 5000,
      crewai: 3000,
      vercelTemplates: 2000,
      ollama: 3000,
    }
  : fullScale
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
        awesomeLists: 5000,
        smithery: 2000,
        langchainHub: 2000,
        crewai: 1000,
        vercelTemplates: 1000,
        ollama: 1000,
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
        awesomeLists: 2000,
        smithery: 500,
        langchainHub: 500,
        crewai: 300,
        vercelTemplates: 200,
        ollama: 500,
      };

function log(source: string, msg: string, ...rest: unknown[]) {
  const ts = new Date().toISOString();
  let out = msg;
  for (const v of rest) out = out.replace(/%[sd]/, String(v));
  console.log(`[${ts}] [${source}]`, out);
}

function metric(event: string, payload: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      event,
      ...payload,
    })
  );
}

function shouldRun(source: string): boolean {
  if (!selectedSources) return true;
  return selectedSources.has(source.toUpperCase());
}

function withStartLog(source: string, fn: () => Promise<{ total: number; jobId?: string }>) {
  return async () => {
    log(source, "Starting...");
    return fn();
  };
}

function hasGitHubAuth(): boolean {
  if (process.env.GITHUB_TOKEN) return true;
  return Boolean(
    process.env.GITHUB_APP_ID &&
      process.env.GITHUB_APP_PRIVATE_KEY &&
      process.env.GITHUB_APP_INSTALLATION_ID
  );
}

function getDatabaseTargetInfo(): { host: string; user: string } | null {
  const raw = process.env.DATABASE_URL ?? "";
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return {
      host: parsed.hostname || "unknown",
      user: decodeURIComponent(parsed.username || ""),
    };
  } catch {
    return null;
  }
}

async function logGitHubReliability(results: CrawlResult[], mode: CrawlMode) {
  const githubSources = new Set([
    "GITHUB_OPENCLEW",
    "GITHUB_MCP",
    "GITHUB_REPOS",
    "CLAWHUB",
    "CURATED_SEEDS",
    "AWESOME_LISTS",
    "CREWAI",
    "VERCEL_TEMPLATES",
  ]);
  const jobIds = results
    .filter((r) => githubSources.has(r.source) && !!r.jobId)
    .map((r) => r.jobId as string);
  if (jobIds.length === 0) return;

  try {
    const rows = await db
      .select({
        id: crawlJobs.id,
        githubRequests: crawlJobs.githubRequests,
        retries: crawlJobs.retryCount,
        rateLimits: crawlJobs.rateLimits,
        timeouts: crawlJobs.timeouts,
        waitMs: crawlJobs.rateLimitWaitMs,
        skipped: crawlJobs.skipped,
      })
      .from(crawlJobs)
      .where(inArray(crawlJobs.id, jobIds));

    const totals = rows.reduce(
      (acc, r) => {
        acc.githubRequests += r.githubRequests ?? 0;
        acc.retries += r.retries ?? 0;
        acc.rateLimits += r.rateLimits ?? 0;
        acc.timeouts += r.timeouts ?? 0;
        acc.waitMs += r.waitMs ?? 0;
        acc.skipped += r.skipped ?? 0;
        return acc;
      },
      {
        githubRequests: 0,
        retries: 0,
        rateLimits: 0,
        timeouts: 0,
        waitMs: 0,
        skipped: 0,
      }
    );

    log(
      "CRAWL",
      "GitHub requests=%d retries=%d rateLimits=%d timeouts=%d waitMs=%d skipped=%d",
      totals.githubRequests,
      totals.retries,
      totals.rateLimits,
      totals.timeouts,
      totals.waitMs,
      totals.skipped
    );
    metric("crawl.github.reliability", {
      mode,
      ...totals,
      sources: rows.length,
    });
  } catch (err) {
    log(
      "CRAWL",
      "GitHub KPI query skipped: %s",
      err instanceof Error ? err.message : String(err)
    );
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const dbTarget = getDatabaseTargetInfo();
  if (!dbTarget) {
    console.error("DATABASE_URL is invalid");
    process.exit(1);
  }
  log("CRAWL", "DB target host=%s user=%s", dbTarget.host, dbTarget.user || "(empty)");
  if (
    dbTarget.user.toLowerCase().includes("placeholder") ||
    dbTarget.host.toLowerCase().includes("placeholder")
  ) {
    console.error("DATABASE_URL appears to use placeholder credentials; aborting crawl.");
    process.exit(1);
  }

  const scaleLabel = scale250k ? "250k" : fullScale ? "100k" : `${maxResults}`;
  log("CRAWL", `Starting ${scaleLabel}-scale crawl (parallel=${parallelMode})\n`);
  if (selectedSources && selectedSources.size > 0) {
    log("CRAWL", "Sources filter: %s", [...selectedSources].join(", "));
  }
  log(
    "CRAWL",
    "GitHub request timeout: %sms",
    process.env.GITHUB_REQUEST_TIMEOUT_MS ?? "15000"
  );
  log("CRAWL", "Mode=%s githubBudget=%s timeBudgetMs=%s", mode, githubBudget ?? "none", timeBudgetMs ?? "none");
  const runtimeOptions: CrawlRuntimeOptions = {
    mode,
    githubBudget,
    timeBudgetMs,
    lockOwner,
    workerId,
    deepSafetyLimit: Number(process.env.CRAWL_DEEP_SAFETY_LIMIT_PER_JOB ?? "100"),
  };

  const tasks: CrawlTask[] = [];

  if (hasGitHubAuth()) {
    if (shouldRun("GITHUB_OPENCLEW")) {
      tasks.push({
        source: "GITHUB_OPENCLEW",
        bucket: "github",
        fn: withStartLog("GITHUB_OPENCLEW", async () => {
          const { crawlOpenClawSkills } = await import("@/lib/search/crawlers/github-openclaw");
          return crawlOpenClawSkills(undefined, limits.openClaw, runtimeOptions);
        }),
      });
    }
    if (shouldRun("GITHUB_MCP")) {
      tasks.push({
        source: "GITHUB_MCP",
        bucket: "github",
        fn: withStartLog("GITHUB_MCP", async () => {
          const { crawlGitHubMCP } = await import("@/lib/search/crawlers/github-mcp");
          return crawlGitHubMCP(undefined, limits.mcp, runtimeOptions);
        }),
      });
    }
    if (shouldRun("CLAWHUB")) {
      tasks.push({
        source: "CLAWHUB",
        bucket: "github",
        fn: withStartLog("CLAWHUB", async () => {
          const { crawlClawHub } = await import("@/lib/search/crawlers/clawhub");
          return crawlClawHub(limits.clawhub);
        }),
      });
    }
    if (shouldRun("GITHUB_REPOS")) {
      tasks.push({
        source: "GITHUB_REPOS",
        bucket: "github",
        fn: withStartLog("GITHUB_REPOS", async () => {
          const { crawlGitHubRepos } = await import("@/lib/search/crawlers/github-repos");
          return crawlGitHubRepos(limits.githubRepos, runtimeOptions);
        }),
      });
    }
  } else if (
    shouldRun("GITHUB_OPENCLEW") ||
    shouldRun("GITHUB_MCP") ||
    shouldRun("CLAWHUB") ||
    shouldRun("GITHUB_REPOS")
  ) {
    log("CRAWL", "GitHub auth not configured — skipping GitHub crawlers");
  }

  if (shouldRun("MCP_REGISTRY")) {
    tasks.push({
      source: "MCP_REGISTRY",
      bucket: "registry",
      fn: withStartLog("MCP_REGISTRY", async () => {
        const { crawlMcpRegistry } = await import("@/lib/search/crawlers/mcp-registry");
        return crawlMcpRegistry(limits.mcpRegistry);
      }),
    });
  }
  if (shouldRun("A2A_REGISTRY")) {
    tasks.push({
      source: "A2A_REGISTRY",
      bucket: "registry",
      fn: withStartLog("A2A_REGISTRY", async () => {
        const { crawlA2ARegistry } = await import("@/lib/search/crawlers/a2a-registry");
        return crawlA2ARegistry(limits.a2a);
      }),
    });
  }
  if (shouldRun("AGENTSCAPE")) {
    tasks.push({
      source: "AGENTSCAPE",
      bucket: "registry",
      fn: withStartLog("AGENTSCAPE", async () => {
        const { crawlAgentScape } = await import("@/lib/search/crawlers/agentscape");
        return crawlAgentScape(limits.agentscape);
      }),
    });
  }
  if (shouldRun("PYPI")) {
    tasks.push({
      source: "PYPI",
      bucket: "package",
      fn: withStartLog("PYPI", async () => {
        const { crawlPypiPackages } = await import("@/lib/search/crawlers/pypi");
        return crawlPypiPackages(limits.pypi);
      }),
    });
  }
  if (shouldRun("NPM")) {
    tasks.push({
      source: "NPM",
      bucket: "package",
      fn: withStartLog("NPM", async () => {
        const { crawlNpmPackages } = await import("@/lib/search/crawlers/npm");
        return crawlNpmPackages(limits.npm);
      }),
    });
  }
  if (shouldRun("CURATED_SEEDS")) {
    tasks.push({
      source: "CURATED_SEEDS",
      bucket: "github",
      fn: withStartLog("CURATED_SEEDS", async () => {
        const { crawlCuratedSeeds } = await import("@/lib/search/crawlers/curated-seeds");
        return crawlCuratedSeeds(limits.curated);
      }),
    });
  }
  if (shouldRun("HUGGINGFACE")) {
    tasks.push({
      source: "HUGGINGFACE",
      bucket: "platform",
      fn: withStartLog("HUGGINGFACE", async () => {
        const { crawlHuggingFaceSpaces } = await import("@/lib/search/crawlers/huggingface-spaces");
        return crawlHuggingFaceSpaces(limits.huggingface);
      }),
    });
  }
  if (shouldRun("DOCKER")) {
    tasks.push({
      source: "DOCKER",
      bucket: "platform",
      fn: withStartLog("DOCKER", async () => {
        const { crawlDockerHub } = await import("@/lib/search/crawlers/docker-hub");
        return crawlDockerHub(limits.docker);
      }),
    });
  }
  if (shouldRun("REPLICATE")) {
    tasks.push({
      source: "REPLICATE",
      bucket: "platform",
      fn: withStartLog("REPLICATE", async () => {
        const { crawlReplicate } = await import("@/lib/search/crawlers/replicate");
        return crawlReplicate(limits.replicate);
      }),
    });
  }
  if (shouldRun("AWESOME_LISTS")) {
    tasks.push({
      source: "AWESOME_LISTS",
      bucket: "github",
      fn: withStartLog("AWESOME_LISTS", async () => {
        const { crawlAwesomeLists } = await import("@/lib/search/crawlers/awesome-lists");
        return crawlAwesomeLists(limits.awesomeLists);
      }),
    });
  }
  if (shouldRun("SMITHERY")) {
    tasks.push({
      source: "SMITHERY",
      bucket: "registry",
      fn: withStartLog("SMITHERY", async () => {
        const { crawlSmithery } = await import("@/lib/search/crawlers/smithery");
        return crawlSmithery(limits.smithery);
      }),
    });
  }
  if (shouldRun("LANGCHAIN_HUB")) {
    tasks.push({
      source: "LANGCHAIN_HUB",
      bucket: "platform",
      fn: withStartLog("LANGCHAIN_HUB", async () => {
        const { crawlLangChainHub } = await import("@/lib/search/crawlers/langchain-hub");
        return crawlLangChainHub(limits.langchainHub);
      }),
    });
  }
  if (shouldRun("CREWAI")) {
    tasks.push({
      source: "CREWAI",
      bucket: "github",
      fn: withStartLog("CREWAI", async () => {
        const { crawlCrewAI } = await import("@/lib/search/crawlers/crewai");
        return crawlCrewAI(limits.crewai, runtimeOptions);
      }),
    });
  }
  if (shouldRun("VERCEL_TEMPLATES")) {
    tasks.push({
      source: "VERCEL_TEMPLATES",
      bucket: "platform",
      fn: withStartLog("VERCEL_TEMPLATES", async () => {
        const { crawlVercelTemplates } = await import("@/lib/search/crawlers/vercel-templates");
        return crawlVercelTemplates(limits.vercelTemplates, runtimeOptions);
      }),
    });
  }
  if (shouldRun("OLLAMA")) {
    tasks.push({
      source: "OLLAMA",
      bucket: "platform",
      fn: withStartLog("OLLAMA", async () => {
        const { crawlOllama } = await import("@/lib/search/crawlers/ollama");
        return crawlOllama(limits.ollama);
      }),
    });
  }

  if (tasks.length === 0) {
    log("CRAWL", "No crawlers selected — nothing to do");
    process.exit(0);
  }

  log("CRAWL", "Running %d crawlers across %d buckets...", tasks.length,
    new Set(tasks.map((t) => t.bucket)).size);

  const results = await runCrawlPool(tasks, (r) => {
    if (r.error) log(r.source, "FAILED (%dms): %s", r.durationMs, r.error);
    else log(r.source, "OK — %d agents (%dms)", r.total, r.durationMs);
    metric("crawl.source.result", {
      mode,
      source: r.source,
      total: r.total,
      durationMs: r.durationMs,
      error: r.error ?? null,
    });
  });

  const total = results.reduce((s, r) => s + r.total, 0);
  const succeeded = results.filter((r) => !r.error);
  const failed = results.filter((r) => r.error);

  log("CRAWL", "\n--- Summary ---");
  log("CRAWL", "Total agents: %d", total);
  metric("crawl.summary", {
    mode,
    total,
    succeeded: succeeded.length,
    failed: failed.length,
    sources: results.length,
  });
  log("CRAWL", "Succeeded: %d / %d sources", succeeded.length, results.length);
  if (succeeded.length > 0) {
    succeeded.forEach((r) => log("CRAWL", "  OK %s: %d (%dms)", r.source, r.total, r.durationMs));
  }
  if (failed.length > 0) {
    failed.forEach((r) => log("CRAWL", "  FAIL %s: %s (%dms)", r.source, r.error, r.durationMs));
  }

  await logGitHubReliability(results, mode);

  if (succeeded.length === 0 && failed.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
