import { and, eq, inArray, type SQL } from "drizzle-orm";
import { agents } from "@/lib/db/schema";
import { canonicalizeSource } from "@/lib/search/source-taxonomy";

export const PUBLIC_ENTITY_TYPES = ["agent", "skill", "mcp"] as const;

export type PublicEntityType = (typeof PUBLIC_ENTITY_TYPES)[number];

const AGENT_SOURCES = new Set([
  "A2A_REGISTRY",
  "AGENTSCAPE",
  "GOOGLE_CLOUD_MARKETPLACE",
  "NACOS_AGENT_REGISTRY",
]);

const SKILL_SOURCES = new Set([
  "CLAWHUB",
  "GITHUB_OPENCLEW",
  "CREWAI",
  "CURATED_SEEDS",
  "AWESOME_LISTS",
  "DIFY_MARKETPLACE",
  "N8N_TEMPLATES",
  "LANGFLOW_STARTER_PROJECTS",
  "VERCEL_TEMPLATES",
  "LANGCHAIN_HUB",
]);

const MCP_SOURCES = new Set([
  "MCP_REGISTRY",
  "GITHUB_MCP",
  "SMITHERY",
]);

export function isPublicEntityType(value: unknown): value is PublicEntityType {
  return typeof value === "string" && PUBLIC_ENTITY_TYPES.includes(value as PublicEntityType);
}

export function normalizePublicEntityType(value: unknown): PublicEntityType | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return isPublicEntityType(normalized) ? normalized : null;
}

export function parseEntityTypesParam(rawValue: string | null | undefined): PublicEntityType[] {
  if (!rawValue) return [];
  const values = rawValue
    .split(",")
    .map((value) => normalizePublicEntityType(value))
    .filter((value): value is PublicEntityType => Boolean(value));
  return [...new Set(values)];
}

export function getEntityLabel(entityType: PublicEntityType): string {
  switch (entityType) {
    case "agent":
      return "Agent";
    case "skill":
      return "Skill";
    case "mcp":
      return "MCP";
  }
}

export function getEntityLabelPlural(entityType: PublicEntityType): string {
  switch (entityType) {
    case "agent":
      return "Agents";
    case "skill":
      return "Skills";
    case "mcp":
      return "MCPs";
  }
}

export function getEntityBasePath(entityType: PublicEntityType): "/agent" | "/skill" | "/mcp" {
  switch (entityType) {
    case "agent":
      return "/agent";
    case "skill":
      return "/skill";
    case "mcp":
      return "/mcp";
  }
}

export function getCanonicalEntityPath(entityType: PublicEntityType, slug: string): string {
  return `${getEntityBasePath(entityType)}/${encodeURIComponent(slug)}`;
}

export function buildEntityTypeCondition(entityTypes: PublicEntityType[]): SQL | null {
  if (entityTypes.length === 0) return null;
  if (entityTypes.length === 1) {
    return eq(agents.entityType, entityTypes[0]) as unknown as SQL;
  }
  return inArray(agents.entityType, entityTypes) as unknown as SQL;
}

type DetectEntityTypeInput = {
  entityType?: string | null;
  source?: string | null;
  sourceId?: string | null;
  protocols?: unknown;
  agentCard?: unknown;
  agentCardUrl?: string | null;
  openclawData?: unknown;
  capabilities?: unknown;
  readme?: string | null;
  url?: string | null;
  homepage?: string | null;
};

function toUpperStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim().toUpperCase() : ""))
    .filter(Boolean);
}

function hasCapabilityTokens(value: unknown): boolean {
  return Array.isArray(value) && value.some((entry) => typeof entry === "string" && entry.trim().length > 0);
}

function hasOpenClawPayloadFlag(value: unknown, key: string): boolean {
  if (!value || typeof value !== "object") return false;
  return key in (value as Record<string, unknown>);
}

export function detectPublicEntityType(input: DetectEntityTypeInput): PublicEntityType {
  const explicit = normalizePublicEntityType(input.entityType);
  if (explicit) return explicit;

  const canonicalSource = canonicalizeSource(input.source ?? null, input.sourceId ?? null);
  const protocols = toUpperStringArray(input.protocols);
  const hasAgentCard = Boolean(
    (input.agentCard && typeof input.agentCard === "object") ||
      (typeof input.agentCardUrl === "string" && input.agentCardUrl.trim().length > 0)
  );

  if (AGENT_SOURCES.has(canonicalSource)) return "agent";
  if (MCP_SOURCES.has(canonicalSource)) return "mcp";
  if (SKILL_SOURCES.has(canonicalSource)) return "skill";

  if (hasAgentCard) return "agent";
  if (protocols.includes("A2A")) return "agent";

  if (
    hasOpenClawPayloadFlag(input.openclawData, "mcpRegistry") ||
    hasOpenClawPayloadFlag(input.openclawData, "smithery")
  ) {
    return "mcp";
  }

  if (
    hasOpenClawPayloadFlag(input.openclawData, "clawhub") ||
    hasOpenClawPayloadFlag(input.openclawData, "dify") ||
    hasOpenClawPayloadFlag(input.openclawData, "n8n") ||
    hasOpenClawPayloadFlag(input.openclawData, "langflow") ||
    hasOpenClawPayloadFlag(input.openclawData, "vercelTemplate")
  ) {
    return "skill";
  }

  if (protocols.includes("MCP") && protocols.length === 1 && !hasCapabilityTokens(input.capabilities)) {
    return "mcp";
  }

  if (protocols.includes("OPENCLEW") || protocols.includes("OPENCLAW")) {
    return "skill";
  }

  const readme = (input.readme ?? "").toLowerCase();
  if (/\bskill\b/.test(readme)) return "skill";
  if (/\bmcp\b|\bmodel context protocol\b/.test(readme)) return "mcp";

  const url = `${input.url ?? ""} ${input.homepage ?? ""}`.toLowerCase();
  if (url.includes("modelcontextprotocol")) return "mcp";
  if (url.includes("clawhub") || url.includes("openclaw")) return "skill";

  return "agent";
}

export function normalizeRequestedEntityTypes(params: {
  entityTypes?: PublicEntityType[];
  skillsOnly?: boolean;
}): PublicEntityType[] {
  if (params.entityTypes && params.entityTypes.length > 0) {
    return [...new Set(params.entityTypes)];
  }
  if (params.skillsOnly) return ["skill"];
  return ["agent"];
}

export function buildPublicEntityFilters(baseConditions: SQL[], entityTypes: PublicEntityType[]): SQL[] {
  const condition = buildEntityTypeCondition(entityTypes);
  return condition ? [...baseConditions, condition] : baseConditions;
}
