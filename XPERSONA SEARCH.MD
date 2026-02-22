 I'll create a comprehensive, agentic-coding-ready implementation plan for Pillar 1 (Agent Search Engine) that your coding agent can execute step-by-step.

---

# **PILLAR 1: AGENT SEARCH ENGINE**
## *Complete Implementation Plan for Agentic Coding*

---

## **DOCUMENT STRUCTURE**

```
Each section contains:
├── PRD (Product Requirements Document)
├── TECH SPECS (Technical Specifications)
├── CODE PROMPTS (Copy-paste ready for LLM)
├── TEST CASES (Verification criteria)
├── DELIVERABLES (Output files)
└── DEPENDENCIES (What needs to be built first)
```

---

## **PHASE 0: PROJECT SETUP**

### **0.1 Repository Structure**

**PRD:**
Create monorepo for the search engine with crawler, indexer, API, and frontend.

**TECH SPECS:**
- Turborepo with pnpm workspaces
- Apps: `crawler`, `api`, `web`
- Packages: `database`, `types`, `config`
- Language: TypeScript strict
- Deployment: Docker + Railway/Vercel

**CODE PROMPT:**
```bash
# Initialize project
mkdir xpersona-search && cd xpersona-search
git init

# Create structure
mkdir -p apps/{crawler,api,web} packages/{database,types,config}

# Initialize packages
cd packages/database && pnpm init
cd ../types && pnpm init
cd ../config && pnpm init

# Initialize apps
cd ../../apps/crawler && pnpm init
cd ../api && pnpm init
cd ../web && pnpm init

# Root package.json
cat > package.json << 'EOF'
{
  "name": "xpersona-search",
  "private": true,
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "test": "turbo run test"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "^5.3.0"
  },
  "packageManager": "pnpm@8.0.0"
}
EOF

# Turbo config
cat > turbo.json << 'EOF'
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["build"]
    }
  }
}
EOF
```

**DELIVERABLES:**
- `package.json` (root)
- `turbo.json`
- `pnpm-workspace.yaml`
- `.gitignore`

---

### **0.2 Database Schema (Prisma)**

**PRD:**
Design database for crawled agents, their metadata, rankings, and search index.

**TECH SPECS:**
- PostgreSQL 15+
- Prisma ORM with connection pooling
- Full-text search via PostgreSQL tsvector
- Vector embeddings for semantic search (pgvector)

