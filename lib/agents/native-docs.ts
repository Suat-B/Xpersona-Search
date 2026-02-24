import {
  createGitHubRequestContext,
  fetchFileContent,
  fetchRepoDetails,
} from "@/lib/search/utils/github";

const MIN_README_CHARS = 50;
const MAX_README_CHARS = 50_000;
const DEFAULT_TIMEOUT_MS = 6_000;

type AgentSource = string | null | undefined;

export interface NativeDocsResult {
  readme?: string;
  description?: string;
  sourceLabel?: string;
}

export interface NativeDocsAgent {
  source?: AgentSource;
  sourceId?: string | null;
  url?: string | null;
  name?: string | null;
  npmData?: { packageName?: string | null } | null;
}

function clampReadme(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length > MAX_README_CHARS) return trimmed.slice(0, MAX_README_CHARS);
  return trimmed;
}

function looksLikeText(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  const htmlLike = /<html|<body|<div|<p|<script|<style/i.test(trimmed);
  return !htmlLike;
}

function parseGitHubRepoFromUrl(url?: string | null): string | null {
  if (!url) return null;
  const m = url.match(/github\.com[/:]([\w.-]+\/[\w.-]+)(?:\.git|\/|$)/i);
  if (!m) return null;
  return m[1];
}

function parsePackageFromSourceId(sourceId?: string | null, prefix?: string): string | null {
  if (!sourceId) return null;
  if (prefix && sourceId.toLowerCase().startsWith(`${prefix}:`)) {
    return sourceId.slice(prefix.length + 1);
  }
  return null;
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
  } finally {
    clearTimeout(timer);
  }
}

async function resolveGitHubDocs(agent: NativeDocsAgent): Promise<NativeDocsResult | null> {
  const repoFullName =
    parseGitHubRepoFromUrl(agent.url) ??
    parseGitHubRepoFromUrl(agent.sourceId ?? undefined);
  if (!repoFullName) return null;

  const ctx = createGitHubRequestContext();
  const repo = await fetchRepoDetails(repoFullName, ctx);
  const defaultBranch = repo?.default_branch ?? "main";
  const candidates = ["README.md", "README.MD", "Readme.md", "readme.md"];

  for (const path of candidates) {
    const content = await fetchFileContent(repoFullName, path, defaultBranch, ctx);
    if (!content) continue;
    const trimmed = clampReadme(content);
    if (trimmed.length < MIN_README_CHARS) continue;
    return {
      readme: trimmed,
      description: repo?.description ?? undefined,
      sourceLabel: "GitHub",
    };
  }

  return null;
}

async function resolveNpmDocs(agent: NativeDocsAgent): Promise<NativeDocsResult | null> {
  const pkg =
    agent.npmData?.packageName ??
    parsePackageFromSourceId(agent.sourceId ?? undefined, "npm") ??
    agent.name ??
    null;
  if (!pkg) return null;

  const res = await fetchWithTimeout(
    `https://registry.npmjs.org/${encodeURIComponent(pkg)}`,
    DEFAULT_TIMEOUT_MS
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { readme?: string; description?: string };
  const readmeRaw = data.readme ?? "";
  const readme = clampReadme(readmeRaw);
  if (readme.length >= MIN_README_CHARS) {
    return { readme, description: data.description, sourceLabel: "npm" };
  }
  if (data.description && data.description.trim().length >= MIN_README_CHARS) {
    return { readme: data.description.trim(), description: data.description, sourceLabel: "npm" };
  }
  return null;
}

async function resolvePypiDocs(agent: NativeDocsAgent): Promise<NativeDocsResult | null> {
  const pkg =
    parsePackageFromSourceId(agent.sourceId ?? undefined, "pypi") ??
    agent.name ??
    null;
  if (!pkg) return null;

  const res = await fetchWithTimeout(
    `https://pypi.org/pypi/${encodeURIComponent(pkg)}/json`,
    DEFAULT_TIMEOUT_MS
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { info?: { summary?: string; description?: string } };
  const summary = data.info?.summary?.trim();
  const description = data.info?.description?.trim();

  if (description && looksLikeText(description) && description.length >= MIN_README_CHARS) {
    return { readme: clampReadme(description), description: summary, sourceLabel: "PyPI" };
  }
  if (summary && summary.length >= MIN_README_CHARS) {
    return { readme: summary, description: summary, sourceLabel: "PyPI" };
  }
  return null;
}

export async function resolveNativeDocs(agent: NativeDocsAgent): Promise<NativeDocsResult | null> {
  const source = (agent.source ?? "").toUpperCase();

  if (source.includes("GITHUB")) return resolveGitHubDocs(agent);
  if (source === "NPM") return resolveNpmDocs(agent);
  if (source === "PYPI") return resolvePypiDocs(agent);

  // Fallback based on URL/sourceId if source is missing.
  if (agent.url?.includes("github.com")) return resolveGitHubDocs(agent);
  if (agent.sourceId?.toLowerCase().startsWith("npm:")) return resolveNpmDocs(agent);
  if (agent.sourceId?.toLowerCase().startsWith("pypi:")) return resolvePypiDocs(agent);

  return null;
}
