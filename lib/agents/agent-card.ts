type AgentSource = string | null | undefined;

export interface AgentCardInput {
  id?: string | null;
  name?: string | null;
  slug?: string | null;
  description?: string | null;
  url?: string | null;
  homepage?: string | null;
  source?: AgentSource;
  sourceId?: string | null;
  protocols?: string[] | null;
  capabilities?: string[] | null;
  languages?: string[] | null;
  npmData?: { packageName?: string | null } | null;
  readmeSource?: string | null;
  examples?: Array<{ kind: string; language: string; snippet: string }> | null;
}

export interface AgentCard {
  name?: string;
  description?: string;
  source?: string;
  sourceId?: string;
  homepage?: string;
  repository?: string;
  documentation?: string;
  protocols?: string[];
  capabilities?: string[];
  languages?: string[];
  install?: { command: string; ecosystem?: string };
  metadata?: Record<string, unknown>;
  examples?: Array<{ kind: string; language: string; snippet: string }>;
}

function getInstallCommand(agent: AgentCardInput): { command: string; ecosystem?: string } | null {
  const source = (agent.source ?? "GITHUB_OPENCLEW").toUpperCase();
  if (source === "NPM") {
    const pkg = agent.npmData?.packageName ?? agent.name;
    if (!pkg) return null;
    return { command: `npm install ${pkg}`, ecosystem: "npm" };
  }
  if (source === "PYPI") {
    const pkg =
      agent.sourceId?.replace(/^pypi:/i, "") ??
      agent.name?.toLowerCase().replace(/\s+/g, "-");
    if (!pkg) return null;
    return { command: `pip install ${pkg}`, ecosystem: "pypi" };
  }
  if (source === "DOCKER") {
    const image = agent.sourceId?.replace(/^docker:/i, "") ?? agent.slug;
    if (!image) return null;
    return { command: `docker pull ${image}`, ecosystem: "docker" };
  }
  if (source.includes("GITHUB") && agent.url?.includes("github.com")) {
    const match = agent.url.match(/github\.com[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/);
    const repo = match?.[1];
    if (!repo) return null;
    return { command: `git clone https://github.com/${repo}.git`, ecosystem: "git" };
  }
  return null;
}

export function buildAgentCard(agent: AgentCardInput, baseUrl: string): AgentCard {
  const protocols = Array.isArray(agent.protocols) ? agent.protocols : [];
  const capabilities = Array.isArray(agent.capabilities) ? agent.capabilities : [];
  const languages = Array.isArray(agent.languages) ? agent.languages : [];
  const documentation =
    agent.slug && baseUrl ? `${baseUrl.replace(/\/$/, "")}/agent/${agent.slug}` : undefined;

  const install = getInstallCommand(agent) ?? undefined;

  return {
    name: agent.name ?? undefined,
    description: agent.description ?? undefined,
    source: agent.source ?? undefined,
    sourceId: agent.sourceId ?? undefined,
    homepage: agent.homepage ?? undefined,
    repository: agent.url ?? undefined,
    documentation,
    protocols: protocols.length > 0 ? protocols : undefined,
    capabilities: capabilities.length > 0 ? capabilities : undefined,
    languages: languages.length > 0 ? languages : undefined,
    install,
    metadata: agent.readmeSource ? { readmeSource: agent.readmeSource } : undefined,
    examples: agent.examples && agent.examples.length > 0 ? agent.examples : undefined,
  };
}
