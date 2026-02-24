import { Octokit } from "@octokit/rest";
import { throttling } from "@octokit/plugin-throttling";
import { retry } from "@octokit/plugin-retry";

const MyOctokit = Octokit.plugin(throttling, retry);
const DEFAULT_GITHUB_TIMEOUT_MS = 15_000;
const githubTimeoutEnv = Number(process.env.GITHUB_REQUEST_TIMEOUT_MS);
const GITHUB_REQUEST_TIMEOUT_MS =
  Number.isFinite(githubTimeoutEnv) && githubTimeoutEnv > 0
    ? githubTimeoutEnv
    : DEFAULT_GITHUB_TIMEOUT_MS;

export const octokit = new MyOctokit({
  auth: process.env.GITHUB_TOKEN,
  request: {
    timeout: GITHUB_REQUEST_TIMEOUT_MS,
  },
  throttle: {
    onRateLimit: (retryAfter: number) => {
      console.warn(`GitHub rate limit hit, retrying after ${retryAfter}s`);
      return true;
    },
    onSecondaryRateLimit: (retryAfter: number) => {
      console.warn(`GitHub secondary rate limit, retrying after ${retryAfter}s`);
      return true;
    },
  },
});

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

export function isRetryableGitHubError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("timeout") ||
    msg.includes("etimedout") ||
    msg.includes("econnreset") ||
    msg.includes("socket hang up") ||
    msg.includes("secondary rate limit") ||
    msg.includes("bad gateway") ||
    msg.includes("service unavailable") ||
    msg.includes("gateway timeout") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504")
  );
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
    const { data } = await withGithubTimeout(
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
    const { data } = await withGithubTimeout(
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
    const { status } = await withGithubTimeout(
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
    await withGithubTimeout(
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
    const { data } = await withGithubTimeout(
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
