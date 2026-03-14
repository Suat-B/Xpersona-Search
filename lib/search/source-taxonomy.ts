import { sql, type SQL, type SQLWrapper } from "drizzle-orm";

export const REGISTRY_SOURCES = [
  "MCP_REGISTRY",
  "A2A_REGISTRY",
  "SMITHERY",
  "AGENTSCAPE",
  "GOOGLE_CLOUD_MARKETPLACE",
  "DIFY_MARKETPLACE",
  "N8N_TEMPLATES",
  "LANGFLOW_STARTER_PROJECTS",
  "NACOS_AGENT_REGISTRY",
] as const;

export const SOURCE_BUCKETS: Record<string, string[]> = {
  GITHUB: [
    "GITHUB_REPOS",
    "GITHUB_MCP",
    "GITHUB_OPENCLEW",
    "CREWAI",
    "CLAWHUB",
    "CURATED_SEEDS",
    "AWESOME_LISTS",
    "HOMEPAGE",
  ],
  REGISTRY: [...REGISTRY_SOURCES],
  WEB: ["WEB", "WEB_CRAWL", "HOMEPAGE"],
};

export function expandSourceBuckets(values: string[]): string[] {
  const expanded = new Set<string>();
  for (const value of values) {
    const normalized = value.trim().toUpperCase();
    const bucketValues = SOURCE_BUCKETS[normalized] ?? [canonicalizeSource(normalized)];
    for (const entry of bucketValues) expanded.add(entry);
  }
  return [...expanded];
}

export function canonicalizeSource(source: string | null | undefined, sourceId?: string | null): string {
  const normalizedSource = (source ?? "").trim().toUpperCase();
  const normalizedSourceId = (sourceId ?? "").trim().toLowerCase();

  if (normalizedSourceId.startsWith("a2a:")) return "A2A_REGISTRY";
  if (normalizedSourceId.startsWith("smithery:")) return "SMITHERY";
  if (normalizedSourceId.startsWith("dify:")) return "DIFY_MARKETPLACE";
  if (normalizedSourceId.startsWith("n8n:")) return "N8N_TEMPLATES";
  if (normalizedSourceId.startsWith("gcp-agent:")) return "GOOGLE_CLOUD_MARKETPLACE";
  if (normalizedSourceId.startsWith("langflow:")) return "LANGFLOW_STARTER_PROJECTS";
  if (normalizedSourceId.startsWith("nacos:")) return "NACOS_AGENT_REGISTRY";
  if (normalizedSource === "GITHUB_A2A") return "A2A_REGISTRY";
  return normalizedSource || "GITHUB_OPENCLEW";
}

export function canonicalSourceSql(sourceColumn: SQLWrapper, sourceIdColumn: SQLWrapper): SQL {
  return sql`CASE
    WHEN lower(${sourceIdColumn}::text) LIKE 'a2a:%' THEN 'A2A_REGISTRY'
    WHEN lower(${sourceIdColumn}::text) LIKE 'smithery:%' THEN 'SMITHERY'
    WHEN lower(${sourceIdColumn}::text) LIKE 'dify:%' THEN 'DIFY_MARKETPLACE'
    WHEN lower(${sourceIdColumn}::text) LIKE 'n8n:%' THEN 'N8N_TEMPLATES'
    WHEN lower(${sourceIdColumn}::text) LIKE 'gcp-agent:%' THEN 'GOOGLE_CLOUD_MARKETPLACE'
    WHEN lower(${sourceIdColumn}::text) LIKE 'langflow:%' THEN 'LANGFLOW_STARTER_PROJECTS'
    WHEN lower(${sourceIdColumn}::text) LIKE 'nacos:%' THEN 'NACOS_AGENT_REGISTRY'
    WHEN upper(${sourceColumn}::text) = 'GITHUB_A2A' THEN 'A2A_REGISTRY'
    ELSE upper(${sourceColumn}::text)
  END`;
}

export function sourceDisplayLabel(source: string): string {
  switch (canonicalizeSource(source)) {
    case "A2A_REGISTRY":
      return "A2A Registry";
    case "SMITHERY":
      return "Smithery";
    case "MCP_REGISTRY":
      return "MCP Registry";
    case "AGENTSCAPE":
      return "AgentScape";
    case "DIFY_MARKETPLACE":
      return "Dify";
    case "N8N_TEMPLATES":
      return "n8n";
    case "GOOGLE_CLOUD_MARKETPLACE":
      return "Google Cloud";
    case "LANGFLOW_STARTER_PROJECTS":
      return "Langflow";
    case "NACOS_AGENT_REGISTRY":
      return "Nacos";
    default:
      return canonicalizeSource(source).replace(/_/g, " ");
  }
}
