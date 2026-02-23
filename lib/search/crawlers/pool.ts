/**
 * Parallel crawler execution pool with rate-limit-aware bucketing.
 * Groups crawlers by their API domain so rate-limited sources (GitHub)
 * run sequentially within their bucket while independent buckets run in parallel.
 */

export interface CrawlTask {
  source: string;
  bucket: CrawlBucket;
  fn: () => Promise<{ total: number; jobId?: string }>;
}

export interface CrawlResult {
  source: string;
  total: number;
  jobId?: string;
  error?: string;
  durationMs: number;
}

export type CrawlBucket = "github" | "registry" | "package" | "platform";

const BUCKET_CONCURRENCY: Record<CrawlBucket, number> = {
  github: 1,
  registry: 3,
  package: 2,
  platform: 3,
};

async function runTask(task: CrawlTask): Promise<CrawlResult> {
  const start = Date.now();
  try {
    const r = await task.fn();
    return {
      source: task.source,
      total: r.total,
      jobId: r.jobId,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      source: task.source,
      total: 0,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}

async function runBucketSequential(
  tasks: CrawlTask[],
  onProgress?: (r: CrawlResult) => void
): Promise<CrawlResult[]> {
  const results: CrawlResult[] = [];
  for (const task of tasks) {
    const r = await runTask(task);
    results.push(r);
    onProgress?.(r);
  }
  return results;
}

async function runBucketConcurrent(
  tasks: CrawlTask[],
  concurrency: number,
  onProgress?: (r: CrawlResult) => void
): Promise<CrawlResult[]> {
  const results: CrawlResult[] = [];
  const executing = new Set<Promise<void>>();

  for (const task of tasks) {
    const p = runTask(task).then((r) => {
      results.push(r);
      onProgress?.(r);
    });
    executing.add(p);
    p.finally(() => executing.delete(p));

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}

export async function runCrawlPool(
  tasks: CrawlTask[],
  onProgress?: (result: CrawlResult) => void
): Promise<CrawlResult[]> {
  const buckets = new Map<CrawlBucket, CrawlTask[]>();
  for (const task of tasks) {
    const list = buckets.get(task.bucket) ?? [];
    list.push(task);
    buckets.set(task.bucket, list);
  }

  const bucketPromises: Promise<CrawlResult[]>[] = [];

  for (const [bucket, bucketTasks] of buckets) {
    const concurrency = BUCKET_CONCURRENCY[bucket];

    const promise =
      concurrency <= 1
        ? runBucketSequential(bucketTasks, onProgress)
        : runBucketConcurrent(bucketTasks, concurrency, onProgress);

    bucketPromises.push(promise);
  }

  const allResults = await Promise.allSettled(bucketPromises);
  const flat: CrawlResult[] = [];
  for (const r of allResults) {
    if (r.status === "fulfilled") flat.push(...r.value);
  }
  return flat;
}
