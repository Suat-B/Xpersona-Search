import { Octokit } from "@octokit/rest";
import { throttling } from "@octokit/plugin-throttling";
import { retry } from "@octokit/plugin-retry";

const MyOctokit = Octokit.plugin(throttling, retry);

export const octokit = new MyOctokit({
  auth: process.env.GITHUB_TOKEN,
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
    const { data } = await octokit.rest.repos.get({ owner, repo });
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
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });
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
    const { status } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
    });
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
    await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
    });
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
    const { data } = await octokit.rest.search.code({
      q: `repo:${owner}/${repo} path:${pattern}`,
    });
    return (data.total_count ?? 0) > 0;
  } catch {
    return false;
  }
}
