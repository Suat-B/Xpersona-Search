# Xpersona Search Engine — A-to-Z Implementation Plan

> Exhaustive implementation plan derived from [XPERSONA SEARCH.MD](../XPERSONA%20SEARCH.MD). Every nut and bolt for replacing ANS with the Agent Search Engine on xpersona.co.

---

## Document Structure

Each section contains:
- **PRD** (Product Requirements)
- **TECH SPECS**
- **Exact code/file paths**
- **Full code snippets** (copy-paste ready)
- **Test cases**
- **Deliverables**
- **Dependencies**

---

# PHASE 0: PROJECT SETUP

## 0.1 Architecture Decision

**Integrate into existing Next.js app** — do not create a separate monorepo. The Xpersona codebase uses:
- Next.js 15, Drizzle ORM, PostgreSQL
- Single deployment on Vercel
- Hub (xpersona.co) already routes via `lib/service.ts` and `lib/subdomain.ts`

**Directory structure to add:**
```
lib/
  search/
    crawlers/
      github-openclaw.ts
    parsers/
      skill-md.ts
    scoring/
      safety.ts
      rank.ts
    utils/
      slug.ts
      github.ts
  db/
    search-schema.ts      (or extend schema.ts)
app/
  api/
    search/
      route.ts
    agents/
      [slug]/
        route.ts
    cron/
      crawl/
        route.ts
  agent/
    [slug]/
      page.tsx
components/
  home/
    SearchLanding.tsx    (replaces ANSLanding on hub)
  search/
    AgentCard.tsx
    SearchFilters.tsx
    SafetyBadge.tsx
    ProtocolBadge.tsx
    SearchResults.tsx
```

---

## 0.2 Dependencies

**Add to `package.json`:**

```json
{
  "dependencies": {
    "@octokit/rest": "^20.0.2",
    "@octokit/plugin-throttling": "^6.0.1",
    "@octokit/plugin-retry": "^6.0.2",
    "gray-matter": "^4.0.3",
    "p-limit": "^6.1.0"
  }
}
```

**Install:**
```bash
npm install @octokit/rest @octokit/plugin-throttling @octokit/plugin-retry gray-matter p-limit
```

---

## 0.3 Database Schema (Drizzle)

**File:** `lib/db/search-schema.ts`

```typescript
import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  doublePrecision,
  jsonb,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";

// Enums as varchar with check or use pgEnum
export const agentSourceEnum = pgEnum("agent_source", [
  "GITHUB_OPENCLEW",
  "GITHUB_A2A",
  "GITHUB_MCP",
  "CLAWHUB",
  "NPM",
  "PYPI",
  "MANUAL_SUBMISSION",
]);

export const protocolEnum = pgEnum("protocol", [
  "A2A",
  "MCP",
  "ANP",
  "OPENCLEW",
  "CUSTOM",
]);

export const agentStatusEnum = pgEnum("agent_status", [
  "DISCOVERED",
  "PENDING_REVIEW",
  "ACTIVE",
  "SUSPENDED",
  "DEPRECATED",
  "REMOVED",
]);

export const jobStatusEnum = pgEnum("job_status", [
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "FAILED",
]);

export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: varchar("source_id", { length: 255 }).notNull().unique(),
    source: varchar("source", { length: 32 }).notNull().default("GITHUB_OPENCLEW"),

    // Identity
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    description: text("description"),
    url: varchar("url", { length: 1024 }).notNull(),
    homepage: varchar("homepage", { length: 1024 }),

    // Agent Card (A2A compatible)
    agentCard: jsonb("agent_card").$type<Record<string, unknown>>(),
    agentCardUrl: varchar("agent_card_url", { length: 1024 }),

    // Capabilities
    capabilities: jsonb("capabilities").$type<string[]>().default([]),
    protocols: jsonb("protocols").$type<string[]>().default([]),
    languages: jsonb("languages").$type<string[]>().default([]),

    // Source-specific data
    githubData: jsonb("github_data").$type<{
      stars?: number;
      forks?: number;
      lastCommit?: string;
      defaultBranch?: string;
    }>(),
    npmData: jsonb("npm_data").$type<Record<string, unknown>>(),
    openclawData: jsonb("openclaw_data").$type<Record<string, unknown>>(),

    // Content for search
    readme: text("readme"),
    codeSnippets: jsonb("code_snippets").$type<string[]>().default([]),

    // Rankings
    safetyScore: integer("safety_score").notNull().default(0),
    popularityScore: integer("popularity_score").notNull().default(0),
    freshnessScore: integer("freshness_score").notNull().default(0),
    performanceScore: integer("performance_score").notNull().default(0),
    overallRank: doublePrecision("overall_rank").notNull().default(0),

    verified: boolean("verified").default(false),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),

    status: varchar("status", { length: 24 }).notNull().default("DISCOVERED"),
    lastCrawledAt: timestamp("last_crawled_at", { withTimezone: true }).notNull(),
    lastIndexedAt: timestamp("last_indexed_at", { withTimezone: true }),
    nextCrawlAt: timestamp("next_crawl_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("agents_source_id_idx").on(table.sourceId),
    uniqueIndex("agents_slug_idx").on(table.slug),
    index("agents_status_idx").on(table.status),
    index("agents_overall_rank_idx").on(table.overallRank),
  ]
);

export const crawlJobs = pgTable(
  "crawl_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: varchar("source", { length: 32 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("PENDING"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    error: text("error"),
    agentsFound: integer("agents_found").notNull().default(0),
    agentsUpdated: integer("agents_updated").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("crawl_jobs_status_idx").on(table.status),
    index("crawl_jobs_created_at_idx").on(table.createdAt),
  ]
);
```

**Import and re-export** from `lib/db/schema.ts` or `lib/db/index.ts`:
```typescript
export * from "./search-schema";
```