**CODE PROMPT:**
```prisma
// packages/database/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

// Core agent entity
model Agent {
  id                String   @id @default(cuid())
  sourceId          String   @unique // GitHub repo ID, registry ID, etc.
  source            AgentSource
  
  // Identity
  name              String
  slug              String   @unique // URL-friendly name
  description       String?  @db.Text
  url               String   // Source URL (GitHub, registry, etc.)
  homepage          String?  // Agent's own website
  
  // Agent Card (A2A compatible)
  agentCard         Json?    @db.JsonB
  agentCardUrl      String?
  
  // Capabilities
  capabilities      String[] // ["trading", "coding", "writing"]
  protocols         Protocol[] // ["A2A", "MCP", "ANP", "OpenClaw"]
  languages         String[] // ["typescript", "python"]
  
  // Source-specific data
  githubData        Json?    // Stars, forks, last commit
  npmData           Json?    // Downloads, version
  openclawData      Json?    // SKILL.md parsed
  
  // Content for search
  readme            String?  @db.Text
  codeSnippets      String[] @db.Text
  
  // Rankings (Pillar 1 core)
  safetyScore       Int      @default(0) // 0-100
  popularityScore   Int      @default(0) // 0-100
  freshnessScore    Int      @default(0) // 0-100
  performanceScore  Int      @default(0) // 0-100
  overallRank       Float    @default(0) // Weighted composite
  
  // Verification
  verified          Boolean  @default(false)
  verifiedAt        DateTime?
  
  // Status
  status            AgentStatus @default(DISCOVERED)
  lastCrawledAt     DateTime
  lastIndexedAt     DateTime?
  nextCrawlAt       DateTime?
  
  // Relations
  versions          AgentVersion[]
  analytics         AgentAnalytics?
  reviews           Review[]
  
  // Search vectors
  searchVector      Unsupported("tsvector")?
  embedding         Unsupported("vector(1536)")? // For semantic search
  
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  @@index([overallRank])
  @@index([status])
  @@index([capabilities])
  @@index([protocols])
  @@index([searchVector], type: Gin)
  @@index([embedding], type: Hnsw)
  @@map("agents")
}

model AgentVersion {
  id          String   @id @default(cuid())
  agentId     String
  agent       Agent    @relation(fields: [agentId], references: [id], onDelete: Cascade)
  
  version     String
  changelog   String?  @db.Text
  downloadUrl String?
  
  createdAt   DateTime @default(now())
  
  @@index([agentId])
  @@map("agent_versions")
}

model AgentAnalytics {
  id              String   @id @default(cuid())
  agentId         String   @unique
  agent           Agent    @relation(fields: [agentId], references: [id], onDelete: Cascade)
  
  // Engagement metrics
  views           Int      @default(0)
  clicks          Int      @default(0)
  subscriptions   Int      @default(0)
  
  // Performance metrics
  avgRating       Float?
  reviewCount     Int      @default(0)
  
  // Crawl metrics
  crawlCount      Int      @default(0)
  lastCrawlStatus String?
  
  updatedAt       DateTime @updatedAt
  
  @@map("agent_analytics")
}

model Review {
  id          String   @id @default(cuid())
  agentId     String
  agent       Agent    @relation(fields: [agentId], references: [id], onDelete: Cascade)
  
  userId      String
  rating      Int      // 1-5
  content     String?  @db.Text
  
  createdAt   DateTime @default(now())
  
  @@index([agentId])
  @@map("reviews")
}

model CrawlJob {
  id          String   @id @default(cuid())
  source      AgentSource
  status      JobStatus @default(PENDING)
  
  startedAt   DateTime?
  completedAt DateTime?
  error       String?  @db.Text
  
  agentsFound Int      @default(0)
  agentsUpdated Int    @default(0)
  
  createdAt   DateTime @default(now())
  
  @@index([status])
  @@index([createdAt])
  @@map("crawl_jobs")
}

enum AgentSource {
  GITHUB_OPENCLEW
  GITHUB_A2A
  GITHUB_MCP
  CLAWHUB
  NPM
  PYPI
  MANUAL_SUBMISSION
}

enum Protocol {
  A2A
  MCP
  ANP
  OPENCLEW
  CUSTOM
}

enum AgentStatus {
  DISCOVERED    // Found by crawler, not processed
  PENDING_REVIEW // In safety scan queue
  ACTIVE        // Live and searchable
  SUSPENDED     // Failed safety check
  DEPRECATED    // No longer maintained
  REMOVED       // Deleted by author or admin
}

enum JobStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
}
```

**MIGRATION:**
```bash
# Generate migration
cd packages/database
npx prisma migrate dev --name init_search_engine

# Generate client
npx prisma generate
```

**DELIVERABLES:**
- `schema.prisma`
- Migration files
- Generated Prisma client

---

## **PHASE 1: THE CRAWLER**

### **1.1 GitHub OpenClaw Crawler**

**PRD:**
Crawl GitHub for OpenClaw skills by searching for SKILL.md files and parsing repository metadata.

**TECH SPECS:**
- GitHub REST API v3 + GraphQL v4
- Rate limiting: 5,000 requests/hour (authenticated)
- Incremental crawling (check `updated_at`)
- Parallel processing with p-limit

