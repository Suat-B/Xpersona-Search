import { createSign } from "node:crypto";
import { Octokit } from "@octokit/rest";
import { throttling } from "@octokit/plugin-throttling";
import { retry } from "@octokit/plugin-retry";

const MyOctokit = Octokit.plugin(throttling, retry);

const DEFAULT_GITHUB_TIMEOUT_MS = 15_000;
const DEFAULT_GITHUB_MAX_RETRIES = 2;
const DEFAULT_GITHUB_MAX_RATE_LIMIT_RETRY_AFTER_S = 120;
const DEFAULT_GITHUB_MAX_BACKOFF_MS = 30_000;
const DEFAULT_GITHUB_MIN_SEARCH_INTERVAL_MS = 2_100; // ~30/min
const DEFAULT_GITHUB_MIN_CODE_SEARCH_INTERVAL_MS = 7_000; // ~8.5/min

const githubTimeoutEnv = Number(process.env.GITHUB_REQUEST_TIMEOUT_MS);
const githubMaxRetriesEnv = Number(process.env.GITHUB_MAX_RETRIES);
const githubMaxRateLimitRetryAfterEnv = Number(
  process.env.GITHUB_MAX_RATE_LIMIT_RETRY_AFTER_S
);
const githubMaxBackoffMsEnv = Number(process.env.GITHUB_MAX_BACKOFF_MS);
const githubMinSearchIntervalMsEnv = Number(
  process.env.GITHUB_MIN_SEARCH_INTERVAL_MS
);
const githubMinCodeSearchIntervalMsEnv = Number(
  process.env.GITHUB_MIN_CODE_SEARCH_INTERVAL_MS
);

const GITHUB_REQUEST_TIMEOUT_MS =
  Number.isFinite(githubTimeoutEnv) && githubTimeoutEnv > 0
    ? githubTimeoutEnv
    : DEFAULT_GITHUB_TIMEOUT_MS;
const GITHUB_MAX_RETRIES =
  Number.isFinite(githubMaxRetriesEnv) && githubMaxRetriesEnv >= 0
    ? githubMaxRetriesEnv
    : DEFAULT_GITHUB_MAX_RETRIES;
const GITHUB_MAX_RATE_LIMIT_RETRY_AFTER_S =
  Number.isFinite(githubMaxRateLimitRetryAfterEnv) &&
  githubMaxRateLimitRetryAfterEnv > 0
    ? githubMaxRateLimitRetryAfterEnv
    : DEFAULT_GITHUB_MAX_RATE_LIMIT_RETRY_AFTER_S;
const GITHUB_MAX_BACKOFF_MS =
  Number.isFinite(githubMaxBackoffMsEnv) && githubMaxBackoffMsEnv > 0
    ? githubMaxBackoffMsEnv
    : DEFAULT_GITHUB_MAX_BACKOFF_MS;
const GITHUB_MIN_SEARCH_INTERVAL_MS =
  Number.isFinite(githubMinSearchIntervalMsEnv) &&
  githubMinSearchIntervalMsEnv > 0
    ? githubMinSearchIntervalMsEnv
    : DEFAULT_GITHUB_MIN_SEARCH_INTERVAL_MS;
const GITHUB_MIN_CODE_SEARCH_INTERVAL_MS =
  Number.isFinite(githubMinCodeSearchIntervalMsEnv) &&
  githubMinCodeSearchIntervalMsEnv > 0
    ? githubMinCodeSearchIntervalMsEnv
    : DEFAULT_GITHUB_MIN_CODE_SEARCH_INTERVAL_MS;

type OctokitInstance = InstanceType<typeof MyOctokit>;
type GitHubErrorLike = Error & {
  status?: number;
  response?: {
    status?: number;
    headers?: Record<string, string | number | undefined>;
  };
};

interface AppTokenCache {
  token: string;
  expiresAtMs: number;
}

interface OctokitCache {
  authKey: string;
  client: OctokitInstance;
}

let appTokenCache: AppTokenCache | null = null;
let octokitCache: OctokitCache | null = null;

