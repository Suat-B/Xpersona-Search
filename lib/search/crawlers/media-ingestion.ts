import {
  computeMediaRankScore,
  getAgentBySourceId,
  upsertMediaAssetsBulk,
} from "../agent-upsert";
import {
  discoverMediaAssets,
  extractOutboundWebLinks,
  fetchHomepageContent,
} from "./media-discovery";
import { enqueueMediaWebUrls } from "./media-web-frontier";

export interface IngestAgentMediaParams {
  agentSourceId: string;
  agentUrl: string;
  homepageUrl?: string | null;
  source: string;
  readmeOrHtml?: string | null;
  isHtml?: boolean;
  allowHomepageFetch?: boolean;
}

export interface IngestAgentMediaMetrics {
  discovered: number;
  upserted: number;
  skipped: number;
  errors: number;
  frontierQueued: number;
}

function parseSourceAllowlist(): Set<string> | null {
  const raw = process.env.SEARCH_MEDIA_SOURCES?.trim();
  if (!raw) return null;
  const values = raw
    .split(",")
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean);
  return values.length > 0 ? new Set(values) : null;
}

function isMediaEnabledForSource(source: string): boolean {
  if (process.env.SEARCH_MEDIA_VERTICAL_ENABLED !== "1") return false;
  const allowlist = parseSourceAllowlist();
  if (!allowlist) return true;
  return allowlist.has(source.toUpperCase());
}

function getMinQualityScore(): number {
  const parsed = Number(process.env.SEARCH_MEDIA_MIN_QUALITY_SCORE ?? "0");
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.floor(parsed)));
}

export async function ingestAgentMedia(
  params: IngestAgentMediaParams
): Promise<IngestAgentMediaMetrics> {
  const metrics: IngestAgentMediaMetrics = {
    discovered: 0,
    upserted: 0,
    skipped: 0,
    errors: 0,
    frontierQueued: 0,
  };
  if (!isMediaEnabledForSource(params.source)) return metrics;

  try {
    const agent = await getAgentBySourceId(params.agentSourceId);
    if (!agent) {
      metrics.skipped += 1;
      return metrics;
    }

    const minQuality = getMinQualityScore();

    const upsertAssets = async (
      sourcePageUrl: string,
      content: string,
      isHtml: boolean,
      sourceLabel: string,
      discoveryMethod:
        | "README"
        | "HOMEPAGE"
        | "OG_IMAGE"
        | "HTML_IMG"
        | "ARTIFACT_LINK"
        | "WEB_CRAWL"
    ) => {
      const discovered = await discoverMediaAssets({
        sourcePageUrl,
        markdownOrHtml: content,
        isHtml,
        discoveryMethod,
      });
      metrics.discovered += discovered.length;
      const batch = discovered
        .filter((asset) => {
          const ok = asset.qualityScore >= minQuality;
          if (!ok) metrics.skipped += 1;
          return ok;
        })
        .map((asset) => ({
            agentId: agent.id,
            source: sourceLabel,
            assetKind: asset.assetKind,
            artifactType: asset.artifactType,
            url: asset.url,
            sourcePageUrl: asset.sourcePageUrl,
            sha256: asset.sha256,
            mimeType: asset.mimeType,
            byteSize: asset.byteSize,
            title: asset.title,
            caption: asset.caption,
            altText: asset.altText,
            contextText: asset.contextText,
            crawlDomain: asset.crawlDomain,
            discoveryMethod: asset.discoveryMethod,
            urlNormHash: asset.urlNormHash,
            isPublic: asset.isPublic,
            qualityScore: asset.qualityScore,
            safetyScore: asset.safetyScore,
            rankScore: computeMediaRankScore({
              qualityScore: asset.qualityScore,
              safetyScore: asset.safetyScore,
              assetKind: asset.assetKind,
              artifactType: asset.artifactType,
            }),
          }));
      try {
        await upsertMediaAssetsBulk(batch);
        metrics.upserted += batch.length;
      } catch {
        metrics.errors += batch.length;
      }

      if (process.env.SEARCH_MEDIA_WEB_ENABLED === "1") {
        const outbound = extractOutboundWebLinks(content, sourcePageUrl);
        const queued = await enqueueMediaWebUrls({
          urls: outbound,
          source: sourceLabel,
          discoveredFrom: sourcePageUrl,
          priority: sourceLabel === "HOMEPAGE" ? 0 : -1,
        });
        metrics.frontierQueued += queued;
      }
    };

    if (params.readmeOrHtml && params.readmeOrHtml.trim()) {
      await upsertAssets(
        params.agentUrl,
        params.readmeOrHtml,
        Boolean(params.isHtml),
        params.source,
        params.isHtml ? "WEB_CRAWL" : "README"
      );
    }

    if (params.allowHomepageFetch && params.homepageUrl) {
      const homepage = await fetchHomepageContent(params.homepageUrl);
      if (homepage) {
        await upsertAssets(params.homepageUrl, homepage, true, "HOMEPAGE", "HOMEPAGE");
      } else {
        metrics.skipped += 1;
      }
    }
  } catch {
    metrics.errors += 1;
  }

  if (metrics.discovered > 0 || metrics.errors > 0) {
    console.info("[media-ingestion]", {
      source: params.source,
      agentSourceId: params.agentSourceId,
      discovered: metrics.discovered,
      upserted: metrics.upserted,
      skipped: metrics.skipped,
      errors: metrics.errors,
    });
  }

  return metrics;
}