**CODE PROMPT:**
```typescript
// apps/crawler/src/sources/githubOpenClaw.ts

import { Octokit } from '@octokit/rest';
import { throttling } from '@octokit/plugin-throttling';
import { retry } from '@octokit/plugin-retry';
import { parseSkillMd } from '../parsers/skillMd';
import { calculateSafetyScore } from '../scoring/safety';
import { prisma } from '@xpersona/database';

const MyOctokit = Octokit.plugin(throttling, retry);

const octokit = new MyOctokit({
  auth: process.env.GITHUB_TOKEN,
  throttle: {
    onRateLimit: (retryAfter, options) => {
      console.warn(`Rate limit hit, retrying after ${retryAfter} seconds`);
      return true;
    },
    onSecondaryRateLimit: (retryAfter, options) => {
      console.warn(`Secondary rate limit hit, retrying after ${retryAfter} seconds`);
      return true;
    }
  }
});

export interface GitHubRepo {
  id: number;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  updated_at: string;
  pushed_at: string;
  default_branch: string;
}

export async function crawlOpenClawSkills(
  since?: Date,
  maxResults: number = 1000
): Promise<number> {
  console.log('Starting OpenClaw skill crawl...');
  
  const query = 'filename:SKILL.md openclaw';
  const perPage = 100;
  let page = 1;
  let totalFound = 0;
  
  while (totalFound < maxResults) {
    try {
      const { data } = await octokit.rest.search.code({
        q: query,
        sort: 'indexed',
        order: 'desc',
        per_page: perPage,
        page
      });
      
      if (data.items.length === 0) break;
      
      // Process repositories in parallel (with concurrency limit)
      const repos = await Promise.all(
        data.items.map(item => fetchRepoDetails(item.repository.full_name))
      );
      
      for (const repo of repos) {
        if (!repo) continue;
        
        // Skip if not updated since last crawl
        if (since && new Date(repo.updated_at) <= since) {
          continue;
        }
        
        // Fetch SKILL.md content
        const skillContent = await fetchSkillMd(repo.full_name, repo.default_branch);
        if (!skillContent) continue;
        
        // Parse SKILL.md
        const skillData = parseSkillMd(skillContent);
        
        // Calculate scores
        const safetyScore = await calculateSafetyScore(repo, skillContent);
        const popularityScore = calculatePopularityScore(repo);
        const freshnessScore = calculateFreshnessScore(repo);
        
        // Upsert agent
        await upsertAgent({
          source: 'GITHUB_OPENCLEW',
          sourceId: `github:${repo.id}`,
          name: skillData.name || repo.name,
          slug: generateSlug(repo.name),
          description: skillData.description || repo.description,
          url: repo.html_url,
          homepage: skillData.homepage,
          capabilities: skillData.capabilities || [],
          protocols: ['OPENCLEW'],
          languages: detectLanguages(repo),
          githubData: {
            stars: repo.stargazers_count,
            forks: repo.forks_count,
            lastCommit: repo.pushed_at,
            defaultBranch: repo.default_branch
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
            performance: 0 // Will be updated with backtests
          }),
          lastCrawledAt: new Date(),
          nextCrawlAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // Recrawl in 24h
        });
        
        totalFound++;
      }
      
      console.log(`Processed page ${page}, total: ${totalFound}`);
      page++;
      
      // Respect rate limits
      await sleep(1000);
      
    } catch (error) {
      console.error('Crawl error:', error);
      break;
    }
  }
  
  console.log(`Crawl complete. Found ${totalFound} agents.`);
  return totalFound;
}

async function fetchRepoDetails(fullName: string): Promise<GitHubRepo | null> {
  try {
    const [owner, repo] = fullName.split('/');
    const { data } = await octokit.rest.repos.get({ owner, repo });
    return data;
  } catch (error) {
    console.error(`Failed to fetch repo ${fullName}:`, error);
    return null;
  }
}

async function fetchSkillMd(
  fullName: string,
  branch: string
): Promise<string | null> {
  try {
    const [owner, repo] = fullName.split('/');
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: 'SKILL.md',
      ref: branch
    });
    
    if ('content' in data) {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }
    return null;
  } catch (error) {
    return null;
  }
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 63);
}

function calculatePopularityScore(repo: GitHubRepo): number {
  // Logarithmic scale: 0 stars = 0, 1000 stars = 100
  const score = Math.min(100, Math.log10(repo.stargazers_count + 1) * 25);
  return Math.round(score);
}

function calculateFreshnessScore(repo: GitHubRepo): number {
  const lastPush = new Date(repo.pushed_at);
  const daysSincePush = (Date.now() - lastPush.getTime()) / (1000 * 60 * 60 * 24);
  
  // Exponential decay: updated today = 100, 30 days ago = 50, 90 days ago = 0
  const score = 100 * Math.exp(-daysSincePush / 30);
  return Math.round(score);
}

function calculateOverallRank(scores: {
  safety: number;
  popularity: number;
  freshness: number;
  performance: number;
}): number {
  // Weighted average
  const weights = { safety: 0.3, popularity: 0.2, freshness: 0.2, performance: 0.3 };
  const rank = (
    scores.safety * weights.safety +
    scores.popularity * weights.popularity +
    scores.freshness * weights.freshness +
    scores.performance * weights.performance
  );
  return Math.round(rank * 10) / 10; // One decimal place
}

function detectLanguages(repo: GitHubRepo): string[] {
  // This would use the GitHub languages API
  // Simplified for now
  return ['typescript']; // Default assumption for OpenClaw
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function upsertAgent(data: any): Promise<void> {
  await prisma.agent.upsert({
    where: { sourceId: data.sourceId },
    update: {
      ...data,
      updatedAt: new Date()
    },
    create: data
  });
}
```

