import type { GitHubRequestContext } from "../utils/github";
import { isRetryableGitHubError, searchRepos } from "../utils/github";

export interface PartitionedRepoSlice {
  queryIndex: number;
  from: string;
  to: string;
  page: number;
}

export interface PartitionedSearchCursor {
  emitted: number;
  queue: PartitionedRepoSlice[];
}

export interface PartitionedSearchRunOptions<TItem> {
  queries: string[];
  maxResults: number;
  pageSize?: number;
  saturationThreshold?: number;
  context?: GitHubRequestContext;
  initialCursor?: Record<string, unknown> | null;
  shouldContinue?: () => boolean;
  onItems: (
    items: TItem[],
    meta: { query: string; range: { from: string; to: string }; page: number }
  ) => Promise<number>;
  onCheckpoint?: (cursor: PartitionedSearchCursor) => Promise<void>;
}

const DEFAULT_LOOKBACK_DAYS = 3650;
const DEFAULT_SATURATION_THRESHOLD = 900;
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGES = 10;

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseDateOnly(value: string): Date | null {
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) ? d : null;
}

function canSplitRange(from: string, to: string): boolean {
  const fromDate = parseDateOnly(from);
  const toDate = parseDateOnly(to);
  if (!fromDate || !toDate) return false;
  const diffDays = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= 2;
}

function splitRange(from: string, to: string): [left: { from: string; to: string }, right: { from: string; to: string }] {
  const fromDate = parseDateOnly(from);
  const toDate = parseDateOnly(to);
  if (!fromDate || !toDate) {
    return [{ from, to }, { from, to }];
  }
  const midMs = Math.floor((fromDate.getTime() + toDate.getTime()) / 2);
  const mid = new Date(midMs);
  const midDate = toDateOnly(mid);
  const nextDay = new Date(mid.getTime() + 24 * 60 * 60 * 1000);
  const nextDayDate = toDateOnly(nextDay);
  return [
    { from, to: midDate },
    { from: nextDayDate, to },
  ];
}

function parseCursor(
  cursor: Record<string, unknown> | null | undefined,
  queryCount: number
): PartitionedSearchCursor | null {
  if (!cursor) return null;
  const queueRaw = cursor.queue;
  const emittedRaw = cursor.emitted;
  if (!Array.isArray(queueRaw)) return null;
  const queue: PartitionedRepoSlice[] = [];
  for (const entry of queueRaw) {
    if (!entry || typeof entry !== "object") continue;
    const v = entry as Record<string, unknown>;
    const queryIndex = Number(v.queryIndex);
    const page = Number(v.page);
    const from = String(v.from ?? "");
    const to = String(v.to ?? "");
    if (!Number.isInteger(queryIndex) || queryIndex < 0 || queryIndex >= queryCount) continue;
    if (!Number.isInteger(page) || page < 1 || page > MAX_PAGES) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) continue;
    queue.push({ queryIndex, page, from, to });
  }
  if (queue.length === 0) return null;
  const emitted = Number.isFinite(Number(emittedRaw)) ? Number(emittedRaw) : 0;
  return { emitted: Math.max(0, emitted), queue };
}

function initialQueue(queries: string[]): PartitionedRepoSlice[] {
  const lookbackDays = Number(process.env.CRAWL_GITHUB_LOOKBACK_DAYS ?? DEFAULT_LOOKBACK_DAYS);
  const now = new Date();
  const start = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  const from = toDateOnly(start);
  const to = toDateOnly(now);
  return queries.map((_, queryIndex) => ({
    queryIndex,
    from,
    to,
    page: 1,
  }));
}

export async function runPartitionedRepoSearch<TItem = {
  id?: number;
  full_name?: string;
  name?: string;
  description?: string | null;
}>(
  options: PartitionedSearchRunOptions<TItem>
): Promise<{ emitted: number; cursor: PartitionedSearchCursor | null }> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const saturationThreshold = options.saturationThreshold ?? DEFAULT_SATURATION_THRESHOLD;
  const restored = parseCursor(options.initialCursor, options.queries.length);
  const queue = restored?.queue ?? initialQueue(options.queries);
  let emitted = restored?.emitted ?? 0;

  while (queue.length > 0 && emitted < options.maxResults) {
    if (options.shouldContinue && !options.shouldContinue()) break;

    const slice = queue.shift();
    if (!slice) break;
    const query = options.queries[slice.queryIndex];
    if (!query) continue;

    const queryWithRange = `${query} pushed:${slice.from}..${slice.to}`;

    let data: { total_count?: number; items?: TItem[] };
    try {
      const res = await searchRepos(
        {
          q: queryWithRange,
          sort: "updated",
          order: "desc",
          per_page: pageSize,
          page: slice.page,
        },
        options.context
      );
      data = res.data as unknown as { total_count?: number; items?: TItem[] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = (err as { status?: number })?.status;
      const hitCap =
        msg.includes("Cannot access beyond the first 1000 results") || status === 422;
      if (!hitCap && isRetryableGitHubError(err)) {
        // transient page failure: retry this slice later
        queue.push(slice);
      }
      const cursor: PartitionedSearchCursor = { emitted, queue };
      await options.onCheckpoint?.(cursor);
      continue;
    }

    const totalCount = data.total_count ?? 0;
    if (
      slice.page === 1 &&
      totalCount > saturationThreshold &&
      canSplitRange(slice.from, slice.to)
    ) {
      const [left, right] = splitRange(slice.from, slice.to);
      queue.unshift(
        { queryIndex: slice.queryIndex, from: right.from, to: right.to, page: 1 },
        { queryIndex: slice.queryIndex, from: left.from, to: left.to, page: 1 }
      );
      await options.onCheckpoint?.({ emitted, queue });
      continue;
    }

    const items = data.items ?? [];
    if (items.length > 0) {
      const consumed = await options.onItems(items, {
        query,
        range: { from: slice.from, to: slice.to },
        page: slice.page,
      });
      emitted += Math.max(0, consumed);
    }

    if (items.length === pageSize && slice.page < MAX_PAGES && emitted < options.maxResults) {
      queue.unshift({ ...slice, page: slice.page + 1 });
    }

    await options.onCheckpoint?.({ emitted, queue });
  }

  const cursor = queue.length > 0 ? { emitted, queue } : null;
  return { emitted, cursor };
}
