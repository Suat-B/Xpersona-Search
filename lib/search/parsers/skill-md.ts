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
  const { data, content: body } = matter(content);

  const capabilities = extractCapabilities(body);
  const protocols = extractProtocols(body);

  return {
    name: data?.name,
    description: data?.description ?? extractDescription(body),
    version: data?.version,
    author: data?.author,
    homepage: data?.homepage,
    capabilities,
    protocols,
    parameters: data?.parameters ?? {},
    dependencies: Array.isArray(data?.dependencies) ? data.dependencies : [],
    permissions: Array.isArray(data?.permissions) ? data.permissions : [],
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