---

## 0.4 Migration for Full-Text Search

PostgreSQL `tsvector` and GIN index require raw SQL. Drizzle does not natively support `tsvector`. Two approaches:

**Option A: Add search_vector via raw migration**

Create `drizzle/XXXX_add_search_vectors.sql`:

```sql
-- Add search_vector column
ALTER TABLE agents ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Create GIN index
CREATE INDEX IF NOT EXISTS agents_search_vector_idx ON agents USING GIN (search_vector);

-- Trigger to auto-update search_vector
CREATE OR REPLACE FUNCTION agents_search_vector_trigger() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.readme, '')), 'C');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agents_search_vector_trigger ON agents;
CREATE TRIGGER agents_search_vector_trigger
  BEFORE INSERT OR UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION agents_search_vector_trigger();

-- Backfill existing rows
UPDATE agents SET search_vector = 
  setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(readme, '')), 'C')
WHERE search_vector IS NULL;
```

**Option B: Update search_vector on upsert** — in the crawler, run raw SQL after each upsert:
```sql
UPDATE agents SET search_vector = to_tsvector('english', coalesce(name,'') || ' ' || coalesce(description,'') || ' ' || coalesce(readme,'')) WHERE id = $1
```

---

## 0.5 Run Migrations

```bash
# Generate Drizzle migration from schema changes
npm run db:generate

# Or create migration manually for raw SQL
# Then:
npm run db:push   # or db:migrate
```

---

# PHASE 1: THE CRAWLER

## 1.1 GitHub API Helpers

**File:** `lib/search/utils/github.ts`

```typescript
import { Octokit } from "@octokit/rest";
import { throttling } from "@octokit/plugin-throttling";
import { retry } from "@octokit/plugin-retry";

const MyOctokit = Octokit.plugin(throttling, retry);

export const octokit = new MyOctokit({
  auth: process.env.GITHUB_TOKEN,
  throttle: {
    onRateLimit: (retryAfter) => {
      console.warn(`GitHub rate limit hit, retrying after ${retryAfter}s`);
      return true;
    },
    onSecondaryRateLimit: (retryAfter) => {
      console.warn(`GitHub secondary rate limit, retrying after ${retryAfter}s`);
      return true;
    },
  },
});

export interface GitHubRepo {
  id: number;
  full_name: string;
  name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  updated_at: string;
  pushed_at: string;
  default_branch: string;
  fork: boolean;
}

export async function fetchRepoDetails(fullName: string): Promise<GitHubRepo | null> {
  try {
    const [owner, repo] = fullName.split("/");
    const { data } = await octokit.rest.repos.get({ owner, repo });
    return {
      id: data.id,
      full_name: data.full_name ?? data.name,
      name: data.name ?? "",
      description: data.description ?? null,
      html_url: data.html_url ?? "",
      stargazers_count: data.stargazers_count ?? 0,
      forks_count: data.forks_count ?? 0,
      updated_at: data.updated_at ?? "",
      pushed_at: data.pushed_at ?? data.updated_at ?? "",
      default_branch: data.default_branch ?? "main",
      fork: data.fork ?? false,
    };
  } catch (err) {
    console.error(`Failed to fetch repo ${fullName}:`, err);
    return null;
  }
}

export async function fetchFileContent(
  fullName: string,
  path: string,
  ref: string
): Promise<string | null> {
  try {
    const [owner, repo] = fullName.split("/");
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });
    if ("content" in data && typeof data.content === "string") {
      return Buffer.from(data.content, "base64").toString("utf-8");
    }
    return null;
  } catch {
    return null;
  }
}

export async function checkFileExists(
  repoFullName: string,
  path: string
): Promise<boolean> {
  try {
    const [owner, repo] = repoFullName.split("/");
    const { status } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
    });
    return status === 200;
  } catch {
    return false;
  }
}

export async function checkDirectoryExists(
  repoFullName: string,
  path: string
): Promise<boolean> {
  try {
    const [owner, repo] = repoFullName.split("/");
    await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
    });
    return true;
  } catch {
    return false;
  }
}

export async function checkGlobExists(
  repoFullName: string,
  branch: string,
  pattern: string
): Promise<boolean> {
  const [owner, repo] = repoFullName.split("/");
  try {
    const { data } = await octokit.rest.search.code({
      q: `repo:${owner}/${repo} path:${pattern}`,
    });
    return (data.total_count ?? 0) > 0;
  } catch {
    return false;
  }
}
```

---

## 1.2 Slug Utility

**File:** `lib/search/utils/slug.ts`

```typescript
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 63) || `agent-${Date.now()}`;
}

export function ensureUniqueSlug(
  baseSlug: string,
  existingSlugs: Set<string>
): string {
  let slug = baseSlug;
  let suffix = 1;
  while (existingSlugs.has(slug)) {
    slug = `${baseSlug}-${suffix}`;
    suffix++;
  }
  return slug;
}
```

---

## 1.3 SKILL.md Parser

**File:** `lib/search/parsers/skill-md.ts`

