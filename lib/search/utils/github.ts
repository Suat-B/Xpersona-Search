import { Octokit } from "@octokit/rest";
import { throttling } from "@octokit/plugin-throttling";
import { retry } from "@octokit/plugin-retry";

const MyOctokit = Octokit.plugin(throttling, retry);
const DEFAULT_GITHUB_TIMEOUT_MS = 15_000;
const DEFAULT_GITHUB_MAX_RETRIES = 2;
const DEFAULT_GITHUB_MAX_RATE_LIMIT_RETRY_AFTER_S = 30;
const DEFAULT_GITHUB_MAX_BACKOFF_MS = 5_000;
const githubTimeoutEnv = Number(process.env.GITHUB_REQUEST_TIMEOUT_MS);
const githubMaxRetriesEnv = Number(process.env.GITHUB_MAX_RETRIES);
const githubMaxRateLimitRetryAfterEnv = Number(process.env.GITHUB_MAX_RATE_LIMIT_RETRY_AFTER_S);
const githubMaxBackoffMsEnv = Number(process.env.GITHUB_MAX_BACKOFF_MS);
const GITHUB_REQUEST_TIMEOUT_MS =
  Number.isFinite(githubTimeoutEnv) && githubTimeoutEnv > 0
    ? githubTimeoutEnv
    : DEFAULT_GITHUB_TIMEOUT_MS;
const GITHUB_MAX_RETRIES =
  Number.isFinite(githubMaxRetriesEnv) && githubMaxRetriesEnv >= 0
    ? githubMaxRetriesEnv
    : DEFAULT_GITHUB_MAX_RETRIES;
const GITHUB_MAX_RATE_LIMIT_RETRY_AFTER_S =
  Number.isFinite(githubMaxRateLimitRetryAfterEnv) && githubMaxRateLimitRetryAfterEnv > 0
    ? githubMaxRateLimitRetryAfterEnv
    : DEFAULT_GITHUB_MAX_RATE_LIMIT_RETRY_AFTER_S;
const GITHUB_MAX_BACKOFF_MS =
  Number.isFinite(githubMaxBackoffMsEnv) && githubMaxBackoffMsEnv > 0
    ? githubMaxBackoffMsEnv
    : DEFAULT_GITHUB_MAX_BACKOFF_MS;

export const octokit = new MyOctokit({
  auth: process.env.GITHUB_TOKEN,
  request: {
    timeout: GITHUB_REQUEST_TIMEOUT_MS,
  },
  throttle: {
    onRateLimit: (retryAfter: number, _options: unknown, _octokit: unknown, retryCount: number) => {
      console.warn(`GitHub rate limit hit, retrying after ${retryAfter}s`);
      if (retryAfter > GITHUB_MAX_RATE_LIMIT_RETRY_AFTER_S) return false;
      return retryCount <= GITHUB_MAX_RETRIES;
    },
    onSecondaryRateLimit: (retryAfter: number, _options: unknown, _octokit: unknown, retryCount: number) => {
      console.warn(`GitHub secondary rate limit, retrying after ${retryAfter}s`);
      if (retryAfter > GITHUB_MAX_RATE_LIMIT_RETRY_AFTER_S) return false;
      return retryCount <= GITHUB_MAX_RETRIES;
    },
  },
});

type GitHubErrorLike = Error & {
  status?: number;
  response?: {
    status?: number;
    headers?: Record<string, string | number | undefined>;
  };
};

function getHeader(
  headers: Record<string, string | number | undefined> | undefined,
  key: string
): string | null {
  const raw = headers?.[key] ?? headers?.[key.toLowerCase()] ?? headers?.[key.toUpperCase()];
  if (typeof raw === "number") return String(raw);
  if (typeof raw === "string") return raw;
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calculateRetryDelayMs(err: unknown, attempt: number): number {
  const e = err as GitHubErrorLike;
  const headers = e?.response?.headers;
  const retryAfter = Number(getHeader(headers, "retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, GITHUB_MAX_BACKOFF_MS);
  }

  const resetAt = Number(getHeader(headers, "x-ratelimit-reset"));
  if (Number.isFinite(resetAt) && resetAt > 0) {
    const resetDelay = Math.max(0, resetAt * 1000 - Date.now());
    if (resetDelay > 0) return Math.min(resetDelay, GITHUB_MAX_BACKOFF_MS);
  }

  const expBackoff = Math.min(500 * 2 ** Math.max(0, attempt - 1), GITHUB_MAX_BACKOFF_MS);
  const jitter = Math.floor(Math.random() * 200);
  return expBackoff + jitter;
}

export async function withGithubRetry<T>(
  operation: () => Promise<T>,
  label: string,
  retries: number = GITHUB_MAX_RETRIES
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await withGithubTimeout(operation, label);
    } catch (err) {
      const canRetry = attempt < retries && isRetryableGitHubError(err);
      if (!canRetry) throw err;
      attempt++;
      const delayMs = calculateRetryDelayMs(err, attempt);
      await sleep(delayMs);
    }
  }
}

