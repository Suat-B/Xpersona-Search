import { NextRequest, NextResponse } from "next/server";
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

export const maxDuration = 300; // 5 min for Vercel Pro

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

  const results: Array<{ source: string; total: number; jobId: string }> = [];
  let lastError: Error | null = null;

  if (process.env.GITHUB_TOKEN && runSource("GITHUB_OPENCLEW")) {
    try {
      const r = await crawlOpenClawSkills(since, maxResults);
      results.push({ source: "GITHUB_OPENCLEW", ...r });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error("[Crawl] OpenClaw failed:", err);
    }

    try {
      if (runSource("GITHUB_MCP")) {
        const r = await crawlGitHubMCP(since, Math.min(maxResults, 300));
        results.push({ source: "GITHUB_MCP", ...r });
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error("[Crawl] MCP failed:", err);
    }

    try {
      if (runSource("CLAWHUB")) {
        const r = await crawlClawHub(Math.min(maxResults * 10, 5000));
        results.push({ source: "CLAWHUB", ...r });
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error("[Crawl] ClawHub failed:", err);
    }

    try {
      if (runSource("GITHUB_REPOS")) {
        const rGhRepos = await crawlGitHubRepos(Math.min(maxResults * 4, 2000));
        results.push({ source: "GITHUB_REPOS", ...rGhRepos });
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error("[Crawl] GitHub Repos failed:", err);
    }
  }

  if (runSource("MCP_REGISTRY")) {
  try {
    const rMcpReg = await crawlMcpRegistry(500);
    results.push({ source: "MCP_REGISTRY", ...rMcpReg });
  } catch (err) {
    console.warn("[Crawl] MCP Registry skipped:", err);
  }
  }

  if (runSource("PYPI")) {
  try {
    const rPypi = await crawlPypiPackages(Math.min(maxResults * 2, 500));
    results.push({ source: "PYPI", ...rPypi });
  } catch (err) {
    console.warn("[Crawl] PyPI skipped:", err);
  } }

  if (runSource("CURATED_SEEDS")) {
  try {
    const rCurated = await crawlCuratedSeeds(2000);
    results.push({ source: "CURATED_SEEDS", ...rCurated });
  } catch (err) {
    console.warn("[Crawl] Curated seeds skipped:", err);
  } }

  if (runSource("HUGGINGFACE")) {
  try {
    const rHf = await crawlHuggingFaceSpaces(
      batchSize
    );
    results.push({ source: "HUGGINGFACE", ...rHf });
  } catch (err) {
    console.warn("[Crawl] HuggingFace Spaces skipped:", err);
  } }

  if (runSource("DOCKER")) {
  try {
    const rDocker = await crawlDockerHub(300);
    results.push({ source: "DOCKER", ...rDocker });
  } catch (err) {
    console.warn("[Crawl] Docker Hub skipped:", err);
  } }

  if (runSource("AGENTSCAPE")) {
  try {
    const rAgentscape = await crawlAgentScape(200);
    results.push({ source: "AGENTSCAPE", ...rAgentscape });
  } catch (err) {
    console.warn("[Crawl] AgentScape skipped:", err);
  } }

  if (runSource("REPLICATE")) {
  try {
    const rReplicate = await crawlReplicate(500);
    if (rReplicate.total > 0) results.push({ source: "REPLICATE", ...rReplicate });
  } catch (err) {
    console.warn("[Crawl] Replicate skipped:", err);
  } }

  if (runSource("A2A_REGISTRY")) {
  try {
    const r = await crawlA2ARegistry(200);
    if (r.total > 0 || r.jobId) results.push({ source: "A2A_REGISTRY", ...r });
  } catch (err) {
    console.warn("[Crawl] A2A registry skipped:", err);
  } }

  if (runSource("NPM")) {
  try {
    const r = await crawlNpmPackages(200);
    results.push({ source: "NPM", ...r });
  } catch (err) {
    lastError = err instanceof Error ? err : new Error(String(err));
    console.error("[Crawl] NPM failed:", err);
  } }

  const total = results.reduce((sum, r) => sum + r.total, 0);
  return NextResponse.json({
    success: lastError === null || total > 0,
    total,
    bySource: results,
    error: lastError?.message,
  });
}