```typescript
import matter from "gray-matter";

export interface SkillData {
  name?: string;
  description?: string;
  version?: string;
  author?: string;
  homepage?: string;
  capabilities: string[];
  protocols: string[];
  parameters?: Record<
    string,
    { type: string; required?: boolean; default?: unknown; description?: string }
  >;
  dependencies?: string[];
  permissions?: string[];
  examples?: string[];
  raw: string;
}

export function parseSkillMd(content: string): SkillData {
  const { data, content: body } = matter(content);

  const capabilities = extractCapabilities(body);
  const protocols = extractProtocols(body);

  return {
    name: data?.name,
    description: data?.description ?? extractDescription(body),
    version: data?.version,
    author: data?.author,
    homepage: data?.homepage,
    capabilities,
    protocols,
    parameters: data?.parameters ?? {},
    dependencies: Array.isArray(data?.dependencies) ? data.dependencies : [],
    permissions: Array.isArray(data?.permissions) ? data.permissions : [],
    examples: extractExamples(body),
    raw: content,
  };
}

function extractCapabilities(body: string): string[] {
  const capabilities: string[] = [];
  const patterns = [
    /capability:\s*(\w+)/gi,
    /can\s+(\w+)/gi,
    /supports?\s+(\w+)/gi,
  ];
  for (const pattern of patterns) {
    const matches = body.matchAll(pattern);
    for (const m of matches) capabilities.push(m[1].toLowerCase());
  }
  return [...new Set(capabilities)];
}

function extractProtocols(body: string): string[] {
  const protocols: string[] = [];
  if (/\bA2A\b/i.test(body)) protocols.push("A2A");
  if (/\bMCP\b/i.test(body)) protocols.push("MCP");
  if (/\bANP\b/i.test(body)) protocols.push("ANP");
  if (/\bOpenClaw\b|openclaw/i.test(body)) protocols.push("OPENCLEW");
  if (protocols.length === 0) protocols.push("OPENCLEW");
  return protocols;
}

function extractDescription(body: string): string {
  const lines = body.split("\n").filter((l) => l.trim());
  return (lines[0]?.slice(0, 200) ?? "").replace(/^#+\s*/, "").trim();
}

function extractExamples(body: string): string[] {
  const examples: string[] = [];
  const re = /```[\w]*\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(body)) !== null) examples.push(m[1].trim());
  return examples.slice(0, 3);
}
```

---

## 1.4 Safety Scoring Engine

**File:** `lib/search/scoring/safety.ts`

```typescript
import {
  GitHubRepo,
  checkFileExists,
  checkDirectoryExists,
  checkGlobExists,
} from "../utils/github";

export interface SafetyReport {
  score: number;
  issues: SafetyIssue[];
  checks: Record<string, boolean>;
}

export interface SafetyIssue {
  severity: "critical" | "high" | "medium" | "low";
  type: string;
  message: string;
  file?: string;
  line?: number;
}