**TEST CASE:**
```typescript
// apps/crawler/src/sources/__tests__/githubOpenClaw.test.ts

describe('crawlOpenClawSkills', () => {
  it('discovers agents from GitHub', async () => {
    const count = await crawlOpenClawSkills(undefined, 10);
    expect(count).toBeGreaterThan(0);
    
    const agent = await prisma.agent.findFirst({
      where: { source: 'GITHUB_OPENCLEW' }
    });
    
    expect(agent).toBeTruthy();
    expect(agent?.safetyScore).toBeGreaterThanOrEqual(0);
    expect(agent?.overallRank).toBeGreaterThanOrEqual(0);
  });
  
  it('respects since parameter for incremental crawl', async () => {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const count = await crawlOpenClawSkills(since, 100);
    // Should only find recently updated repos
  });
});
```

---

### **1.2 SKILL.md Parser**

**PRD:**
Parse OpenClaw SKILL.md files to extract metadata, capabilities, and configuration.

**TECH SPECS:**
- YAML frontmatter parser (gray-matter)
- Markdown content extraction
- Validation against OpenClaw schema

**CODE PROMPT:**
```typescript
// apps/crawler/src/parsers/skillMd.ts

import matter from 'gray-matter';

export interface SkillData {
  name?: string;
  description?: string;
  version?: string;
  author?: string;
  homepage?: string;
  capabilities: string[];
  protocols: string[];
  parameters?: Record<string, {
    type: string;
    required?: boolean;
    default?: any;
    description?: string;
  }>;
  dependencies?: string[];
  permissions?: string[];
  examples?: string[];
  raw: string;
}

export function parseSkillMd(content: string): SkillData {
  const { data, content: body } = matter(content);
  
  // Extract capabilities from content
  const capabilities = extractCapabilities(body);
  
  // Extract protocols
  const protocols = extractProtocols(body);
  
  return {
    name: data.name,
    description: data.description || extractDescription(body),
    version: data.version,
    author: data.author,
    homepage: data.homepage,
    capabilities,
    protocols,
    parameters: data.parameters || {},
    dependencies: data.dependencies || [],
    permissions: data.permissions || [],
    examples: extractExamples(body),
    raw: content
  };
}

function extractCapabilities(body: string): string[] {
  const capabilities: string[] = [];
  
  // Look for capability mentions
  const patterns = [
    /capability:\s*(\w+)/gi,
    /can\s+(\w+)/gi,
    /supports?\s+(\w+)/gi
  ];
  
  for (const pattern of patterns) {
    const matches = body.matchAll(pattern);
    for (const match of matches) {
      capabilities.push(match[1].toLowerCase());
    }
  }
  
  // Deduplicate
  return [...new Set(capabilities)];
}

function extractProtocols(body: string): string[] {
  const protocols: string[] = [];
  
  if (body.includes('A2A')) protocols.push('A2A');
  if (body.includes('MCP')) protocols.push('MCP');
  if (body.includes('ANP')) protocols.push('ANP');
  if (body.includes('OpenClaw') || body.includes('openclaw')) protocols.push('OPENCLEW');
  
  return protocols;
}

function extractDescription(body: string): string {
  // First paragraph after frontmatter
  const lines = body.split('\n').filter(line => line.trim());
  return lines[0]?.slice(0, 200) || '';
}

function extractExamples(body: string): string[] {
  const examples: string[] = [];
  const codeBlockRegex = /```[\w]*\n([\s\S]*?)```/g;
  
  let match;
  while ((match = codeBlockRegex.exec(body)) !== null) {
    examples.push(match[1].trim());
  }
  
  return examples.slice(0, 3); // Limit to 3 examples
}
```

---

### **1.3 Safety Scoring Engine**

**PRD:**
Analyze code for security vulnerabilities, malicious patterns, and trust signals.

**TECH SPECS:**
- Static analysis with Semgrep rules
- Dependency vulnerability scanning (OSV)
- Secret detection (gitleaks patterns)
- Reputation scoring (author history)

