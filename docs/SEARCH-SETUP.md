# Agent Search - Database Setup

To show agents in search results, you need to:

1. Create the `agents` table (and crawler tables)
2. Add the `search_vector` column for full-text search
3. Run the crawler to populate agents from GitHub and other sources

---

## 1. Prerequisites

Add to `.env.local`:

```bash
# Required (PostgreSQL)
DATABASE_URL=postgresql://user:password@localhost:5432/xpersona

# Required crawler auth (choose one)
GITHUB_TOKEN=ghp_xxxxxxxxxxxx
# GITHUB_APP_ID=123456
# GITHUB_APP_INSTALLATION_ID=12345678
# GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
```

Getting a GitHub PAT:
- Go to [GitHub Settings -> Developer settings -> Personal access tokens](https://github.com/settings/tokens)
- Create a token (classic) with `public_repo` scope
- Unauthenticated limit is 60 req/hour; authenticated PAT is typically 5,000 req/hour

For high-scale crawling, prefer GitHub App installation auth.

---

## 2. Create Tables and Search Vectors

Run:

```bash
npm run db:ensure-agents-table
npm run db:ensure-crawler-schema
```

This ensures `agents`, `crawl_jobs`, `crawl_frontier`, `crawl_checkpoints`, and crawler resiliency columns exist.

If you use Drizzle migrations:

```bash
npm run db:push
node scripts/ensure-search-vectors.mjs
```

---

## 3. Run Crawlers

Basic full crawl:

```bash
npm run crawl
```

This runs a full backfill (all enabled sources, no date filter). Default max is 1500; override with:

```bash
npm run crawl 2000
```

Deeper backfill:

```bash
npm run crawl:full
```

100k-scale population:

```bash
npm run crawl:100k
```

Dedicated resilient worker (recommended for GitHub-heavy crawling):

```bash
npm run crawl:worker
```

Worker behavior:
- hot mode every 5 minutes
- nightly deep backfill
- stale RUNNING job reaper before cycles

---

## 4. Verify

1. Visit `http://localhost:3000/?q=discover` or `http://localhost:3000/?hub=1&q=discover`
2. Confirm new results appear and GitHub sources continue updating over time

---

## Production (Vercel Cron)

The `/api/cron/crawl` route can run non-GitHub crawlers, and optionally GitHub crawlers.

Recommended env:
- `CRON_SECRET` - generate with `openssl rand -hex 32`
- `CRAWL_GITHUB_IN_CRON=0` - keep GitHub crawlers disabled in serverless cron when dedicated worker is enabled
- `GITHUB_TOKEN` or GitHub App env vars if you intentionally run GitHub sources in cron
- `CRAWL_MAX_RESULTS` - optional per-source max, default 500
- `CRAWL_SINCE_DAYS` - optional, `0` full crawl (default)
- `CRAWL_BATCH_SIZE` - optional batch limit for heavy crawlers, default 2000
- `CRAWL_SOURCE_FILTER` - optional source allowlist
- `CRAWL_BROAD_MODE` - optional `1` for relaxed npm/PyPI filtering
- `HUGGINGFACE_TOKEN` - optional
- `REPLICATE_API_TOKEN` - optional
- `A2A_REGISTRY_URL` - optional
- `MCP_REGISTRY_URL` - optional

Then configure a cron job to call `GET /api/cron/crawl` with `Authorization: Bearer <CRON_SECRET>`.

---

## Ranking Tuning (Optional)

```bash
SEARCH_HYBRID_RANKING=1
SEARCH_RANK_WEIGHT_LEXICAL=0.62
SEARCH_RANK_WEIGHT_AUTHORITY=0.22
SEARCH_RANK_WEIGHT_ENGAGEMENT=0.12
SEARCH_RANK_WEIGHT_FRESHNESS=0.04

SEARCH_ENGAGEMENT_PRIOR_MEAN=0.06
SEARCH_ENGAGEMENT_PRIOR_STRENGTH=20
SEARCH_ENGAGEMENT_CONFIDENCE_IMPRESSIONS=40
SEARCH_ENGAGEMENT_SCORE_SCALE=2.25

SEARCH_RANK_LOG_MODE=sample   # off | sample | all
SEARCH_RANK_LOG_SAMPLE_RATE=0.02
SEARCH_DEBUG_HEADERS=0

SEARCH_SEMANTIC_ENABLED=1
SEARCH_EMBEDDING_PROVIDER=openai
SEARCH_EMBEDDING_MODEL=text-embedding-3-small
SEARCH_SEMANTIC_CANDIDATES=80
OPENAI_API_KEY=sk-...
```

Notes:
- weights are auto-normalized
- lexical should usually remain dominant unless engagement signals are mature
- use sampled rank logs in production

## Media Vertical (Images + Artifacts)

Enable crawler media ingestion:

```bash
SEARCH_MEDIA_VERTICAL_ENABLED=1
SEARCH_MEDIA_SOURCES=GITHUB_REPOS,GITHUB_MCP,GITHUB_OPENCLEW,PYPI,NPM,HUGGINGFACE,REPLICATE,MCP_REGISTRY,CLAWHUB,VERCEL_TEMPLATES,DOCKER
SEARCH_MEDIA_MIN_QUALITY_SCORE=0
SEARCH_MEDIA_ALLOWED_HOSTS=raw.githubusercontent.com,github.com,opengraph.githubassets.com,avatars.githubusercontent.com
SEARCH_MEDIA_DENIED_HOSTS=
```

Notes:
- `SEARCH_MEDIA_SOURCES` is optional. If omitted, all sources are eligible.
- `SEARCH_MEDIA_MIN_QUALITY_SCORE` filters low-quality discovered assets before upsert.
- Search API supports optional `minMediaQuality=0..100` when `vertical=images|artifacts`.
