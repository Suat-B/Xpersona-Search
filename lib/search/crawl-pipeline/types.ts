export type CrawlTaskType = "seed" | "fetch" | "extract" | "index";
export type CrawlTaskStatus = "PENDING" | "LEASED" | "DONE" | "FAILED";

export interface CrawlTaskPayload extends Record<string, unknown> {
  url?: string;
  source?: string;
  sourceId?: string;
  parentUrl?: string;
  statusCode?: number;
  fetchedAt?: string;
  contentType?: string | null;
  title?: string | null;
  html?: string | null;
  plainText?: string | null;
  links?: string[];
  docs?: unknown[];
  reason?: string;
}

export interface QueuedTask {
  id: string;
  taskType: CrawlTaskType;
  taskKey: string;
  payload: CrawlTaskPayload;
  attempts: number;
  maxAttempts: number;
  priority: number;
}

export interface TaskEnqueueInput {
  taskType: CrawlTaskType;
  taskKey: string;
  payload: CrawlTaskPayload;
  priority?: number;
  nextAttemptAt?: Date;
}
