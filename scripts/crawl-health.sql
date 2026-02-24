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

-- Media coverage by source/day (last 14 days)
SELECT
  source,
  date_trunc('day', created_at) AS day,
  COUNT(*) AS media_assets
FROM agent_media_assets
WHERE created_at >= now() - interval '14 days'
GROUP BY source, date_trunc('day', created_at)
ORDER BY day DESC, source;

-- Dead/stale media ratio
SELECT
  source,
  COUNT(*) FILTER (WHERE crawl_status IN ('FAILED', 'STALE')) AS dead_assets,
  COUNT(*) AS total_assets,
  ROUND(
    (COUNT(*) FILTER (WHERE crawl_status IN ('FAILED', 'STALE'))::numeric / NULLIF(COUNT(*), 0)) * 100,
    2
  ) AS dead_ratio_pct
FROM agent_media_assets
GROUP BY source
ORDER BY dead_ratio_pct DESC NULLS LAST;

-- Artifact type distribution
SELECT
  COALESCE(artifact_type, 'NONE') AS artifact_type,
  COUNT(*) AS count
FROM agent_media_assets
WHERE asset_kind = 'ARTIFACT'
GROUP BY COALESCE(artifact_type, 'NONE')
ORDER BY count DESC;