function isRateLimitMessage(msg: string): boolean {
  return (
    msg.includes("rate limit") ||
    msg.includes("secondary rate limit") ||
    msg.includes("too many requests")
  );
}

function hasRateLimitSignal(err: unknown): boolean {
  const e = err as GitHubErrorLike;
  const remaining = getHeader(e?.response?.headers, "x-ratelimit-remaining");
  const retryAfter = getHeader(e?.response?.headers, "retry-after");
  return remaining === "0" || !!retryAfter;
}

function isStatusRetryable(status: number | undefined, err: unknown): boolean {
  if (!status) return false;
  if ([502, 503, 504].includes(status)) return true;
  if (status === 429) return true;
  if (status === 403) {
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
    return isRateLimitMessage(msg) || hasRateLimitSignal(err);
  }
  return false;
}

export function isRetryableGitHubError(err: unknown): boolean {
  const e = err as GitHubErrorLike;
  const status = e?.status ?? e?.response?.status;
  if (isStatusRetryable(status, err)) return true;

  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("timeout") ||
    msg.includes("etimedout") ||
    msg.includes("econnreset") ||
    msg.includes("socket hang up") ||
    msg.includes("secondary rate limit") ||
    msg.includes("rate limit") ||
    msg.includes("too many requests") ||
    msg.includes("bad gateway") ||
    msg.includes("service unavailable") ||
    msg.includes("gateway timeout") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504") ||
    msg.includes("429")
  );
}

function timeoutError(label: string, timeoutMs: number): Error {
  const err = new Error(`GitHub timeout (${label}) after ${timeoutMs}ms`);
  err.name = "GitHubTimeoutError";
  return err;
}

export async function withGithubTimeout<T>(
  operation: () => Promise<T>,
  label: string,
  timeoutMs: number = GITHUB_REQUEST_TIMEOUT_MS
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(timeoutError(label, timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface GitHubRepo {
  id: number;
  full_name: string;
  name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  updated_at: string;
  pushed_at: string;
  default_branch: string;
  fork: boolean;
}

export async function fetchRepoDetails(
  fullName: string
): Promise<GitHubRepo | null> {
  try {
    const [owner, repo] = fullName.split("/");
    const { data } = await withGithubRetry(
      () => octokit.rest.repos.get({ owner, repo }),
      `repos.get ${fullName}`
    );
    return {
      id: data.id,
      full_name: data.full_name ?? data.name ?? "",
      name: data.name ?? "",
      description: data.description ?? null,
      html_url: data.html_url ?? "",
      stargazers_count: data.stargazers_count ?? 0,
      forks_count: data.forks_count ?? 0,
      updated_at: data.updated_at ?? "",
      pushed_at: data.pushed_at ?? data.updated_at ?? "",
      default_branch: data.default_branch ?? "main",
      fork: data.fork ?? false,
    };
  } catch (err) {
    console.error(`Failed to fetch repo ${fullName}:`, err);
    return null;
  }
}

export async function fetchFileContent(
  fullName: string,
  path: string,
  ref: string
): Promise<string | null> {
  try {
    const [owner, repo] = fullName.split("/");
    const { data } = await withGithubRetry(
      () =>
        octokit.rest.repos.getContent({
          owner,
          repo,
          path,
          ref,
        }),
      `repos.getContent ${fullName}:${path}@${ref}`
    );
    if ("content" in data && typeof data.content === "string") {
      return Buffer.from(data.content, "base64").toString("utf-8");
    }
    return null;
  } catch {
    return null;
  }
}

export async function checkFileExists(
  repoFullName: string,
  path: string
): Promise<boolean> {
  try {
    const [owner, repo] = repoFullName.split("/");
    const { status } = await withGithubRetry(
      () =>
        octokit.rest.repos.getContent({
          owner,
          repo,
          path,
        }),
      `repos.getContent exists ${repoFullName}:${path}`
    );
    return status === 200;
  } catch {
    return false;
  }
}

export async function checkDirectoryExists(
  repoFullName: string,
  path: string
): Promise<boolean> {
  try {
    const [owner, repo] = repoFullName.split("/");
    await withGithubRetry(
      () =>
        octokit.rest.repos.getContent({
          owner,
          repo,
          path,
        }),
      `repos.getContent dir ${repoFullName}:${path}`
    );
    return true;
  } catch {
    return false;
  }
}

export async function checkGlobExists(
  repoFullName: string,
  pattern: string
): Promise<boolean> {
  const [owner, repo] = repoFullName.split("/");
  try {
    const { data } = await withGithubRetry(
      () =>
        octokit.rest.search.code({
          q: `repo:${owner}/${repo} path:${pattern}`,
        }),
      `search.code repo:${owner}/${repo} path:${pattern}`
    );
    return (data.total_count ?? 0) > 0;
  } catch {
    return false;
  }
}