const SUSPICIOUS_PATTERNS: Array<{ pattern: RegExp; severity: "critical" | "high" }> = [
  { pattern: /eval\s*\(/, severity: "critical" },
  { pattern: /Function\s*\(.*\)\s*\(/, severity: "critical" },
  { pattern: /child_process\.exec\s*\(/, severity: "critical" },
  { pattern: /exec\s*\(/, severity: "high" },
  { pattern: /fetch\s*\(\s*["']https?:\/\/(?!localhost|127\.0\.0\.1)/, severity: "high" },
  { pattern: /document\.cookie\s*=/, severity: "high" },
  { pattern: /localStorage\.setItem\s*\(/, severity: "medium" },
  { pattern: /process\.env\.\w+/, severity: "low" },
];

export async function calculateSafetyScore(
  repo: GitHubRepo,
  skillContent: string
): Promise<number> {
  const checks: Record<string, boolean> = {};
  const issues: SafetyIssue[] = [];

  checks.hasLicense = await checkFileExists(repo.full_name, "LICENSE");
  if (!checks.hasLicense) {
    issues.push({
      severity: "medium",
      type: "missing_license",
      message: "Repository lacks LICENSE file",
    });
  }

  checks.hasReadme = await checkFileExists(repo.full_name, "README.md");

  if (repo.fork) {
    checks.isOriginal = false;
    issues.push({
      severity: "low",
      type: "is_fork",
      message: "Repository is a fork",
    });
  } else {
    checks.isOriginal = true;
  }

  const lastPush = new Date(repo.pushed_at);
  const daysSincePush =
    (Date.now() - lastPush.getTime()) / (1000 * 60 * 60 * 24);
  checks.isMaintained = daysSincePush < 90;
  if (!checks.isMaintained) {
    issues.push({
      severity: "high",
      type: "unmaintained",
      message: `Last update ${Math.round(daysSincePush)} days ago`,
    });
  }

  for (const { pattern, severity } of SUSPICIOUS_PATTERNS) {
    if (pattern.test(skillContent)) {
      issues.push({
        severity,
        type: "suspicious_code",
        message: `Potentially dangerous pattern: ${pattern.source}`,
      });
    }
  }

  const hasTestDir =
    (await checkDirectoryExists(repo.full_name, "test")) ||
    (await checkDirectoryExists(repo.full_name, "__tests__")) ||
    (await checkDirectoryExists(repo.full_name, "tests"));
  const hasTestFiles = await checkGlobExists(
    repo.full_name,
    repo.default_branch,
    "*.test.ts"
  );
  checks.hasTests = hasTestDir || hasTestFiles;

  let score = 100;
  for (const issue of issues) {
    switch (issue.severity) {
      case "critical":
        score -= 50;
        break;
      case "high":
        score -= 20;
        break;
      case "medium":
        score -= 10;
        break;
      case "low":
        score -= 5;
        break;
    }
  }
  if (checks.hasLicense) score = Math.min(100, score + 5);
  if (checks.hasTests) score = Math.min(100, score + 10);
  if (checks.isOriginal) score = Math.min(100, score + 5);
  if (repo.stargazers_count > 100) score = Math.min(100, score + 10);

  return Math.max(0, Math.min(100, Math.round(score)));
}
```

---

## 1.5 Rank Calculator

**File:** `lib/search/scoring/rank.ts`

```typescript
import type { GitHubRepo } from "../utils/github";

export function calculatePopularityScore(repo: GitHubRepo): number {
  const score = Math.min(100, Math.log10(repo.stargazers_count + 1) * 25);
  return Math.round(score);
}

export function calculateFreshnessScore(repo: GitHubRepo): number {
  const lastPush = new Date(repo.pushed_at);
  const daysSincePush =
    (Date.now() - lastPush.getTime()) / (1000 * 60 * 60 * 24);
  const score = 100 * Math.exp(-daysSincePush / 30);
  return Math.round(score);
}

export function calculateOverallRank(scores: {
  safety: number;
  popularity: number;
  freshness: number;
  performance: number;
}): number {
  const weights = {
    safety: 0.3,
    popularity: 0.2,
    freshness: 0.2,
    performance: 0.3,
  };
  const rank =
    scores.safety * weights.safety +
    scores.popularity * weights.popularity +
    scores.freshness * weights.freshness +
    scores.performance * weights.performance;
  return Math.round(rank * 10) / 10;
}
```

---

## 1.6 GitHub OpenClaw Crawler

**File:** `lib/search/crawlers/github-openclaw.ts`

```typescript
import pLimit from "p-limit";
import { db } from "@/lib/db";
import { agents, crawlJobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { fetchRepoDetails, fetchFileContent } from "../utils/github";
import { parseSkillMd } from "../parsers/skill-md";
import { calculateSafetyScore } from "../scoring/safety";
import {
  calculatePopularityScore,
  calculateFreshnessScore,
  calculateOverallRank,
} from "../scoring/rank";
import { generateSlug } from "../utils/slug";

const CONCURRENCY = 3;
const PAGE_SIZE = 30;
const RATE_LIMIT_DELAY_MS = 1200;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function crawlOpenClawSkills(
  since?: Date,
  maxResults: number = 500
): Promise<{ total: number; jobId: string }> {
  const [job] = await db
    .insert(crawlJobs)
    .values({
      source: "GITHUB_OPENCLEW",
      status: "RUNNING",
      startedAt: new Date(),
    })
    .returning();

  const jobId = job?.id ?? crypto.randomUUID();
  const limit = pLimit(CONCURRENCY);

  let totalFound = 0;
  let page = 1;

  try {
    const { octokit } = await import("../utils/github");

    while (totalFound < maxResults) {
      const { data } = await octokit.rest.search.code({
        q: "filename:SKILL.md openclaw",
        sort: "indexed",
        order: "desc",
        per_page: PAGE_SIZE,
        page,
      });

      const items = (data as { items?: Array<{ repository?: { full_name?: string } }> })
        .items ?? [];
      if (items.length === 0) break;

      const repos = await Promise.all(
        items.map((item) =>
          limit(() =>
            fetchRepoDetails(item.repository?.full_name ?? "")
          )
        )
      );

      for (const repo of repos) {
        if (!repo || totalFound >= maxResults) continue;
        if (since && new Date(repo.updated_at) <= since) continue;

        const skillContent = await fetchFileContent(
          repo.full_name,
          "SKILL.md",
          repo.default_branch
        );
        if (!skillContent) continue;

        const skillData = parseSkillMd(skillContent);
        const safetyScore = await calculateSafetyScore(repo, skillContent);
        const popularityScore = calculatePopularityScore(repo);
        const freshnessScore = calculateFreshnessScore(repo);

        const slug =
          generateSlug(skillData.name ?? repo.name) || `agent-${repo.id}`;

        await db
          .insert(agents)
          .values({
            sourceId: `github:${repo.id}`,
            source: "GITHUB_OPENCLEW",
            name: skillData.name ?? repo.name,
            slug,
            description: skillData.description ?? repo.description,
            url: repo.html_url,
            homepage: skillData.homepage,
            capabilities: skillData.capabilities ?? [],
            protocols: skillData.protocols,
            languages: ["typescript"],
            githubData: {
              stars: repo.stargazers_count,
              forks: repo.forks_count,
              lastCommit: repo.pushed_at,
              defaultBranch: repo.default_branch,
            },
            openclawData: skillData,
            readme: skillContent,
            safetyScore,
            popularityScore,
            freshnessScore,
            performanceScore: 0,
            overallRank: calculateOverallRank({
              safety: safetyScore,
              popularity: popularityScore,
              freshness: freshnessScore,
              performance: 0,
            }),
            status: safetyScore >= 50 ? "ACTIVE" : "PENDING_REVIEW",
            lastCrawledAt: new Date(),
            nextCrawlAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          })
          .onConflictDoUpdate({
            target: agents.sourceId,
            set: {
              name: skillData.name ?? repo.name,
              slug,
              description: skillData.description ?? repo.description,
              githubData: {
                stars: repo.stargazers_count,
                forks: repo.forks_count,
                lastCommit: repo.pushed_at,
                defaultBranch: repo.default_branch,
              },
              openclawData: skillData,
              readme: skillContent,
              safetyScore,
              popularityScore,
              freshnessScore,
              overallRank: calculateOverallRank({
                safety: safetyScore,
                popularity: popularityScore,
                freshness: freshnessScore,
                performance: 0,
              }),
              status: safetyScore >= 50 ? "ACTIVE" : "PENDING_REVIEW",
              lastCrawledAt: new Date(),
              nextCrawlAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
              updatedAt: new Date(),
            },
          });

        totalFound++;
      }

      await sleep(RATE_LIMIT_DELAY_MS);
      page++;
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
```

**Note:** The crawler uses `db` and `agents` from the existing Drizzle setup. Replace `onConflictDoUpdate` with your Drizzle dialect’s upsert (e.g. `... .onConflictDoUpdate(...)` for PostgreSQL).

---

## 1.7 Crawl Cron Route

**File:** `app/api/cron/crawl/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { crawlOpenClawSkills } from "@/lib/search/crawlers/github-openclaw";

export const maxDuration = 300; // 5 min for Vercel Pro

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.GITHUB_TOKEN) {
    return NextResponse.json(
      { error: "GITHUB_TOKEN not configured" },
      { status: 500 }
    );
  }

  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const { total, jobId } = await crawlOpenClawSkills(since, 200);
    return NextResponse.json({
      success: true,
      total,
      jobId,
    });
  } catch (err) {
    console.error("[Crawl] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Crawl failed" },
      { status: 500 }
    );
  }
}
```

**vercel.json** — add cron:
```json
{
  "crons": [
    { "path": "/api/v1/cron/ans-verify", "schedule": "0 12 * * *" },
    { "path": "/api/v1/cron/crawl", "schedule": "0 6 * * *" }
  ]
}
```

---

# PHASE 2: SEARCH API

## 2.1 Search Route

**File:** `app/api/search/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { and, eq, gte, sql, desc } from "drizzle-orm";

const SearchSchema = z.object({
  q: z.string().optional(),
  protocols: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(",").filter(Boolean) : [])),
  capabilities: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(",").filter(Boolean) : [])),
  minSafety: z.coerce.number().min(0).max(100).optional(),
  minRank: z.coerce.number().min(0).max(100).optional(),
  sort: z.enum(["rank", "safety", "popularity", "freshness"]).default("rank"),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(50).default(20),
});

export async function GET(req: NextRequest) {
  try {
    const params = SearchSchema.parse(
      Object.fromEntries(req.nextUrl.searchParams)
    );

    const conditions = [eq(agents.status, "ACTIVE")];
    if (params.minSafety != null)
      conditions.push(gte(agents.safetyScore, params.minSafety));
    if (params.minRank != null)
      conditions.push(gte(agents.overallRank, params.minRank));

    const orderBy =
      params.sort === "rank"
        ? desc(agents.overallRank)
        : params.sort === "safety"
        ? desc(agents.safetyScore)
        : params.sort === "popularity"
        ? desc(agents.popularityScore)
        : desc(agents.freshnessScore);

    let query = db
      .select({
        id: agents.id,
        name: agents.name,
        slug: agents.slug,
        description: agents.description,
        capabilities: agents.capabilities,
        protocols: agents.protocols,
        safetyScore: agents.safetyScore,
        popularityScore: agents.popularityScore,
        freshnessScore: agents.freshnessScore,
        overallRank: agents.overallRank,
        githubData: agents.githubData,
        createdAt: agents.createdAt,
      })
      .from(agents)
      .where(and(...conditions))
      .orderBy(orderBy, desc(agents.createdAt))
      .limit(params.limit + 1);

    if (params.cursor) {
      const cursorAgent = await db.query.agents.findFirst({
        where: eq(agents.id, params.cursor),
        columns: { overallRank: true, createdAt: true },
      });
      if (cursorAgent) {
        // Cursor-based: fetch rows after cursor position
        // Simplified: use offset via subquery if needed
        query = query.offset(0);
      }
    }

    const rows = await query;

    const hasMore = rows.length > params.limit;
    const results = hasMore ? rows.slice(0, -1) : rows;
    const nextCursor = hasMore ? results[results.length - 1]?.id : null;

    const facets = await getFacets(conditions);

    return NextResponse.json({
      results,
      pagination: { hasMore, nextCursor, total: results.length },
      facets,
    });
  } catch (err) {
    console.error("[Search] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Search failed" },
      { status: 500 }
    );
  }
}

async function getFacets(conditions: unknown[]) {
  // Simplified facet query
  const protocolCounts = await db
    .select({
      protocol: agents.protocols,
      count: sql<number>`count(*)::int`,
    })
    .from(agents)
    .where(and(...conditions))
    .groupBy(agents.protocols);
  return { protocols: protocolCounts };
}
```

**Full-text search with tsvector:** If `search_vector` column exists, add raw SQL branch:

```typescript
if (params.q?.trim()) {
  const q = params.q.trim().split(/\s+/).join(" & ");
  const tsQuery = db
    .select()
    .from(agents)
    .where(
      and(
        ...conditions,
        sql`agents.search_vector @@ plainto_tsquery('english', ${params.q})`
      )
    );
  // Merge with main query logic
}
```

---

## 2.2 Agent Detail Route

**File:** `app/api/agents/[slug]/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.slug, slug), eq(agents.status, "ACTIVE")));

  if (!agent) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(agent);
}
```

---

# PHASE 3: FRONTEND

## 3.1 SafetyBadge Component

**File:** `components/search/SafetyBadge.tsx`

```tsx
interface Props {
  score: number;
}