type EndpointType = "core" | "search" | "code_search";
const endpointLastRunAt: Record<EndpointType, number> = {
  core: 0,
  search: 0,
  code_search: 0,
};

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function encodeJwt(payload: Record<string, unknown>, privateKey: string): string {
  const header = { alg: "RS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(privateKey);
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

function parsePositiveEnv(name: string): number | null {
  const raw = process.env[name];
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function isGitHubAppConfigured(): boolean {
  return Boolean(
    parsePositiveEnv("GITHUB_APP_ID") &&
      parsePositiveEnv("GITHUB_APP_INSTALLATION_ID") &&
      process.env.GITHUB_APP_PRIVATE_KEY
  );
}

async function fetchGitHubAppInstallationToken(): Promise<AppTokenCache> {
  const appId = parsePositiveEnv("GITHUB_APP_ID");
  const installationId = parsePositiveEnv("GITHUB_APP_INSTALLATION_ID");
  const privateKeyRaw = process.env.GITHUB_APP_PRIVATE_KEY ?? "";
  if (!appId || !installationId || !privateKeyRaw) {
    throw new Error("Missing GitHub App env vars");
  }

  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
  const nowSec = Math.floor(Date.now() / 1000);
  const jwt = encodeJwt(
    {
      iat: nowSec - 60,
      exp: nowSec + 9 * 60,
      iss: appId,
    },
    privateKey
  );

  const res = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${jwt}`,
        "User-Agent": "xpersona-crawler",
      },
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Failed GitHub App installation token request: ${res.status} ${text.slice(
        0,
        240
      )}`
    );
  }

  const data = (await res.json()) as { token?: string; expires_at?: string };
  if (!data.token || !data.expires_at) {
    throw new Error("GitHub App token response missing token/expires_at");
  }
  const expiresAtMs = new Date(data.expires_at).getTime();
  return { token: data.token, expiresAtMs };
}

async function getGitHubAuthToken(): Promise<{ token: string | undefined; key: string }> {
  const pat = process.env.GITHUB_TOKEN?.trim();
  if (isGitHubAppConfigured()) {
    const now = Date.now();
    // Refresh 5 minutes before expiry.
    if (!appTokenCache || now >= appTokenCache.expiresAtMs - 5 * 60 * 1000) {
      appTokenCache = await fetchGitHubAppInstallationToken();
    }
    return { token: appTokenCache.token, key: `app:${appTokenCache.expiresAtMs}` };
  }
  return { token: pat || undefined, key: pat ? "pat" : "anon" };
}

async function getOctokitClient(): Promise<OctokitInstance> {
  const auth = await getGitHubAuthToken();
  if (octokitCache && octokitCache.authKey === auth.key) {
    return octokitCache.client;
  }

  const client = new MyOctokit({
    auth: auth.token,
    request: {
      timeout: GITHUB_REQUEST_TIMEOUT_MS,
    },
    throttle: {
      onRateLimit: (
        retryAfter: number,
        _options: unknown,
        _octokit: unknown,
        retryCount: number
      ) => {
        if (retryAfter > GITHUB_MAX_RATE_LIMIT_RETRY_AFTER_S) return false;
        return retryCount <= GITHUB_MAX_RETRIES;
      },
      onSecondaryRateLimit: (
        retryAfter: number,
        _options: unknown,
        _octokit: unknown,
        retryCount: number
      ) => {
        if (retryAfter > GITHUB_MAX_RATE_LIMIT_RETRY_AFTER_S) return false;
        return retryCount <= GITHUB_MAX_RETRIES;
      },
    },
  });
  octokitCache = { authKey: auth.key, client };
  return client;
}

function createDynamicProxy(path: string[] = []): unknown {
  const proxyTarget = () => undefined;
  return new Proxy(proxyTarget, {
    get(_target, prop) {
      if (prop === "then") return undefined;
      return createDynamicProxy([...path, String(prop)]);
    },
    async apply(_target, _thisArg, args: unknown[]) {
      const client = await getOctokitClient();
      let fn: unknown = client as unknown;
      for (const key of path) {
        if (typeof fn !== "object" && typeof fn !== "function") {
          throw new Error(`Invalid octokit path access: ${path.join(".")}`);
        }
        fn = (fn as Record<string, unknown>)[key];
      }
      if (typeof fn !== "function") {
        throw new Error(`Octokit member is not callable: ${path.join(".")}`);
      }
      return (fn as (...innerArgs: unknown[]) => unknown)(...args);
    },
  });
}

// Keep existing import shape while allowing dynamic auth token refresh.
export const octokit = {
  rest: createDynamicProxy(["rest"]),
} as unknown as OctokitInstance;

export interface GitHubRequestContext {
  requests: number;
  retries: number;
  rateLimitWaitMs: number;
  rateLimits: number;
  timeouts: number;
}

export function createGitHubRequestContext(): GitHubRequestContext {
  return {
    requests: 0,
    retries: 0,
    rateLimitWaitMs: 0,
    rateLimits: 0,
    timeouts: 0,
  };
}

export function getHeader(
  headers: Record<string, string | number | undefined> | undefined,
  key: string
): string | null {
  const raw =
    headers?.[key] ?? headers?.[key.toLowerCase()] ?? headers?.[key.toUpperCase()];
  if (typeof raw === "number") return String(raw);
  if (typeof raw === "string") return raw;
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function inferEndpointType(label: string): EndpointType {
  const normalized = label.toLowerCase();
  if (normalized.includes("search.code")) return "code_search";
  if (normalized.includes("search.")) return "search";
  return "core";
}

async function enforceEndpointPacing(endpointType: EndpointType): Promise<void> {
  const minInterval =
    endpointType === "code_search"
      ? GITHUB_MIN_CODE_SEARCH_INTERVAL_MS
      : endpointType === "search"
        ? GITHUB_MIN_SEARCH_INTERVAL_MS
        : 0;
  if (minInterval <= 0) return;

  const now = Date.now();
  const lastRun = endpointLastRunAt[endpointType];
  const waitMs = Math.max(0, minInterval - (now - lastRun));
  if (waitMs > 0) {
    await sleep(waitMs);
  }
  endpointLastRunAt[endpointType] = Date.now();
}

export function calculateRetryDelayMs(err: unknown, attempt: number): number {
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

  const expBackoff = Math.min(
    500 * 2 ** Math.max(0, attempt - 1),
    GITHUB_MAX_BACKOFF_MS
  );
  const jitter = Math.floor(Math.random() * 200);
  return expBackoff + jitter;
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
  if (status === 401 && isGitHubAppConfigured()) return true; // likely expired installation token
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
  timeoutMs: number = GITHUB_REQUEST_TIMEOUT_MS,
  context?: GitHubRequestContext
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(timeoutError(label, timeoutMs)), timeoutMs);
      }),
    ]);
  } catch (err) {
    if (context && err instanceof Error && err.name === "GitHubTimeoutError") {
      context.timeouts += 1;
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface GitHubRequestOptions {
  retries?: number;
  endpointType?: EndpointType;
  timeoutMs?: number;
  context?: GitHubRequestContext;
}

export async function githubRequest<T>(
  operation: () => Promise<T>,
  label: string,
  options?: GitHubRequestOptions
): Promise<T> {
  const retries = options?.retries ?? GITHUB_MAX_RETRIES;
  const endpointType = options?.endpointType ?? inferEndpointType(label);
  const timeoutMs = options?.timeoutMs ?? GITHUB_REQUEST_TIMEOUT_MS;
  const context = options?.context;

  let attempt = 0;
  while (true) {
    await enforceEndpointPacing(endpointType);
    try {
      context && (context.requests += 1);
      const result = await withGithubTimeout(operation, label, timeoutMs, context);
      return result;
    } catch (err) {
      if (isGitHubAppConfigured()) {
        const status =
          (err as GitHubErrorLike)?.status ?? (err as GitHubErrorLike)?.response?.status;
        if (status === 401) {
          // force refresh installation token
          appTokenCache = null;
          octokitCache = null;
        }
      }

      const canRetry = attempt < retries && isRetryableGitHubError(err);
      if (!canRetry) throw err;
      attempt += 1;
      context && (context.retries += 1);
      if (hasRateLimitSignal(err)) {
        context && (context.rateLimits += 1);
      }
      const delayMs = calculateRetryDelayMs(err, attempt);
      context && (context.rateLimitWaitMs += delayMs);
      await sleep(delayMs);
    }
  }
}

export async function withGithubRetry<T>(
  operation: () => Promise<T>,
  label: string,
  retries: number = GITHUB_MAX_RETRIES,
  context?: GitHubRequestContext
): Promise<T> {
  return githubRequest(operation, label, { retries, context });
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
  private?: boolean;
  visibility?: "public" | "private" | "internal" | null;
}

export async function fetchRepoDetails(
  fullName: string,
  context?: GitHubRequestContext
): Promise<GitHubRepo | null> {
  try {
    const [owner, repo] = fullName.split("/");
    const { data } = await withGithubRetry(
      async () => {
        const client = await getOctokitClient();
        return client.rest.repos.get({ owner, repo });
      },
      `repos.get ${fullName}`,
      GITHUB_MAX_RETRIES,
      context
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
      private: data.private ?? false,
      visibility:
        (data.visibility as GitHubRepo["visibility"]) ??
        (data.private ? "private" : "public"),
    };
  } catch (err) {
    console.error(`Failed to fetch repo ${fullName}:`, err);
    return null;
  }
}

export async function fetchFileContent(
  fullName: string,
  path: string,
  ref: string,
  context?: GitHubRequestContext
): Promise<string | null> {
  try {
    const [owner, repo] = fullName.split("/");
    const { data } = await withGithubRetry(
      async () => {
        const client = await getOctokitClient();
        return client.rest.repos.getContent({
          owner,
          repo,
          path,
          ref,
        });
      },
      `repos.getContent ${fullName}:${path}@${ref}`,
      GITHUB_MAX_RETRIES,
      context
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
  path: string,
  context?: GitHubRequestContext
): Promise<boolean> {
  try {
    const [owner, repo] = repoFullName.split("/");
    const { status } = await withGithubRetry(
      async () => {
        const client = await getOctokitClient();
        return client.rest.repos.getContent({
          owner,
          repo,
          path,
        });
      },
      `repos.getContent exists ${repoFullName}:${path}`,
      GITHUB_MAX_RETRIES,
      context
    );
    return status === 200;
  } catch {
    return false;
  }
}

export async function checkDirectoryExists(
  repoFullName: string,
  path: string,
  context?: GitHubRequestContext
): Promise<boolean> {
  try {
    const [owner, repo] = repoFullName.split("/");
    await withGithubRetry(
      async () => {
        const client = await getOctokitClient();
        return client.rest.repos.getContent({
          owner,
          repo,
          path,
        });
      },
      `repos.getContent dir ${repoFullName}:${path}`,
      GITHUB_MAX_RETRIES,
      context
    );
    return true;
  } catch {
    return false;
  }
}

export async function checkGlobExists(
  repoFullName: string,
  pattern: string,
  context?: GitHubRequestContext
): Promise<boolean> {
  const [owner, repo] = repoFullName.split("/");
  try {
    const { data } = await githubRequest(
      async () => {
        const client = await getOctokitClient();
        return client.rest.search.code({
          q: `repo:${owner}/${repo} path:${pattern}`,
        });
      },
      `search.code repo:${owner}/${repo} path:${pattern}`,
      { endpointType: "code_search", context }
    );
    return (data.total_count ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function searchRepos(
  params: {
    q: string;
    sort?: "stars" | "forks" | "updated";
    order?: "asc" | "desc";
    per_page?: number;
    page?: number;
  },
  context?: GitHubRequestContext
) {
  return githubRequest(
    async () => {
      const client = await getOctokitClient();
      return client.rest.search.repos(params);
    },
    `search.repos "${params.q}" page=${params.page ?? 1}`,
    { endpointType: "search", context }
  );
}

export async function searchCode(
  params: {
    q: string;
    sort?: "indexed";
    order?: "asc" | "desc";
    per_page?: number;
    page?: number;
  },
  context?: GitHubRequestContext
) {
  return githubRequest(
    async () => {
      const client = await getOctokitClient();
      return client.rest.search.code(params);
    },
    `search.code "${params.q}" page=${params.page ?? 1}`,
    { endpointType: "code_search", context }
  );
}
