import matter from "gray-matter";

export interface SkillData {
  name?: string;
  description?: string;
  version?: string;
  author?: string;
  homepage?: string;
  capabilities: string[];
  protocols: string[];
  parameters?: Record<
    string,
    { type: string; required?: boolean; default?: unknown; description?: string }
  >;
  dependencies?: string[];
  permissions?: string[];
  examples?: string[];
  raw: string;
}

export function parseSkillMd(content: string): SkillData {
  let data: Record<string, unknown> = {};
  let body = content;

  try {
    const parsed = matter(content);
    data = parsed.data ?? {};
    body = parsed.content;
  } catch {
    // Malformed frontmatter (e.g. markdown in YAML) — treat full content as body
    const dashMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (dashMatch) body = dashMatch[2];
  }

  const capabilities = extractCapabilities(body);
  const protocols = extractProtocols(body);

  return {
    name: (data?.name as string) ?? undefined,
    description: (data?.description as string) ?? extractDescription(body),
    version: (data?.version as string) ?? undefined,
    author: (data?.author as string) ?? undefined,
    homepage: (data?.homepage as string) ?? undefined,
    capabilities,
    protocols,
    parameters: (data?.parameters as Record<string, { type: string; required?: boolean; default?: unknown; description?: string }>) ?? {},
    dependencies: Array.isArray(data?.dependencies) ? (data.dependencies as string[]) : [],
    permissions: Array.isArray(data?.permissions) ? (data.permissions as string[]) : [],
    examples: extractExamples(body),
    raw: content,
  };
}

function extractCapabilities(body: string): string[] {
  const capabilities: string[] = [];
  const patterns = [
    /capability:\s*(\w+)/gi,
    /can\s+(\w+)/gi,
    /supports?\s+(\w+)/gi,
  ];
  for (const pattern of patterns) {
    const matches = body.matchAll(pattern);
    for (const m of matches) capabilities.push(m[1].toLowerCase());
  }
  return [...new Set(capabilities)];
}

function extractProtocols(body: string): string[] {
  const protocols: string[] = [];
  if (/\bA2A\b/i.test(body)) protocols.push("A2A");
  if (/\bMCP\b/i.test(body)) protocols.push("MCP");
  if (/\bANP\b/i.test(body)) protocols.push("ANP");
  if (/\bOpenClaw\b|openclaw/i.test(body)) protocols.push("OPENCLEW");
  if (protocols.length === 0) protocols.push("OPENCLEW");
  return protocols;
}

function extractDescription(body: string): string {
  const lines = body.split("\n").filter((l) => l.trim());
  return (lines[0]?.slice(0, 200) ?? "").replace(/^#+\s*/, "").trim();
}

function extractExamples(body: string): string[] {
  const examples: string[] = [];
  const re = /```[\w]*\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(body)) !== null) examples.push(m[1].trim());
  return examples.slice(0, 3);
}
