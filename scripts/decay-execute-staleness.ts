#!/usr/bin/env npx tsx
import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

type TrustMap = Record<string, number>;

const DEFAULT_TRUST: TrustMap = {
  GITHUB_REPOS: 1,
  GITHUB_MCP: 1,
  GITHUB_OPENCLEW: 1,
  MCP_REGISTRY: 0.95,
  A2A_REGISTRY: 0.95,
  CLAWHUB: 0.92,
  CURATED_SEEDS: 0.9,
  AWESOME_LISTS: 0.88,
  NPM: 0.82,
  PYPI: 0.82,
  HUGGINGFACE: 0.78,
  DOCKER: 0.75,
  REPLICATE: 0.74,
  SMITHERY: 0.7,
  AGENTSCAPE: 0.7,
  OLLAMA: 0.68,
};

function getTrustMap(): TrustMap {
  const raw = process.env.SEARCH_SOURCE_TRUST_WEIGHTS_JSON;
  if (!raw) return DEFAULT_TRUST;
  try {
    const parsed = JSON.parse(raw) as Record<string, number>;
    return { ...DEFAULT_TRUST, ...parsed };
  } catch {
    return DEFAULT_TRUST;
  }
}

async function main() {
  const staleContractHours = Number(process.env.SEARCH_CONTRACT_MAX_AGE_HOURS ?? "168");
  const staleMetricsHours = Number(process.env.SEARCH_METRICS_MAX_AGE_HOURS ?? "168");
  const decayCap = Number(process.env.SEARCH_STALE_DECAY_CAP ?? "0.35");
  const trustMap = getTrustMap();

  const trustCase = sql.raw(
    Object.entries(trustMap)
      .map(([source, weight]) => `WHEN '${source.replace(/'/g, "''")}' THEN ${Number(weight)}`)
      .join(" ")
  );

  const result = await db.execute(sql`
    WITH base AS (
      SELECT
        a.id,
        a.source,
        a.overall_rank,
        a.freshness_score,
        c.updated_at AS contract_updated_at,
        m.updated_at AS metrics_updated_at,
        EXTRACT(EPOCH FROM (now() - c.updated_at)) / 3600.0 AS contract_age_h,
        EXTRACT(EPOCH FROM (now() - m.updated_at)) / 3600.0 AS metrics_age_h
      FROM agents a
      LEFT JOIN agent_capability_contracts c ON c.agent_id = a.id
      LEFT JOIN agent_execution_metrics m ON m.agent_id = a.id
      WHERE a.status = 'ACTIVE'
    ),
    scored AS (
      SELECT
        id,
        source,
        overall_rank,
        freshness_score,
        CASE source ${trustCase} ELSE 0.7 END AS source_trust,
        CASE
          WHEN contract_updated_at IS NULL THEN ${decayCap}
          ELSE LEAST(${decayCap}, GREATEST(0, (contract_age_h - ${staleContractHours}) / ${staleContractHours}) * ${decayCap})
        END AS contract_decay,
        CASE
          WHEN metrics_updated_at IS NULL THEN ${decayCap}
          ELSE LEAST(${decayCap}, GREATEST(0, (metrics_age_h - ${staleMetricsHours}) / ${staleMetricsHours}) * ${decayCap})
        END AS metrics_decay
      FROM base
    )
    UPDATE agents a
    SET
      overall_rank = GREATEST(
        0,
        (s.overall_rank * s.source_trust) * (1 - GREATEST(s.contract_decay, s.metrics_decay))
      ),
      freshness_score = GREATEST(
        0,
        LEAST(
          100,
          ROUND(
            (s.freshness_score::numeric * (1 - GREATEST(s.contract_decay, s.metrics_decay)))
          )::int
        )
      ),
      updated_at = now()
    FROM scored s
    WHERE a.id = s.id
    RETURNING a.id
  `);

  const updated = (result as unknown as { rows?: Array<{ id: string }> }).rows?.length ?? 0;
  console.log(`[decay-execute-staleness] updated=${updated}`);
}

main().catch((err) => {
  console.error("[decay-execute-staleness] failed", err);
  process.exit(1);
});
