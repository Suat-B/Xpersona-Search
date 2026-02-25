/**
 * ClawHub crawler - discovers OpenClaw skills from the ClawHub public API.
 * Falls back to openclaw/skills GitHub repo (archives ClawHub) if API is unavailable.
 */
import pLimit from "p-limit";
import { db } from "@/lib/db";
import { crawlJobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { octokit, fetchFileContent, withGithubRetry } from "../utils/github";
import { parseSkillMd } from "../parsers/skill-md";
import { generateSlug } from "../utils/slug";
import { upsertAgent } from "../agent-upsert";
import { ingestAgentMedia } from "./media-ingestion";

const SKILLS_REPO = "openclaw/skills";
const CONCURRENCY_RAW = Number(process.env.CLAWHUB_DETAIL_CONCURRENCY ?? "2");
const CONCURRENCY =
  Number.isFinite(CONCURRENCY_RAW) && CONCURRENCY_RAW > 0
    ? Math.min(10, Math.floor(CONCURRENCY_RAW))
    : 2;
const RATE_LIMIT_DELAY_MS = 800;
const CLAWHUB_API_BASE =
  process.env.CLAWHUB_API_BASE?.trim() || "https://wry-manatee-359.convex.site";
const CLAWHUB_SITE_BASE = process.env.CLAWHUB_SITE_BASE?.trim() || "https://clawhub.ai";
const CLAWHUB_PAGE_LIMIT_RAW = Number(process.env.CLAWHUB_PAGE_LIMIT ?? "200");
const CLAWHUB_PAGE_LIMIT =
  Number.isFinite(CLAWHUB_PAGE_LIMIT_RAW) && CLAWHUB_PAGE_LIMIT_RAW > 0
    ? Math.min(500, Math.floor(CLAWHUB_PAGE_LIMIT_RAW))
    : 200;
const CLAWHUB_SORT = (process.env.CLAWHUB_SORT ?? "downloads").toLowerCase();
const CLAWHUB_DIR = (process.env.CLAWHUB_DIR ?? "desc").toLowerCase();
const CLAWHUB_API_MAX_RETRIES_RAW = Number(process.env.CLAWHUB_API_MAX_RETRIES ?? "8");
const CLAWHUB_API_MAX_RETRIES =
  Number.isFinite(CLAWHUB_API_MAX_RETRIES_RAW) && CLAWHUB_API_MAX_RETRIES_RAW >= 0
    ? Math.min(20, Math.floor(CLAWHUB_API_MAX_RETRIES_RAW))
    : 8;
const CLAWHUB_API_BASE_BACKOFF_MS_RAW = Number(
  process.env.CLAWHUB_API_BASE_BACKOFF_MS ?? "1500"
);
const CLAWHUB_API_BASE_BACKOFF_MS =
  Number.isFinite(CLAWHUB_API_BASE_BACKOFF_MS_RAW) && CLAWHUB_API_BASE_BACKOFF_MS_RAW > 0
    ? Math.floor(CLAWHUB_API_BASE_BACKOFF_MS_RAW)
    : 1500;
const CLAWHUB_API_MAX_BACKOFF_MS_RAW = Number(
  process.env.CLAWHUB_API_MAX_BACKOFF_MS ?? "60000"
);
const CLAWHUB_API_MAX_BACKOFF_MS =
  Number.isFinite(CLAWHUB_API_MAX_BACKOFF_MS_RAW) && CLAWHUB_API_MAX_BACKOFF_MS_RAW > 0
    ? Math.floor(CLAWHUB_API_MAX_BACKOFF_MS_RAW)
    : 60000;
const CLAWHUB_API_PAGE_DELAY_MS_RAW = Number(process.env.CLAWHUB_API_PAGE_DELAY_MS ?? "1000");
const CLAWHUB_API_PAGE_DELAY_MS =
  Number.isFinite(CLAWHUB_API_PAGE_DELAY_MS_RAW) && CLAWHUB_API_PAGE_DELAY_MS_RAW >= 0
    ? Math.floor(CLAWHUB_API_PAGE_DELAY_MS_RAW)
    : 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseRetryAfterMs(headers: Headers): number | null {
  const raw = headers.get("retry-after");
  if (!raw) return null;
  const asSeconds = Number(raw);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return Math.floor(asSeconds * 1000);
  }
  const asDate = Date.parse(raw);
  if (Number.isFinite(asDate)) {
    return Math.max(0, asDate - Date.now());
  }
  return null;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 408 || status === 502 || status === 503 || status === 504;
}