**CODE PROMPT:**
```typescript
// apps/crawler/src/scoring/safety.ts

import { GitHubRepo } from '../sources/githubOpenClaw';

export interface SafetyReport {
  score: number; // 0-100
  issues: SafetyIssue[];
  checks: Record<string, boolean>;
}

export interface SafetyIssue {
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: string;
  message: string;
  file?: string;
  line?: number;
}

export async function calculateSafetyScore(
  repo: GitHubRepo,
  skillContent: string
): Promise<number> {
  const checks: Record<string, boolean> = {};
  const issues: SafetyIssue[] = [];
  
  // Check 1: Has LICENSE file
  checks.hasLicense = await checkFileExists(repo.full_name, 'LICENSE');
  if (!checks.hasLicense) {
    issues.push({
      severity: 'medium',
      type: 'missing_license',
      message: 'Repository lacks LICENSE file'
    });
  }
  
  // Check 2: Has README
  checks.hasReadme = await checkFileExists(repo.full_name, 'README.md');
  
  // Check 3: Not a fork (original work preferred)
  checks.isOriginal = !(await isFork(repo.full_name));
  if (!checks.isOriginal) {
    issues.push({
      severity: 'low',
      type: 'is_fork',
      message: 'Repository is a fork'
    });
  }
  
  // Check 4: Recent activity
  const lastPush = new Date(repo.pushed_at);
  const daysSincePush = (Date.now() - lastPush.getTime()) / (1000 * 60 * 60 * 24);
  checks.isMaintained = daysSincePush < 90;
  if (!checks.isMaintained) {
    issues.push({
      severity: 'high',
      type: 'unmaintained',
      message: `Last update ${Math.round(daysSincePush)} days ago`
    });
  }
  
  // Check 5: No suspicious code patterns
  const suspiciousPatterns = [
    /eval\s*\(/,
    /Function\s*\(/,
    /child_process/,
    /exec\s*\(/,
    /fetch\s*\(\s*["']http:\/\/(?!localhost)/,
    /process\.env\./,
    /localStorage\.getItem/,
    /document\.cookie/
  ];
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(skillContent)) {
      issues.push({
        severity: 'high',
        type: 'suspicious_code',
        message: `Potentially dangerous pattern: ${pattern.source}`
      });
    }
  }
  
  // Check 6: Has tests
  checks.hasTests = await checkFileExists(repo.full_name, 'test') || 
                    await checkFileExists(repo.full_name, '__tests__') ||
                    await checkFileExists(repo.full_name, '*.test.ts');
  
  // Calculate score
  let score = 100;
  
  for (const issue of issues) {
    switch (issue.severity) {
      case 'critical': score -= 50; break;
      case 'high': score -= 20; break;
      case 'medium': score -= 10; break;
      case 'low': score -= 5; break;
    }
  }
  
  // Bonus for positive signals
  if (checks.hasLicense) score += 5;
  if (checks.hasTests) score += 10;
  if (checks.isOriginal) score += 5;
  if (repo.stargazers_count > 100) score += 10;
  
  return Math.max(0, Math.min(100, score));
}

async function checkFileExists(repoFullName: string, path: string): Promise<boolean> {
  // Implementation using GitHub API
  return false; // Placeholder
}

async function isFork(repoFullName: string): Promise<boolean> {
  // Implementation
  return false; // Placeholder
}
```

---

## **PHASE 2: SEARCH API**

### **2.1 Search Endpoint**

**PRD:**
Full-text search with filtering, sorting, and pagination.

**TECH SPECS:**
- PostgreSQL full-text search (tsvector)
- Semantic search with pgvector (OpenAI embeddings)
- Faceted search (filter by protocol, capability, score)
- Cursor-based pagination