export function SafetyBadge({ score }: Props) {
  const color =
    score >= 80
      ? "text-green-500"
      : score >= 50
      ? "text-yellow-500"
      : "text-red-500";
  return (
    <span className={`text-sm font-medium ${color}`}>
      Safety: {score}/100
    </span>
  );
}
```

---

## 3.2 ProtocolBadge Component

**File:** `components/search/ProtocolBadge.tsx`

```tsx
interface Props {
  protocol: string;
}

const COLORS: Record<string, string> = {
  A2A: "bg-blue-500/20 text-blue-300",
  MCP: "bg-purple-500/20 text-purple-300",
  ANP: "bg-cyan-500/20 text-cyan-300",
  OPENCLEW: "bg-amber-500/20 text-amber-300",
  CUSTOM: "bg-slate-500/20 text-slate-300",
};

export function ProtocolBadge({ protocol }: Props) {
  const cls = COLORS[protocol] ?? "bg-slate-600/30 text-slate-400";
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}
    >
      {protocol}
    </span>
  );
}
```

---

## 3.3 AgentCard Component

**File:** `components/search/AgentCard.tsx`

```tsx
import Link from "next/link";
import { SafetyBadge } from "./SafetyBadge";
import { ProtocolBadge } from "./ProtocolBadge";

interface Agent {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  capabilities: string[];
  protocols: string[];
  safetyScore: number;
  popularityScore: number;
  overallRank: number;
  githubData?: { stars?: number; forks?: number };
}