function computeBackoffMs(attempt: number): number {
  const jitter = Math.floor(Math.random() * 250);
  const exp = CLAWHUB_API_BASE_BACKOFF_MS * 2 ** Math.max(0, attempt - 1);
  return Math.min(CLAWHUB_API_MAX_BACKOFF_MS, exp + jitter);
}

type ClawHubSkillListItem = {
  slug: string;
  displayName?: string | null;
  summary?: string | null;
  tags?: Record<string, string>;
  stats?: {
    downloads?: number;
    stars?: number;
    installsAllTime?: number;
    installsCurrent?: number;
    versions?: number;
  };
  createdAt?: number;
  updatedAt?: number;
  latestVersion?: { version?: string; createdAt?: number; changelog?: string };
};

type ClawHubSkillDetail = {
  skill?: ClawHubSkillListItem;
  latestVersion?: { version?: string; createdAt?: number; changelog?: string };
  owner?: { handle?: string | null; userId?: string | null; displayName?: string | null };
  moderation?: Record<string, unknown> | null;
};

async function fetchClawHubSkillListPage(params: {
  cursor?: string | null;
  limit: number;
  sort: string;
  dir: string;
}): Promise<{ items: ClawHubSkillListItem[]; nextCursor?: string | null }> {
  const url = new URL("/api/v1/skills", CLAWHUB_API_BASE);
  url.searchParams.set("sort", params.sort);
  url.searchParams.set("dir", params.dir);
  url.searchParams.set("limit", String(params.limit));
  if (params.cursor) url.searchParams.set("cursor", params.cursor);
  let lastErr = "unknown";
  for (let attempt = 0; attempt <= CLAWHUB_API_MAX_RETRIES; attempt++) {
    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "xpersona-crawler",
      },
    });
    if (res.ok) {
      return (await res.json()) as { items: ClawHubSkillListItem[]; nextCursor?: string | null };
    }
    const body = await res.text();
    lastErr = `ClawHub API error ${res.status}: ${body.slice(0, 240)}`;
    if (attempt >= CLAWHUB_API_MAX_RETRIES || !isRetryableStatus(res.status)) {
      throw new Error(lastErr);
    }
    const retryAfterMs = parseRetryAfterMs(res.headers);
    const waitMs = retryAfterMs ?? computeBackoffMs(attempt + 1);
    console.warn(
      `[CRAWL] CLAWHUB list retry attempt=${attempt + 1} status=${res.status} waitMs=${waitMs}`
    );
    await sleep(waitMs);
  }
  throw new Error(lastErr);
}

async function fetchClawHubSkillDetail(slug: string): Promise<ClawHubSkillDetail | null> {
  const url = new URL(`/api/v1/skills/${encodeURIComponent(slug)}`, CLAWHUB_API_BASE);
  let lastStatus = 0;
  for (let attempt = 0; attempt <= CLAWHUB_API_MAX_RETRIES; attempt++) {
    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "xpersona-crawler",
      },
    });
    if (res.ok) return (await res.json()) as ClawHubSkillDetail;
    lastStatus = res.status;
    if (res.status === 404) return null;
    if (attempt >= CLAWHUB_API_MAX_RETRIES || !isRetryableStatus(res.status)) return null;
    const retryAfterMs = parseRetryAfterMs(res.headers);
    const waitMs = retryAfterMs ?? computeBackoffMs(attempt + 1);
    await sleep(waitMs);
  }
  console.warn(`[CRAWL] CLAWHUB detail exhausted retries slug=${slug} lastStatus=${lastStatus}`);
  return null;
}

