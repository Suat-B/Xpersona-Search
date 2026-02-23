import dns from "dns/promises";
import type { VerificationMethod } from "./verification-methods";
import { getMaintainerEmail } from "./verification-methods";

const FETCH_TIMEOUT_MS = 10_000;

export interface VerifyResult {
  verified: boolean;
  error?: string;
}

interface AgentLike {
  url?: string;
  homepage?: string | null;
  source?: string | null;
  npmData?: Record<string, unknown> | null;
  githubData?: {
    stars?: number;
    forks?: number;
    lastCommit?: string;
    defaultBranch?: string;
  } | null;
}

function parseGitHubRepo(
  url: string
): { owner: string; repo: string } | null {
  const m = url.match(/github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?\/?$/);
  return m ? { owner: m[1], repo: m[2] } : null;
}

async function fetchWithTimeout(
  url: string,
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function verifyGithubFile(
  agent: AgentLike,
  token: string
): Promise<VerifyResult> {
  if (!agent.url) return { verified: false, error: "No repository URL" };
  const gh = parseGitHubRepo(agent.url);
  if (!gh) return { verified: false, error: "Cannot parse GitHub URL" };

  const branch = agent.githubData?.defaultBranch ?? "main";
  const rawUrl = `https://raw.githubusercontent.com/${gh.owner}/${gh.repo}/${branch}/.xpersona-verify`;

  try {
    const res = await fetchWithTimeout(rawUrl);
    if (!res.ok) {
      return {
        verified: false,
        error:
          res.status === 404
            ? "File .xpersona-verify not found in repository"
            : `GitHub returned ${res.status}`,
      };
    }
    const content = (await res.text()).trim();
    if (content === token) {
      return { verified: true };
    }
    return {
      verified: false,
      error: "Token in .xpersona-verify does not match",
    };
  } catch (err) {
    return {
      verified: false,
      error: err instanceof Error ? err.message : "Failed to fetch GitHub file",
    };
  }
}

async function verifyNpmKeyword(
  agent: AgentLike,
  token: string
): Promise<VerifyResult> {
  const npm = agent.npmData as Record<string, unknown> | null;
  const pkg = (npm?.packageName ?? npm?.name ?? "") as string;
  if (!pkg) return { verified: false, error: "No npm package name" };

  const expectedKeyword = `xpersona-verify-${token}`;
  try {
    const res = await fetchWithTimeout(
      `https://registry.npmjs.org/${encodeURIComponent(pkg)}/latest`
    );
    if (!res.ok) {
      return { verified: false, error: `npm registry returned ${res.status}` };
    }
    const data = (await res.json()) as Record<string, unknown>;
    const keywords = data.keywords;
    if (!Array.isArray(keywords)) {
      return { verified: false, error: "No keywords field in package.json" };
    }
    if (keywords.includes(expectedKeyword)) {
      return { verified: true };
    }
    return { verified: false, error: "Verification keyword not found in package keywords" };
  } catch (err) {
    return {
      verified: false,
      error: err instanceof Error ? err.message : "Failed to check npm registry",
    };
  }
}

async function verifyPypiKeyword(
  agent: AgentLike,
  token: string
): Promise<VerifyResult> {
  const sourceId = (agent as { sourceId?: string }).sourceId;
  const pkg =
    sourceId?.replace(/^pypi:/, "") ??
    (agent.npmData as Record<string, unknown>)?.name ??
    "";
  if (!pkg) return { verified: false, error: "No PyPI package name" };

  const expectedKeyword = `xpersona-verify-${token}`;
  try {
    const res = await fetchWithTimeout(
      `https://pypi.org/pypi/${encodeURIComponent(pkg as string)}/json`
    );
    if (!res.ok) {
      return { verified: false, error: `PyPI returned ${res.status}` };
    }
    const data = (await res.json()) as {
      info?: { keywords?: string; classifiers?: string[] };
    };
    const keywords = data.info?.keywords ?? "";
    const keywordList = keywords
      .split(/[,\s]+/)
      .map((k: string) => k.trim())
      .filter(Boolean);
    if (keywordList.includes(expectedKeyword)) {
      return { verified: true };
    }
    const classifiers = data.info?.classifiers ?? [];
    if (classifiers.some((c: string) => c.includes(expectedKeyword))) {
      return { verified: true };
    }
    return { verified: false, error: "Verification keyword not found on PyPI" };
  } catch (err) {
    return {
      verified: false,
      error: err instanceof Error ? err.message : "Failed to check PyPI",
    };
  }
}

async function verifyDnsTxt(
  agent: AgentLike,
  token: string
): Promise<VerifyResult> {
  if (!agent.homepage) return { verified: false, error: "No homepage URL" };

  let hostname: string;
  try {
    hostname = new URL(agent.homepage).hostname;
  } catch {
    return { verified: false, error: "Invalid homepage URL" };
  }

  const expected = `xpersona-verify=${token}`;
  try {
    const records = await dns.resolveTxt(hostname);
    for (const rr of records) {
      for (const value of rr) {
        const normalized = value.replace(/^"|"$/g, "").trim();
        if (normalized === expected) {
          return { verified: true };
        }
      }
    }
    return { verified: false, error: "DNS TXT record not found" };
  } catch {
    return { verified: false, error: "DNS resolution failed or no TXT records" };
  }
}

async function verifyMetaTag(
  agent: AgentLike,
  token: string
): Promise<VerifyResult> {
  if (!agent.homepage) return { verified: false, error: "No homepage URL" };

  try {
    const res = await fetchWithTimeout(agent.homepage);
    if (!res.ok) {
      return { verified: false, error: `Homepage returned ${res.status}` };
    }
    const html = await res.text();
    const pattern = new RegExp(
      `<meta\\s+name=["']xpersona-verify["']\\s+content=["']${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
      "i"
    );
    const patternReverse = new RegExp(
      `<meta\\s+content=["']${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']\\s+name=["']xpersona-verify["']`,
      "i"
    );
    if (pattern.test(html) || patternReverse.test(html)) {
      return { verified: true };
    }
    return { verified: false, error: "Meta tag not found on homepage" };
  } catch (err) {
    return {
      verified: false,
      error: err instanceof Error ? err.message : "Failed to fetch homepage",
    };
  }
}

async function verifyEmailMatch(
  agent: AgentLike,
  _token: string,
  userEmail?: string
): Promise<VerifyResult> {
  if (!userEmail) return { verified: false, error: "No user email" };

  const maintainerEmail = getMaintainerEmail(agent);
  if (!maintainerEmail) {
    return { verified: false, error: "No maintainer email on file for this package" };
  }

  if (userEmail.toLowerCase() === maintainerEmail.toLowerCase()) {
    return { verified: true };
  }

  return {
    verified: false,
    error: "Your account email does not match the package maintainer email",
  };
}

export async function runVerifier(
  method: VerificationMethod,
  agent: AgentLike,
  token: string,
  userEmail?: string
): Promise<VerifyResult> {
  switch (method) {
    case "GITHUB_FILE":
      return verifyGithubFile(agent, token);
    case "NPM_KEYWORD":
      return verifyNpmKeyword(agent, token);
    case "PYPI_KEYWORD":
      return verifyPypiKeyword(agent, token);
    case "DNS_TXT":
      return verifyDnsTxt(agent, token);
    case "META_TAG":
      return verifyMetaTag(agent, token);
    case "EMAIL_MATCH":
      return verifyEmailMatch(agent, token, userEmail);
    case "MANUAL_REVIEW":
      return { verified: false, error: "Manual review claims are processed by admins" };
    default:
      return { verified: false, error: `Unknown method: ${method}` };
  }
}
