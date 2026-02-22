# Agent Search — Database Setup

To show agents in the search results, you need to:

1. Create the `agents` table (and `crawl_jobs`)
2. Add the `search_vector` column for full-text search
3. Run the crawler to populate agents from GitHub

---

## 1. Prerequisites

Add to `.env.local`:

```bash
# Required (PostgreSQL)
DATABASE_URL=postgresql://user:password@localhost:5432/xpersona

# Required for the crawler (GitHub API for finding OpenClaw SKILL.md files)
GITHUB_TOKEN=ghp_xxxxxxxxxxxx
```

**Getting a GitHub token:**
- Go to [GitHub Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens)
- Create a token (classic) with `public_repo` scope
- Without it, the crawler hits the unauthenticated rate limit (60 req/hr); with it, 5,000 req/hr

---

## 2. Create Tables and Search Vectors

Run:

```bash
npm run db:ensure-agents-table
```

This creates `agents`, `crawl_jobs`, the `search_vector` column, and the trigger for full-text search.

**Alternative:** If you use Drizzle migrations:

```bash
npm run db:push
node scripts/ensure-search-vectors.mjs
```

---

## 3. Run the Crawler

```bash
npm run crawl
```

This runs a **full backfill** (all sources, no date filter): OpenClaw, MCP, ClawHub, GitHub Repos, MCP Registry, PyPI, Curated Seeds, Hugging Face Spaces, Docker Hub, AgentScape, Replicate (if token set), A2A Registry, npm. Default max is 1500; override with:

```bash
npm run crawl 2000
```

For a deep initial backfill:

```bash
npm run crawl:full
```

---

## 4. Verify

1. Visit `http://localhost:3000/?q=discover` or `http://localhost:3000/?hub=1&q=discover`
2. You should see agent results

---

## Production (Vercel Cron)

The `/api/cron/crawl` route runs multiple crawlers. Add to Vercel env:

- `CRON_SECRET` — generate with `openssl rand -hex 32`
- `GITHUB_TOKEN` — required for GitHub OpenClaw, MCP, ClawHub, GitHub Repos crawlers
- `CRAWL_MAX_RESULTS` — (optional) max agents per source, default 500
- `CRAWL_SINCE_DAYS` — (optional) 0 = full crawl (default), 7 = last 7 days (incremental)
- `CRAWL_BATCH_SIZE` — (optional) batch limit for heavy crawlers (HF Spaces), default 2000
- `CRAWL_SOURCE_FILTER` — (optional) comma-separated sources to run only (e.g. `CLAWHUB,MCP_REGISTRY`); empty = all
- `CRAWL_BROAD_MODE` — (optional) `1` to enable relaxed npm/PyPI filtering for volume
- `HUGGINGFACE_TOKEN` — (optional) for higher Hugging Face API rate limits
- `REPLICATE_API_TOKEN` — (optional) for Replicate models crawler
- `A2A_REGISTRY_URL` — (optional) A2A registry API base URL, default `https://api.a2a-registry.dev`
- `MCP_REGISTRY_URL` — (optional) MCP Registry API base, default `https://registry.modelcontextprotocol.io`

Then configure a cron job to call `GET /api/cron/crawl` with `Authorization: Bearer <CRON_SECRET>`. Crons run at 6:00 UTC daily and every 6 hours.