function computePopularityScore(downloads: number | undefined): number {
  const count = Math.max(0, downloads ?? 0);
  if (count === 0) return 40;
  const score = Math.min(100, Math.round(Math.log10(count + 1) * 20));
  return Math.max(40, score);
}

async function crawlClawHubApi(maxResults: number): Promise<number> {
  const limit = pLimit(CONCURRENCY);
  let totalFound = 0;
  let cursor: string | null | undefined = null;

  while (totalFound < maxResults) {
    const pageLimit = Math.max(1, Math.min(CLAWHUB_PAGE_LIMIT, maxResults - totalFound));
    const page = await fetchClawHubSkillListPage({
      cursor,
      limit: pageLimit,
      sort: CLAWHUB_SORT,
      dir: CLAWHUB_DIR,
    });
    if (!page.items || page.items.length === 0) break;

    const slice = page.items.slice(0, Math.max(0, maxResults - totalFound));
    const results = await Promise.all(
      slice.map((item) =>
        limit(async () => {
          const detail = await fetchClawHubSkillDetail(item.slug);
          const ownerHandle = detail?.owner?.handle ?? null;
          const ownerId = detail?.owner?.userId ?? null;
          const sourceId = `clawhub:${ownerId ?? ownerHandle ?? "unknown"}:${item.slug}`;
          const displayName = detail?.skill?.displayName ?? item.displayName ?? item.slug;
          const summary = detail?.skill?.summary ?? item.summary ?? null;
          const url = `${CLAWHUB_SITE_BASE}/${encodeURIComponent(
            ownerHandle ?? ownerId ?? "unknown"
          )}/${encodeURIComponent(item.slug)}`;
          const slug =
            generateSlug(
              `clawhub-${ownerHandle ?? ownerId ?? "unknown"}-${item.slug}`
            ) || `clawhub-${totalFound}`;

          const popularityScore = computePopularityScore(item.stats?.downloads);
          const agentData = {
            sourceId,
            source: "CLAWHUB" as const,
            name: displayName,
            slug,
            description: summary,
            url,
            homepage: null,
            capabilities: [],
            protocols: [],
            languages: [] as string[],
            openclawData: {
              clawhub: {
                owner: detail?.owner ?? null,
                stats: item.stats ?? null,
                tags: item.tags ?? null,
                latestVersion: detail?.latestVersion ?? item.latestVersion ?? null,
                createdAt: item.createdAt ?? null,
                updatedAt: item.updatedAt ?? null,
              },
            } as Record<string, unknown>,
            readme: summary ?? "",
            safetyScore: 80,
            popularityScore,
            freshnessScore: 70,
            performanceScore: 0,
            overallRank: 62,
            status: "ACTIVE" as const,
            lastCrawledAt: new Date(),
            nextCrawlAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          };

          await upsertAgent(agentData, {
            name: agentData.name,
            slug: agentData.slug,
            description: agentData.description,
            url: agentData.url,
            homepage: agentData.homepage,
            openclawData: agentData.openclawData,
            readme: agentData.readme,
            lastCrawledAt: agentData.lastCrawledAt,
            nextCrawlAt: agentData.nextCrawlAt,
          });

          await ingestAgentMedia({
            agentSourceId: sourceId,
            agentUrl: url,
            homepageUrl: null,
            source: "CLAWHUB",
            readmeOrHtml: summary ?? "",
            isHtml: false,
            allowHomepageFetch: false,
          });

          return true;
        })
      )
    );

    totalFound += results.filter(Boolean).length;
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
    await sleep(CLAWHUB_API_PAGE_DELAY_MS);
  }

  return totalFound;
}

