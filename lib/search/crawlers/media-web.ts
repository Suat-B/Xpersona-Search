import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { desc, ilike } from "drizzle-orm";
import {
  checkpointJob,
  completeJob,
  failJob,
  getCheckpoint,
  heartbeatJob,
  startJob,
} from "./job-lifecycle";
import {
  ackMediaWebUrl,
  leaseMediaWebUrls,
  retryMediaWebUrl,
} from "./media-web-frontier";
import { discoverMediaAssets, fetchHomepageContent } from "./media-discovery";
import { computeMediaRankScore, upsertMediaAssetsBulk } from "../agent-upsert";

const SOURCE = "MEDIA_WEB";

async function findAgentIdForUrl(url: string): Promise<string | null> {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const rows = await db
      .select({ id: agents.id })
      .from(agents)
      .where(ilike(agents.homepage, `%${host}%`))
      .orderBy(desc(agents.overallRank))
      .limit(1);
    return rows[0]?.id ?? null;
  } catch {
    return null;
  }
}

export async function crawlMediaWebFrontier(
  maxItems = 500,
  workerId = `media-web:${process.pid}`
): Promise<{ total: number; jobId: string }> {
  const { jobId } = await startJob({
    source: SOURCE,
    mode: "backfill",
    workerId,
  });
  let processed = 0;
  let skipped = 0;
  try {
    const checkpoint = (await getCheckpoint(SOURCE, "backfill")) ?? { offset: 0 };
    await checkpointJob({
      jobId,
      source: SOURCE,
      mode: "backfill",
      cursor: checkpoint,
      workerId,
      leaseMs: 15 * 60 * 1000,
    });

    const leased = await leaseMediaWebUrls({ lockOwner: workerId, limit: maxItems });
    for (const item of leased) {
      try {
        const agentId = await findAgentIdForUrl(item.url);
        if (!agentId) {
          skipped += 1;
          await ackMediaWebUrl(item.id);
          continue;
        }
        const html = await fetchHomepageContent(item.url);
        if (!html) {
          skipped += 1;
          await retryMediaWebUrl(item.id, "Failed to fetch HTML", 60_000);
          continue;
        }
        const assets = await discoverMediaAssets({
          sourcePageUrl: item.url,
          markdownOrHtml: html,
          isHtml: true,
          discoveryMethod: "WEB_CRAWL",
        });
        await upsertMediaAssetsBulk(
          assets.map((asset) => ({
            agentId,
            source: "WEB_CRAWL",
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
          }))
        );
        processed += assets.length;
        await ackMediaWebUrl(item.id);
      } catch (err) {
        skipped += 1;
        await retryMediaWebUrl(
          item.id,
          err instanceof Error ? err.message : "unknown error",
          120_000
        );
      }
      if ((processed + skipped) % 25 === 0) {
        await heartbeatJob(jobId, { agentsFound: processed, skipped });
      }
    }

    await completeJob(jobId, {
      agentsFound: processed,
      skipped,
      finishedReason: "completed_media_web",
    });
    return { total: processed, jobId };
  } catch (err) {
    await failJob(jobId, err, { agentsFound: processed, skipped, finishedReason: "failed_media_web" });
    throw err;
  }
}