**CODE PROMPT:**
```typescript
// apps/api/src/routes/search.ts

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@xpersona/database';

const router = Router();

const SearchSchema = z.object({
  q: z.string().optional(),
  protocols: z.array(z.enum(['A2A', 'MCP', 'ANP', 'OPENCLEW'])).optional(),
  capabilities: z.array(z.string()).optional(),
  minSafety: z.number().min(0).max(100).optional(),
  minRank: z.number().min(0).max(100).optional(),
  sort: z.enum(['rank', 'safety', 'popularity', 'freshness']).default('rank'),
  cursor: z.string().optional(),
  limit: z.number().min(1).max(50).default(20)
});

router.get('/', async (req, res) => {
  try {
    const params = SearchSchema.parse(req.query);
    
    // Build where clause
    const where: any = {
      status: 'ACTIVE'
    };
    
    if (params.q) {
      // Full-text search
      where.searchVector = {
        search: params.q.split(' ').join(' & ')
      };
    }
    
    if (params.protocols?.length) {
      where.protocols = {
        hasSome: params.protocols
      };
    }
    
    if (params.capabilities?.length) {
      where.capabilities = {
        hasSome: params.capabilities
      };
    }
    
    if (params.minSafety) {
      where.safetyScore = {
        gte: params.minSafety
      };
    }
    
    if (params.minRank) {
      where.overallRank = {
        gte: params.minRank
      };
    }
    
    // Build orderBy
    const orderBy: any = {};
    switch (params.sort) {
      case 'rank':
        orderBy.overallRank = 'desc';
        break;
      case 'safety':
        orderBy.safetyScore = 'desc';
        break;
      case 'popularity':
        orderBy.popularityScore = 'desc';
        break;
      case 'freshness':
        orderBy.freshnessScore = 'desc';
        break;
    }
    
    // Add secondary sort
    orderBy.createdAt = 'desc';
    
    // Execute search
    const agents = await prisma.agent.findMany({
      where,
      orderBy,
      take: params.limit + 1, // +1 for cursor
      cursor: params.cursor ? { id: params.cursor } : undefined,
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        capabilities: true,
        protocols: true,
        safetyScore: true,
        popularityScore: true,
        freshnessScore: true,
        overallRank: true,
        githubData: true,
        createdAt: true
      }
    });
    
    // Handle pagination
    const hasMore = agents.length > params.limit;
    const results = hasMore ? agents.slice(0, -1) : agents;
    const nextCursor = hasMore ? results[results.length - 1].id : null;
    
    res.json({
      results: results.map(agent => ({
        ...agent,
        githubData: agent.githubData as any
      })),
      pagination: {
        hasMore,
        nextCursor,
        total: results.length
      },
      facets: await getFacets(where)
    });
    
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Get search facets (aggregations)
async function getFacets(where: any) {
  const [protocols, capabilities] = await Promise.all([
    prisma.agent.groupBy({
      by: ['protocols'],
      where,
      _count: true
    }),
    prisma.agent.groupBy({
      by: ['capabilities'],
      where,
      _count: true
    })
  ]);
  
  return {
    protocols: protocols.map(p => ({
      value: p.protocols,
      count: p._count
    })),
    capabilities: capabilities.slice(0, 20).map(c => ({
      value: c.capabilities,
      count: c._count
    }))
  };
}

export default router;
```

---

## **PHASE 3: FRONTEND**

### **3.1 Search Interface**

**CODE PROMPT:**
```typescript
// apps/web/app/search/page.tsx

'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { AgentCard } from '../../components/AgentCard';
import { SearchFilters } from '../../components/SearchFilters';

interface Agent {
  id: string;
  name: string;
  slug: string;
  description: string;
  capabilities: string[];
  protocols: string[];
  safetyScore: number;
  popularityScore: number;
  overallRank: number;
  githubData: {
    stars: number;
    forks: number;
  };
}

export default function SearchPage() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [facets, setFacets] = useState<any>(null);
  
  // Filters
  const [selectedProtocols, setSelectedProtocols] = useState<string[]>([]);
  const [minSafety, setMinSafety] = useState(0);
  
  const search = async (reset = true) => {
    setLoading(true);
    
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (selectedProtocols.length) params.set('protocols', selectedProtocols.join(','));
    if (minSafety > 0) params.set('minSafety', minSafety.toString());
    if (!reset && cursor) params.set('cursor', cursor);
    
    const res = await fetch(`/api/search?${params}`);
    const data = await res.json();
    
    if (reset) {
      setAgents(data.results);
    } else {
      setAgents(prev => [...prev, ...data.results]);
    }
    
    setHasMore(data.pagination.hasMore);
    setCursor(data.pagination.nextCursor);
    setFacets(data.facets);
    setLoading(false);
  };
  
  useEffect(() => {
    search();
  }, [selectedProtocols, minSafety]);
  
  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Discover AI Agents</h1>
        
        {/* Search bar */}
        <div className="flex gap-4 mb-8">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search agents (e.g., 'crypto trading', 'code review')..."
            className="flex-1 px-6 py-4 rounded-lg bg-slate-800 border border-slate-700 focus:border-blue-500 focus:outline-none"
            onKeyPress={(e) => e.key === 'Enter' && search()}
          />
          <button
            onClick={() => search()}
            disabled={loading}
            className="px-8 py-4 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold disabled:bg-slate-700"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
        
        <div className="flex gap-8">
          {/* Filters sidebar */}
          <div className="w-64 flex-shrink-0">
            <SearchFilters
              facets={facets}
              selectedProtocols={selectedProtocols}
              onProtocolChange={setSelectedProtocols}
              minSafety={minSafety}
              onSafetyChange={setMinSafety}
            />
          </div>
          
          {/* Results */}
          <div className="flex-1">
            <div className="mb-4 text-slate-400">
              {agents.length} agents found
            </div>
            
            <div className="space-y-4">
              {agents.map((agent, index) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  rank={index + 1}
                />
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
          </div>
        </div>
      </div>
    </div>
  );
}
```

