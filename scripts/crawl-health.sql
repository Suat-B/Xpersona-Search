-- Stale RUNNING jobs (likely crashed workers)
SELECT
  id,
  source,
  worker_id,
  status,
  started_at,
  heartbeat_at,
  now() - COALESCE(heartbeat_at, started_at, created_at) AS age
FROM crawl_jobs
WHERE status = 'RUNNING'
ORDER BY age DESC;

-- GitHub crawler failure/retry profile (last 24h)
SELECT
  source,
  COUNT(*) FILTER (WHERE status = 'FAILED') AS failed_jobs,
  COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed_jobs,
  SUM(github_requests) AS github_requests,
  SUM(retry_count) AS retries,
  SUM(rate_limits) AS rate_limits,
  SUM(timeouts) AS timeouts,
  SUM(rate_limit_wait_ms) AS wait_ms
FROM crawl_jobs
WHERE source IN ('GITHUB_REPOS', 'GITHUB_MCP', 'GITHUB_OPENCLEW', 'CREWAI', 'VERCEL_TEMPLATES')
  AND created_at >= now() - interval '24 hours'
GROUP BY source
ORDER BY source;

-- Ingestion growth by source/day (last 14 days)
SELECT
  source,
  date_trunc('day', created_at) AS day,
  COUNT(*) AS new_agents
FROM agents
WHERE created_at >= now() - interval '14 days'
GROUP BY source, date_trunc('day', created_at)
ORDER BY day DESC, source;
