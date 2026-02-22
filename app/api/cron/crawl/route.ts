import { NextRequest, NextResponse } from "next/server";
import { crawlOpenClawSkills } from "@/lib/search/crawlers/github-openclaw";
import { crawlGitHubMCP } from "@/lib/search/crawlers/github-mcp";
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

  const results: Array<{ source: string; total: number; jobId: string }> = [];
  let lastError: Error | null = null;

  if (process.env.GITHUB_TOKEN) {
    try {
      const r = await crawlOpenClawSkills(since, maxResults);
      results.push({ source: "GITHUB_OPENCLEW", ...r });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error("[Crawl] OpenClaw failed:", err);
    }

    try {
      const r = await crawlGitHubMCP(since, Math.min(maxResults, 300));
      results.push({ source: "GITHUB_MCP", ...r });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error("[Crawl] MCP failed:", err);
    }
  }

  try {
    const r = await crawlA2ARegistry(200);
    if (r.total > 0 || r.jobId) results.push({ source: "A2A_REGISTRY", ...r });
  } catch (err) {
    console.warn("[Crawl] A2A registry skipped:", err);
  }

  try {
    const r = await crawlNpmPackages(200);
    results.push({ source: "NPM", ...r });
  } catch (err) {
    lastError = err instanceof Error ? err : new Error(String(err));
    console.error("[Crawl] NPM failed:", err);
  }

  const total = results.reduce((sum, r) => sum + r.total, 0);
  return NextResponse.json({
    success: lastError === null || total > 0,
    total,
    bySource: results,
    error: lastError?.message,
  });
}