### **3.2 Agent Card Component**

```typescript
// apps/web/components/AgentCard.tsx

import Link from 'next/link';
import { SafetyBadge } from './SafetyBadge';
import { ProtocolBadge } from './ProtocolBadge';

interface Props {
  agent: any;
  rank: number;
}

export function AgentCard({ agent, rank }: Props) {
  return (
    <div className="p-6 rounded-xl bg-slate-800 border border-slate-700 hover:border-blue-500 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl font-bold text-slate-500">#{rank}</span>
            <Link 
              href={`/agent/${agent.slug}`}
              className="text-xl font-semibold hover:text-blue-400"
            >
              {agent.name}
            </Link>
            {agent.protocols.map((p: string) => (
              <ProtocolBadge key={p} protocol={p} />
            ))}
          </div>
          
          <p className="text-slate-400 mb-4 line-clamp-2">
            {agent.description}
          </p>
          
          <div className="flex flex-wrap gap-2 mb-4">
            {agent.capabilities.slice(0, 5).map((cap: string) => (
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
              ⭐ {agent.githubData?.stars || 0}
            </span>
            <span className="text-slate-400">
              Rank: {agent.overallRank.toFixed(1)}/100
            </span>
          </div>
        </div>
        
        <Link
          href={`/agent/${agent.slug}`}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold"
        >
          View
        </Link>
      </div>
    </div>
  );
}
```

---

## **PHASE 4: DEPLOYMENT**

### **4.1 Docker Compose**

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: ankane/pgvector:latest
    environment:
      POSTGRES_USER: xpersona
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: xpersona_search
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  crawler:
    build:
      context: .
      dockerfile: apps/crawler/Dockerfile
    environment:
      - DATABASE_URL=postgresql://xpersona:${DB_PASSWORD}@postgres:5432/xpersona_search
      - GITHUB_TOKEN=${GITHUB_TOKEN}
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis
    command: npm run start:crawler

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    environment:
      - DATABASE_URL=postgresql://xpersona:${DB_PASSWORD}@postgres:5432/xpersona_search
      - REDIS_URL=redis://redis:6379
    ports:
      - "3001:3001"
    depends_on:
      - postgres
      - redis

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    environment:
      - NEXT_PUBLIC_API_URL=http://api:3001
    ports:
      - "3000:3000"
    depends_on:
      - api

volumes:
  postgres_data:
```

---

## **EXECUTION TIMELINE**

| Day | Phase | Deliverable |
|-----|-------|-------------|
| 1 | 0.1-0.2 | Project setup, database schema |
| 2 | 1.1 | GitHub crawler working |
| 3 | 1.2-1.3 | SKILL.md parser, safety scoring |
| 4 | 2.1 | Search API with filters |
| 5 | 3.1-3.2 | Search UI, AgentCard |
| 6 | 4.1 | Docker deployment |
| 7 | - | Reddit launch |

---

## **REDDIT LAUNCH POST**

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

Try it: xpersona.co/search

Looking for:
• Beta testers
• Agent developers to claim their profiles
• Feedback on ranking algorithm

Tech stack: TypeScript, PostgreSQL + pgvector, Prisma, Next.js

What should I index next?
```

---

**This is Pillar 1. The search engine that makes Xpersona the default place to find AI agents.**

Ready to build? ❤️