async function crawlClawHubGitHub(maxResults: number): Promise<number> {
  const limit = pLimit(CONCURRENCY);
  let totalFound = 0;

  const { data: treeData } = await withGithubRetry(
    () =>
      octokit.rest.git.getTree({
        owner: "openclaw",
        repo: "skills",
        tree_sha: "main",
        recursive: "1",
      }),
    "git.getTree openclaw/skills"
  );

  const tree = treeData.tree as Array<{ path?: string; type?: string }>;
  const skillPaths = tree
    .filter((n) => n.path?.endsWith("/SKILL.md") && n.type === "blob")
    .map((n) => n.path!)
    .slice(0, maxResults);

  for (const path of skillPaths) {
    if (totalFound >= maxResults) break;

    const pathBase = path.replace(/\/SKILL\.md$/, "");
    const parts = pathBase.split("/");
    const slugFromPath = parts[parts.length - 1] ?? "skill";
    const sourceId = `clawhub:${pathBase.replace(/\//g, ":")}`;

    const skillContent = await limit(() =>
      fetchFileContent(SKILLS_REPO, path, "main")
    );
    if (!skillContent) continue;

    const skillData = parseSkillMd(skillContent);
    const name = skillData.name ?? slugFromPath;
    const slug =
      generateSlug(`clawhub-${pathBase.replace(/\//g, "-")}`) ||
      `clawhub-${totalFound}`;
    const url = `https://github.com/${SKILLS_REPO}/tree/main/${pathBase}`;

    const agentData = {
      sourceId,
      source: "CLAWHUB" as const,
      name,
      slug,
      description: skillData.description ?? null,
      url,
      homepage: skillData.homepage ?? null,
      capabilities: skillData.capabilities ?? [],
      protocols: skillData.protocols,
      languages: ["typescript"] as string[],
      openclawData: skillData as unknown as Record<string, unknown>,
      readme: skillContent,
      safetyScore: 80,
      popularityScore: 50,
      freshnessScore: 70,
      performanceScore: 0,
      overallRank: 62,
      status: "ACTIVE" as const,
      lastCrawledAt: new Date(),
      nextCrawlAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };

    await upsertAgent(agentData, {
      name: agentData.name,
      slug: agentData.slug,
      description: agentData.description,
      url: agentData.url,
      homepage: agentData.homepage,
      openclawData: agentData.openclawData,
      readme: agentData.readme,
      lastCrawledAt: agentData.lastCrawledAt,
      nextCrawlAt: agentData.nextCrawlAt,
    });
    await ingestAgentMedia({
      agentSourceId: sourceId,
      agentUrl: url,
      homepageUrl: skillData.homepage ?? null,
      source: "CLAWHUB",
      readmeOrHtml: skillContent,
      isHtml: false,
      allowHomepageFetch: true,
    });

    totalFound++;
    if (totalFound % 100 === 0) await sleep(RATE_LIMIT_DELAY_MS);
  }

  return totalFound;
}

export async function crawlClawHub(
  maxResults: number = 5000
): Promise<{ total: number; jobId: string }> {
  const [job] = await db
    .insert(crawlJobs)
    .values({
      source: "CLAWHUB",
      status: "RUNNING",
      startedAt: new Date(),
    })
    .returning();

  const jobId = job?.id ?? crypto.randomUUID();
  let totalFound = 0;

  try {
    try {
      totalFound = await crawlClawHubApi(maxResults);
    } catch (err) {
      console.warn(
        "[CRAWL] CLAWHUB API failed, falling back to GitHub repo:",
        err instanceof Error ? err.message : String(err)
      );
      totalFound = await crawlClawHubGitHub(maxResults);
    }

    await db
      .update(crawlJobs)
      .set({
        status: "COMPLETED",
        completedAt: new Date(),
        agentsFound: totalFound,
      })
      .where(eq(crawlJobs.id, jobId));
  } catch (err) {
    await db
      .update(crawlJobs)
      .set({
        status: "FAILED",
        completedAt: new Date(),
        error: err instanceof Error ? err.message : String(err),
      })
      .where(eq(crawlJobs.id, jobId));
    throw err;
  }

  return { total: totalFound, jobId };
}
