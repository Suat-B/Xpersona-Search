/**
 * Link extractor — mines outbound URLs from agent metadata for recursive discovery.
 * Extracts links from README content, package.json dependencies, agent card fields,
 * and repository metadata to feed the URL frontier.
 */

export interface ExtractedLink {
  url: string;
  type: "github" | "npm" | "pypi" | "huggingface" | "web";
  priority: number;
  context: string;
}

const GITHUB_REPO_RE = /https?:\/\/github\.com\/([a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+)/g;
const NPM_PACKAGE_RE = /https?:\/\/(?:www\.)?npmjs\.com\/package\/(@?[a-zA-Z0-9._\/-]+)/g;
const PYPI_PACKAGE_RE = /https?:\/\/pypi\.org\/project\/([a-zA-Z0-9._-]+)/g;
const HF_SPACE_RE = /https?:\/\/huggingface\.co\/spaces\/([a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+)/g;
const MARKDOWN_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;

const BLOCK_DOMAINS = new Set([
  "shields.io", "img.shields.io", "badge.fury.io",
  "travis-ci.org", "circleci.com", "codecov.io",
  "coveralls.io", "david-dm.org", "gitter.im",
  "twitter.com", "x.com", "facebook.com",
  "linkedin.com", "youtube.com", "medium.com",
  "stackoverflow.com", "reddit.com",
]);

function isBlockedUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return BLOCK_DOMAINS.has(host) || host.endsWith(".badge.io");
  } catch {
    return true;
  }
}

function classifyUrl(url: string): ExtractedLink["type"] {
  if (url.includes("github.com")) return "github";
  if (url.includes("npmjs.com")) return "npm";
  if (url.includes("pypi.org")) return "pypi";
  if (url.includes("huggingface.co")) return "huggingface";
  return "web";
}

function priorityForType(type: ExtractedLink["type"]): number {
  switch (type) {
    case "github": return 10;
    case "npm": return 8;
    case "pypi": return 8;
    case "huggingface": return 6;
    case "web": return 2;
  }
}

export function extractLinksFromReadme(content: string): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  const seen = new Set<string>();

  const addUrl = (url: string, context: string, bonusPriority = 0) => {
    const normalized = url.replace(/\/$/, "").replace(/\.git$/, "");
    if (seen.has(normalized)) return;
    if (isBlockedUrl(normalized)) return;
    seen.add(normalized);

    const type = classifyUrl(normalized);
    links.push({
      url: normalized,
      type,
      priority: priorityForType(type) + bonusPriority,
      context,
    });
  };

  let m;
  const ghRe = new RegExp(GITHUB_REPO_RE.source, "g");
  while ((m = ghRe.exec(content)) !== null) {
    addUrl(`https://github.com/${m[1]}`, "readme-github-link", 2);
  }

  const npmRe = new RegExp(NPM_PACKAGE_RE.source, "g");
  while ((m = npmRe.exec(content)) !== null) {
    addUrl(`https://www.npmjs.com/package/${m[1]}`, "readme-npm-link", 1);
  }

  const pypiRe = new RegExp(PYPI_PACKAGE_RE.source, "g");
  while ((m = pypiRe.exec(content)) !== null) {
    addUrl(`https://pypi.org/project/${m[1]}`, "readme-pypi-link", 1);
  }

  const hfRe = new RegExp(HF_SPACE_RE.source, "g");
  while ((m = hfRe.exec(content)) !== null) {
    addUrl(`https://huggingface.co/spaces/${m[1]}`, "readme-hf-link");
  }

  const mdRe = new RegExp(MARKDOWN_LINK_RE.source, "g");
  while ((m = mdRe.exec(content)) !== null) {
    addUrl(m[2], "readme-markdown-link");
  }

  return links;
}

export function extractLinksFromDependencies(
  dependencies: Record<string, string>
): ExtractedLink[] {
  const links: ExtractedLink[] = [];

  for (const [name] of Object.entries(dependencies)) {
    const lower = name.toLowerCase();
    const isAgentRelated =
      lower.includes("mcp") ||
      lower.includes("agent") ||
      lower.includes("langchain") ||
      lower.includes("llm") ||
      lower.includes("openclaw") ||
      lower.includes("anthropic") ||
      lower.includes("openai");

    if (isAgentRelated) {
      links.push({
        url: `https://www.npmjs.com/package/${name}`,
        type: "npm",
        priority: 7,
        context: "package-dependency",
      });
    }
  }

  return links;
}

export function extractLinksFromAgentCard(
  card: Record<string, unknown>
): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  const seen = new Set<string>();

  function walk(obj: unknown) {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      for (const item of obj) walk(item);
      return;
    }
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      if (typeof val === "string" && val.startsWith("http") && !seen.has(val)) {
        if (!isBlockedUrl(val)) {
          seen.add(val);
          const type = classifyUrl(val);
          links.push({
            url: val.replace(/\/$/, ""),
            type,
            priority: priorityForType(type) + 1,
            context: `agent-card-${key}`,
          });
        }
      }
      walk(val);
    }
  }

  walk(card);
  return links;
}