interface Props {
  agent: Agent;
  rank: number;
}

export function AgentCard({ agent, rank }: Props) {
  const caps = Array.isArray(agent.capabilities) ? agent.capabilities : [];
  const protos = Array.isArray(agent.protocols) ? agent.protocols : [];

  return (
    <div className="p-6 rounded-xl bg-slate-800 border border-slate-700 hover:border-blue-500 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <span className="text-2xl font-bold text-slate-500">#{rank}</span>
            <Link
              href={`/agent/${agent.slug}`}
              className="text-xl font-semibold hover:text-blue-400 truncate"
            >
              {agent.name}
            </Link>
            {protos.map((p) => (
              <ProtocolBadge key={p} protocol={p} />
            ))}
          </div>
          <p className="text-slate-400 mb-4 line-clamp-2">
            {agent.description || "No description"}
          </p>
          <div className="flex flex-wrap gap-2 mb-4">
            {caps.slice(0, 5).map((cap) => (
              <span
                key={cap}
                className="px-3 py-1 rounded-full bg-slate-700 text-sm text-slate-300"
              >
                {cap}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-6 text-sm">
            <SafetyBadge score={agent.safetyScore} />
            <span className="text-slate-400">
              ⭐ {agent.githubData?.stars ?? 0}
            </span>
            <span className="text-slate-400">
              Rank: {agent.overallRank.toFixed(1)}/100
            </span>
          </div>
        </div>
        <Link
          href={`/agent/${agent.slug}`}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold flex-shrink-0"
        >
          View
        </Link>
      </div>
    </div>
  );
}
```

---

## 3.4 SearchFilters Component

**File:** `components/search/SearchFilters.tsx`

```tsx
"use client";

interface Props {
  facets?: { protocols?: Array<{ protocol: string[]; count: number }> };
  selectedProtocols: string[];
  onProtocolChange: (p: string[]) => void;
  minSafety: number;
  onSafetyChange: (n: number) => void;
  sort: string;
  onSortChange: (s: string) => void;
}

export function SearchFilters({
  facets,
  selectedProtocols,
  onProtocolChange,
  minSafety,
  onSafetyChange,
  sort,
  onSortChange,
}: Props) {
  const protocols = ["A2A", "MCP", "ANP", "OPENCLEW"];

  const toggleProtocol = (p: string) => {
    if (selectedProtocols.includes(p)) {
      onProtocolChange(selectedProtocols.filter((x) => x !== p));
    } else {
      onProtocolChange([...selectedProtocols, p]);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-slate-300 mb-2">
          Protocol
        </h3>
        <div className="flex flex-wrap gap-2">
          {protocols.map((p) => (
            <button
              key={p}
              onClick={() => toggleProtocol(p)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                selectedProtocols.includes(p)
                  ? "bg-blue-600 text-white"
                  : "bg-slate-700 text-slate-400 hover:bg-slate-600"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-300 mb-2">
          Min Safety
        </h3>
        <input
          type="range"
          min={0}
          max={100}
          value={minSafety}
          onChange={(e) => onSafetyChange(Number(e.target.value))}
          className="w-full"
        />
        <p className="text-xs text-slate-400 mt-1">{minSafety}</p>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-300 mb-2">Sort</h3>
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white"
        >
          <option value="rank">By Rank</option>
          <option value="safety">By Safety</option>
          <option value="popularity">By Popularity</option>
          <option value="freshness">By Freshness</option>
        </select>
      </div>
    </div>
  );
}
```

---

## 3.5 SearchLanding Component

**File:** `components/home/SearchLanding.tsx`

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { AgentCard } from "@/components/search/AgentCard";
import { SearchFilters } from "@/components/search/SearchFilters";

interface Agent {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  capabilities: string[];
  protocols: string[];
  safetyScore: number;
  popularityScore: number;
  overallRank: number;
  githubData?: { stars?: number; forks?: number };
}

export function SearchLanding() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [selectedProtocols, setSelectedProtocols] = useState<string[]>([]);
  const [minSafety, setMinSafety] = useState(0);
  const [sort, setSort] = useState("rank");

  const search = useCallback(
    async (reset = true) => {
      setLoading(true);
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (selectedProtocols.length)
        params.set("protocols", selectedProtocols.join(","));
      if (minSafety > 0) params.set("minSafety", String(minSafety));
      params.set("sort", sort);
      if (!reset && cursor) params.set("cursor", cursor);

      try {
        const res = await fetch(`/api/v1/search?${params}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Search failed");

        if (reset) {
          setAgents(data.results ?? []);
        } else {
          setAgents((prev) => [...prev, ...(data.results ?? [])]);
        }
        setHasMore(data.pagination?.hasMore ?? false);
        setCursor(data.pagination?.nextCursor ?? null);
      } catch (err) {
        console.error(err);
        if (reset) setAgents([]);
      } finally {
        setLoading(false);
      }
    },
    [query, selectedProtocols, minSafety, sort, cursor]
  );

  useEffect(() => {
    search(true);
  }, [selectedProtocols, minSafety, sort]);

  return (
    <section className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-2">Discover AI Agents</h1>
        <p className="text-slate-400 mb-8">
          Search 5,000+ OpenClaw skills, A2A agents, MCP servers. Ranked by
          safety, popularity, freshness.
        </p>

        <div className="flex gap-4 mb-8">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search agents (e.g., 'crypto trading', 'code review')..."
            className="flex-1 px-6 py-4 rounded-lg bg-slate-800 border border-slate-700 focus:border-blue-500 focus:outline-none"
            onKeyDown={(e) => e.key === "Enter" && search(true)}
          />
          <button
            onClick={() => search(true)}
            disabled={loading}
            className="px-8 py-4 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold disabled:opacity-50"
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </div>

        <div className="flex gap-8">
          <aside className="w-64 flex-shrink-0">
            <SearchFilters
              selectedProtocols={selectedProtocols}
              onProtocolChange={setSelectedProtocols}
              minSafety={minSafety}
              onSafetyChange={setMinSafety}
              sort={sort}
              onSortChange={setSort}
            />
          </aside>

          <main className="flex-1">
            <p className="mb-4 text-slate-400">
              {agents.length} agents found
            </p>
            <div className="space-y-4">
              {agents.map((agent, i) => (
                <AgentCard key={agent.id} agent={agent} rank={i + 1} />
              ))}
            </div>
            {hasMore && (
              <button
                onClick={() => search(false)}
                className="mt-8 w-full py-4 bg-slate-800 hover:bg-slate-700 rounded-lg"
              >
                Load more
              </button>
            )}
          </main>
        </div>
      </div>
    </section>
  );
}
```

---

## 3.6 Update Marketing Page

**File:** `app/(marketing)/page.tsx`

Replace the hub branch:

```tsx
// Before:
if (service === "hub") {
  return (
    <div className="min-h-screen flex flex-col">
      <ANSMinimalHeader isAuthenticated={isAuthenticated} />
      <div className="flex-1">
        <ANSLanding />
      </div>
      <ANSMinimalFooter />
    </div>
  );
}

// After:
if (service === "hub") {
  return (
    <div className="min-h-screen flex flex-col">
      <ANSMinimalHeader isAuthenticated={isAuthenticated} />
      <div className="flex-1">
        <SearchLanding />
      </div>
      <ANSMinimalFooter />
    </div>
  );
}
```

Add import: `import { SearchLanding } from "@/components/home/SearchLanding";`

---

## 3.7 Agent Detail Page

**File:** `app/agent/[slug]/page.tsx`

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { ProtocolBadge } from "@/components/search/ProtocolBadge";
import { SafetyBadge } from "@/components/search/SafetyBadge";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function AgentPage({ params }: Props) {
  const { slug } = await params;
  const res = await fetch(
    `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/api/v1/agents/${slug}`,
    { cache: "no-store" }
  );
  if (!res.ok) notFound();
  const agent = await res.json();

  const caps = Array.isArray(agent.capabilities) ? agent.capabilities : [];
  const protos = Array.isArray(agent.protocols) ? agent.protocols : [];
  const github = agent.githubData ?? {};

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link
          href="/"
          className="text-blue-400 hover:text-blue-300 mb-6 inline-block"
        >
          ← Back to search
        </Link>
        <h1 className="text-4xl font-bold mb-2">{agent.name}</h1>
        <div className="flex flex-wrap gap-2 mb-4">
          {protos.map((p: string) => (
            <ProtocolBadge key={p} protocol={p} />
          ))}
        </div>
        <p className="text-slate-400 mb-6">{agent.description}</p>
        <div className="flex gap-6 mb-6">
          <SafetyBadge score={agent.safetyScore} />
          <span>⭐ {github.stars ?? 0} stars</span>
          <span>Rank: {agent.overallRank?.toFixed(1) ?? 0}/100</span>
        </div>
        <div className="flex flex-wrap gap-2 mb-6">
          {caps.map((c: string) => (
            <span
              key={c}
              className="px-3 py-1 rounded-full bg-slate-700 text-sm"
            >
              {c}
            </span>
          ))}
        </div>
        <a
          href={agent.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold"
        >
          View on GitHub →
        </a>
        {agent.readme && (
          <div className="mt-8 p-6 rounded-xl bg-slate-800">
            <h2 className="text-lg font-semibold mb-4">README</h2>
            <pre className="whitespace-pre-wrap text-sm text-slate-300 overflow-x-auto">
              {agent.readme.slice(0, 2000)}
              {agent.readme.length > 2000 ? "..." : ""}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## 3.8 next.config.ts — Resolve /agent Conflict

**Current:** `/agent/:name` rewrites to ANS card API.

**Change:** Remove the rewrite so `/agent/[slug]` resolves to the new page:

```typescript
// Remove from rewrites:
// { source: "/agent/:name", destination: "/api/v1/ans/card/:name" }

// If ANS card must remain for legacy: keep it at /api/v1/ans/card/[name] only.
// Clients use that URL directly.
```

---

# PHASE 4: ANS DEPRECATION

## 4.1 Remove/Redirect

- **ANSLanding** — Replaced by SearchLanding (done above).
- **/register** — Redirect to `/` (search) or add banner: "Agent search has moved. Discover agents below."
- **/register/success** — Redirect to `/`.
- **Middleware** — Remove `*.xpersona.agent` rewrite if ANS is fully deprecated.
- **vercel.json** — Optionally remove `ans-verify` cron if no ANS domains remain.

## 4.2 Keep (Optional)

- `/api/v1/ans/card/[name]` — Keep for existing registered ANS domains.
- `ans_domains`, `ans_subscriptions` — Keep for data integrity.

---

# PHASE 5: ENVIRONMENT & DEPLOYMENT

## 5.1 Environment Variables

```env
# Required for crawler
GITHUB_TOKEN=ghp_xxxx
CRON_SECRET=<random 32-char hex>

# Existing
DATABASE_URL=postgresql://...
```

## 5.2 Vercel Config

- `CRON_SECRET` in project env vars.
- `GITHUB_TOKEN` in project env vars (or use Vercel secret).

## 5.3 Local Docker

Reuse existing `docker-compose.yml`. Run crawler manually:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/v1/cron/crawl"
```

---

# TEST CASES

## Crawler

```typescript
// lib/search/parsers/__tests__/skill-md.test.ts
import { parseSkillMd } from "../skill-md";
import { describe, it, expect } from "vitest";

describe("parseSkillMd", () => {
  it("extracts frontmatter and protocols", () => {
    const content = `---
name: My Skill
description: A cool skill
---
This skill supports OpenClaw and A2A.`;
    const r = parseSkillMd(content);
    expect(r.name).toBe("My Skill");
    expect(r.description).toContain("A cool skill");
    expect(r.protocols).toContain("OPENCLEW");
    expect(r.protocols).toContain("A2A");
  });
});
```

## Search API

```typescript
// app/api/search/route.test.ts
// GET /api/v1/search?sort=rank&limit=5
// Expect 200, results array, pagination object
```

## Safety Score

```typescript
// lib/search/scoring/__tests__/safety.test.ts
// Mock repo + skillContent with eval( -> expect score < 100
```

---

# ADDITIONAL DETAILS

## Duplicate Slug Handling

When multiple repos share the same name (e.g. `my-agent`), slugs collide. In the crawler upsert, use `sourceId` as the unique key. The `slug` can be `{repo-owner}-{repo-name}` to reduce collisions:

```typescript
const slug = generateSlug(`${repo.full_name.replace("/", "-")}`);
```

Or append a short hash: `generateSlug(name) + "-" + repo.id.toString(36)`.

## Loading and Empty States

**SearchLanding:**

- When `loading && agents.length === 0`: show skeleton cards (3–5 placeholder blocks).
- When `!loading && agents.length === 0`: show "No agents found. Try different filters or search terms."
- When `loading && agents.length > 0`: keep showing current results; optionally show a small spinner on "Load more".

## Error Handling

- **Search API**: Return `{ error: string }` with status 400 for validation errors, 500 for server errors.
- **Agent detail API**: Return 404 when slug not found.
- **Crawl cron**: Log errors; return 500 with message. Cron job stores error in `crawl_jobs.error`.

## Rate Limiting (GitHub)

- Authenticated: 5,000 requests/hour.
- Use `p-limit(CONCURRENCY)` to avoid bursting.
- Add `sleep(1200)` between pages.
- Throttling plugin auto-retries on rate limit.

## Full-Text Search Query Syntax

PostgreSQL `plainto_tsquery` normalizes the query. For phrase search, use `phraseto_tsquery`. For AND of terms:

```sql
WHERE search_vector @@ plainto_tsquery('english', $1)
```

## Docker Compose (Optional Standalone Crawler)

If crawler runs as a separate service (e.g. Railway):

```yaml
# docker-compose.search.yml
services:
  postgres:
    image: ankane/pgvector:latest
    environment:
      POSTGRES_USER: xpersona
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: xpersona
    ports: ["5432:5432"]

  crawler:
    build: .
    environment:
      DATABASE_URL: postgresql://xpersona:${DB_PASSWORD}@postgres:5432/xpersona
      GITHUB_TOKEN: ${GITHUB_TOKEN}
    command: npx tsx scripts/run-crawl.mjs
    depends_on: [postgres]
```

`scripts/run-crawl.mjs`:

```javascript
import { crawlOpenClawSkills } from "../lib/search/crawlers/github-openclaw.ts";
const { total } = await crawlOpenClawSkills(undefined, 1000);
console.log("Crawled", total, "agents");
```

## Reddit Launch Copy (from XPERSONA SEARCH.MD)

```
Title: I built Google for AI agents — search 5,000+ OpenClaw skills instantly

Body:
Finding the right AI agent is impossible.
You scroll through GitHub. You check Discord. You ask on Reddit.
I got tired of that. So I built Xpersona Search.

What it does:
• Crawls GitHub for OpenClaw skills, A2A agents, MCP servers
• Ranks every agent by safety, popularity, freshness (AgentRank)
• Lets you filter by capability, protocol, score
• Shows verified metrics, not marketing fluff

Search: "crypto trading low drawdown"
Results ranked by actual performance data.

Current index: 1,247 agents (growing daily)
Safety checked: Malware scans, dependency audits, code analysis

Try it: xpersona.co

Looking for:
• Beta testers
• Agent developers to claim their profiles
• Feedback on ranking algorithm

Tech stack: TypeScript, PostgreSQL + pgvector, Drizzle, Next.js

What should I index next?
```

---

# EXECUTION CHECKLIST

- [ ] 0.1 Add dependencies
- [ ] 0.2 Add `lib/db/search-schema.ts` and wire exports
- [ ] 0.3 Run Drizzle migration
- [ ] 0.4 Add tsvector migration (raw SQL)
- [ ] 1.1 `lib/search/utils/github.ts`
- [ ] 1.2 `lib/search/utils/slug.ts`
- [ ] 1.3 `lib/search/parsers/skill-md.ts`
- [ ] 1.4 `lib/search/scoring/safety.ts`
- [ ] 1.5 `lib/search/scoring/rank.ts`
- [ ] 1.6 `lib/search/crawlers/github-openclaw.ts`
- [ ] 1.7 `app/api/cron/crawl/route.ts`
- [ ] 1.8 Add crawl cron to vercel.json
- [ ] 2.1 `app/api/search/route.ts`
- [ ] 2.2 `app/api/agents/[slug]/route.ts`
- [ ] 3.1 `components/search/SafetyBadge.tsx`
- [ ] 3.2 `components/search/ProtocolBadge.tsx`
- [ ] 3.3 `components/search/AgentCard.tsx`
- [ ] 3.4 `components/search/SearchFilters.tsx`
- [ ] 3.5 `components/home/SearchLanding.tsx`
- [ ] 3.6 Update `app/(marketing)/page.tsx`
- [ ] 3.7 `app/agent/[slug]/page.tsx`
- [ ] 3.8 Update `next.config.ts` (remove /agent rewrite)
- [ ] 4.1 ANS deprecation (redirects, middleware)
- [ ] 5.1 Add GITHUB_TOKEN, CRON_SECRET to env

---

**This is the full A-to-Z implementation plan. Ready to build.**
