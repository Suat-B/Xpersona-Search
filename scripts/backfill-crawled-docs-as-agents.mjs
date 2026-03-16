#!/usr/bin/env node
import { Client } from "pg";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const beforeSynthetic = Number(
      (await client.query("SELECT COUNT(*)::int AS c FROM agents WHERE source_id LIKE 'CRAWLED_DOC:%'"))
        .rows[0]?.c ?? 0
    );

    const upsert = await client.query(`
      INSERT INTO agents (
        source_id,
        source,
        visibility,
        public_searchable,
        name,
        slug,
        description,
        url,
        homepage,
        capabilities,
        protocols,
        languages,
        safety_score,
        popularity_score,
        freshness_score,
        performance_score,
        overall_rank,
        status,
        readme,
        last_crawled_at,
        last_indexed_at,
        updated_at
      )
      SELECT
        'CRAWLED_DOC:' || sd.url_norm_hash || ':' || left(sd.content_hash, 16) AS source_id,
        left(upper(coalesce(sd.source, 'WEB_CRAWL')), 32) AS source,
        'PUBLIC' AS visibility,
        sd.is_public AS public_searchable,
        left(
          trim(
            coalesce(
              nullif(sd.title, ''),
              'Crawled ' || coalesce(sd.domain, 'document') || ' ' || left(sd.content_hash, 8)
            )
          ),
          255
        ) AS name,
        'crawl-' || left(sd.url_norm_hash, 20) || '-' || left(sd.content_hash, 20) AS slug,
        left(
          trim(
            coalesce(
              nullif(sd.snippet, ''),
              nullif(sd.body_text, ''),
              nullif(sd.title, ''),
              'Crawled document'
            )
          ),
          1500
        ) AS description,
        left(sd.canonical_url, 1024) AS url,
        left(sd.canonical_url, 1024) AS homepage,
        '[]'::jsonb AS capabilities,
        '[]'::jsonb AS protocols,
        '[]'::jsonb AS languages,
        sd.safety_score,
        sd.quality_score,
        sd.freshness_score,
        sd.confidence_score,
        round(
          (
            sd.quality_score * 0.35 +
            sd.safety_score * 0.20 +
            sd.freshness_score * 0.20 +
            sd.confidence_score * 0.25
          )::numeric,
          2
        ) AS overall_rank,
        'ACTIVE' AS status,
        left(sd.body_text, 24000) AS readme,
        sd.indexed_at AS last_crawled_at,
        sd.indexed_at AS last_indexed_at,
        now() AS updated_at
      FROM search_documents sd
      WHERE sd.is_public = true
      ON CONFLICT (source_id) DO UPDATE
      SET
        source = EXCLUDED.source,
        visibility = EXCLUDED.visibility,
        public_searchable = EXCLUDED.public_searchable,
        name = EXCLUDED.name,
        slug = EXCLUDED.slug,
        description = EXCLUDED.description,
        url = EXCLUDED.url,
        homepage = EXCLUDED.homepage,
        capabilities = EXCLUDED.capabilities,
        protocols = EXCLUDED.protocols,
        languages = EXCLUDED.languages,
        safety_score = EXCLUDED.safety_score,
        popularity_score = EXCLUDED.popularity_score,
        freshness_score = EXCLUDED.freshness_score,
        performance_score = EXCLUDED.performance_score,
        overall_rank = EXCLUDED.overall_rank,
        status = EXCLUDED.status,
        readme = EXCLUDED.readme,
        last_crawled_at = EXCLUDED.last_crawled_at,
        last_indexed_at = EXCLUDED.last_indexed_at,
        updated_at = now()
    `);

    const afterSynthetic = Number(
      (await client.query("SELECT COUNT(*)::int AS c FROM agents WHERE source_id LIKE 'CRAWLED_DOC:%'"))
        .rows[0]?.c ?? 0
    );
    const afterActivePublic = Number(
      (
        await client.query(
          "SELECT COUNT(*)::int AS c FROM agents WHERE status = 'ACTIVE' AND public_searchable = true"
        )
      ).rows[0]?.c ?? 0
    );

    console.log(
      JSON.stringify(
        {
          upsertedRows: upsert.rowCount ?? 0,
          syntheticBefore: beforeSynthetic,
          syntheticAfter: afterSynthetic,
          syntheticDelta: afterSynthetic - beforeSynthetic,
          activePublicAgentsAfter: afterActivePublic,
        },
        null,
        2
      )
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[backfill-crawled-docs-as-agents] failed", err);
  process.exit(1);
});
