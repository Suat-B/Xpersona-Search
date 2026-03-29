import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  agentBenchmarkResults,
  agentExecutionMetrics,
  agentMediaAssets,
  agentMetrics,
  agents,
  failurePatterns,
} from "@/lib/db/schema";
import { extractExecutableExamples } from "@/lib/agents/executable-examples";
import {
  normalizeClawhubPayload,
  resolveEditorialContent,
  type AgentReleaseHighlight,
  type ResolvedEditorialContent,
} from "@/lib/agents/editorial-content";
import {
  getAgentsByProtocol,
  sourceSlugFromValue,
  type HubAgent,
} from "@/lib/agents/hub-data";
import { getPublicAgentPageData } from "@/lib/agents/public-agent-page";
import { canonicalizeSource, sourceDisplayLabel } from "@/lib/search/source-taxonomy";

export type EvidenceConfidence = "high" | "medium" | "low";

export interface DossierEvidence {
  source: string;
  confidence: EvidenceConfidence;
  verified: boolean;
  updatedAt: string | null;
  emptyReason: string | null;
}

export interface DossierLink {
  label: string;
  url: string;
  kind:
    | "source"
    | "homepage"
    | "github"
    | "docs"
    | "demo"
    | "support"
    | "pricing"
    | "status"
    | "custom";
}

export interface AgentDossier {
  id: string;
  entityType: "agent" | "skill" | "mcp";
  slug: string;
  name: string;
  canonicalUrl: string;
  canonicalPath: string;
  generatedAt: string;
  source: string;
  claimStatus: string;
  verificationTier: string;
  summary: {
    evidence: DossierEvidence;
    description: string;
    descriptionLabel: string;
    evidenceSummary: string;
    installCommand: string | null;
    sourceUrl: string;
    homepage: string | null;
    primaryLinks: DossierLink[];
    safetyScore: number;
    overallRank: number;
    popularityScore: number;
    trustScore: number | null;
    claimedByName: string | null;
    isOwner: boolean;
    seoDescription: string;
  };
  coverage: {
    evidence: DossierEvidence;
    protocols: Array<{
      protocol: string;
      label: string;
      status: "verified" | "self-declared";
      notes: string;
    }>;
    capabilities: Array<{
      label: string;
      status: "verified" | "self-declared";
    }>;
    verifiedCount: number;
    selfDeclaredCount: number;
    capabilityMatrix: {
      rows: Array<{
        key: string;
        type: "protocol" | "capability";
        support: "supported" | "unknown";
        confidenceSource: "contract" | "profile" | "inferred";
        notes: string;
      }>;
      flattenedTokens: string;
    };
  };
  adoption: {
    evidence: DossierEvidence;
    stars: number | null;
    forks: number | null;
    downloads: number | null;
    packageName: string | null;
    latestVersion: string | null;
    tractionLabel: string | null;
  };
  release: {
    evidence: DossierEvidence;
    lastUpdatedAt: string | null;
    lastCrawledAt: string | null;
    lastIndexedAt: string | null;
    nextCrawlAt: string | null;
    lastVerifiedAt: string | null;
    highlights: AgentReleaseHighlight[];
  };
  execution: {
    evidence: DossierEvidence;
    installCommand: string | null;
    setupComplexity: "low" | "medium" | "high";
    setupSteps: string[];
    contract: {
      contractStatus: "ready" | "missing" | "unavailable";
      authModes: string[];
      requires: string[];
      forbidden: string[];
      supportsMcp: boolean;
      supportsA2a: boolean;
      supportsStreaming: boolean;
      inputSchemaRef: string | null;
      outputSchemaRef: string | null;
      dataRegion: string | null;
      contractUpdatedAt: string | null;
      sourceUpdatedAt: string | null;
      freshnessSeconds: number | null;
    };
    invocationGuide: {
      preferredApi: {
        snapshotUrl: string;
        contractUrl: string;
        trustUrl: string;
      };
      curlExamples: string[];
      jsonRequestTemplate: Record<string, unknown>;
      jsonResponseTemplate: Record<string, unknown>;
      retryPolicy: {
        maxAttempts: number;
        backoffMs: number[];
        retryableConditions: string[];
      };
    };
    endpoints: {
      dossierUrl: string;
      snapshotUrl: string;
      contractUrl: string;
      trustUrl: string;
    };
  };
  reliability: {
    evidence: DossierEvidence;
    trust: {
      status: "ready" | "unavailable";
      handshakeStatus: string;
      verificationFreshnessHours: number | null;
      reputationScore: number | null;
      p95LatencyMs: number | null;
      successRate30d: number | null;
      fallbackRate: number | null;
      attempts30d: number | null;
      trustUpdatedAt: string | null;
      trustConfidence: "high" | "medium" | "low" | "unknown";
      sourceUpdatedAt: string | null;
      freshnessSeconds: number | null;
    };
    decisionGuardrails: {
      doNotUseIf: string[];
      safeUseWhen: string[];
      riskFlags: string[];
      operationalConfidence: "high" | "medium" | "low";
    };
    executionMetrics: {
      observedLatencyMsP50: number | null;
      observedLatencyMsP95: number | null;
      estimatedCostUsd: number | null;
      uptime30d: number | null;
      rateLimitRpm: number | null;
      rateLimitBurst: number | null;
      lastVerifiedAt: string | null;
      verificationSource: string | null;
    };
    runtimeMetrics: {
      successRate: number | null;
      avgLatencyMs: number | null;
      avgCostUsd: number | null;
      hallucinationRate: number | null;
      retryRate: number | null;
      disputeRate: number | null;
      p50Latency: number | null;
      p95Latency: number | null;
      lastUpdated: string | null;
    };
  };
  benchmarks: {
    evidence: DossierEvidence;
    suites: Array<{
      suiteName: string;
      score: number;
      accuracy: number | null;
      latencyMs: number | null;
      costUsd: number | null;
      safetyViolations: number | null;
      createdAt: string | null;
    }>;
    failurePatterns: Array<{
      type: string;
      frequency: number;
      lastSeen: string | null;
    }>;
  };
  artifacts: {
    evidence: DossierEvidence;
    readme: string | null;
    readmeExcerpt: string | null;
    codeSnippets: string[];
    executableExamples: Array<{ language: string; snippet: string }>;
    parameters: Record<
      string,
      { type: string; required?: boolean; default?: unknown; description?: string }
    > | null;
    dependencies: string[];
    permissions: string[];
    extractedFiles: Array<{ path: string; content: string }>;
    languages: string[];
    docsSourceLabel: string | null;
    editorialOverview: string | null;
    editorialQuality: ResolvedEditorialContent["quality"];
  };
  media: {
    evidence: DossierEvidence;
    primaryImageUrl: string | null;
    mediaAssetCount: number;
    assets: Array<{
      url: string;
      title: string | null;
      caption: string | null;
      altText: string | null;
      assetKind: string;
      sourcePageUrl: string | null;
    }>;
    demoUrl: string | null;
  };
  ownerResources: {
    evidence: DossierEvidence;
    hasCustomPage: boolean;
    customPageUpdatedAt: string | null;
    customLinks: DossierLink[];
    structuredLinks: {
      docsUrl: string | null;
      demoUrl: string | null;
      supportUrl: string | null;
      pricingUrl: string | null;
      statusUrl: string | null;
    };
    customPage:
      | {
          html: string;
          css: string;
          js: string;
          widgetLayout: unknown[];
          updatedAt: string | null;
        }
      | null;
  };
  relatedAgents: {
    evidence: DossierEvidence;
    items: HubAgent[];
    links: {
      hub: string;
      source: string;
      protocols: Array<{ label: string; href: string }>;
    };
  };
}

type ClientAgentData = {
  sourceId?: string;
  githubData?: { stars?: number; forks?: number } | null;
  npmData?: {
    packageName?: string;
    version?: string;
    downloads?: number;
  } | null;
  readme?: string | null;
  codeSnippets?: string[] | null;
  openclawData?: Record<string, unknown> | null;
  languages?: string[] | null;
  customLinks?: Array<{ label: string; url: string }> | null;
  docsUrl?: string | null;
  demoUrl?: string | null;
  supportUrl?: string | null;
  pricingUrl?: string | null;
  statusUrl?: string | null;
  customPage?: {
    html: string;
    css: string;
    js: string;
    widgetLayout: unknown[];
    updatedAt?: string | null;
  } | null;
};

const OPTIONAL_TABLE_CACHE = new Map<string, boolean>();

function toProtocolLabel(protocol: string): string {
  const normalized = protocol.trim().toUpperCase();
  if (normalized === "OPENCLAW" || normalized === "OPENCLEW") return "OpenClaw";
  return normalized;
}

function ensureExternalUrl(rawUrl: string | null | undefined): string {
  const url = (rawUrl ?? "").trim();
  if (!url) return "";
  const sshMatch = url.match(/^git@([^:]+):(.+?)(?:\.git)?$/i);
  if (sshMatch) return `https://${sshMatch[1]}/${sshMatch[2]}`;
  const sshProtoMatch = url.match(/^ssh:\/\/git@([^/]+)\/(.+?)(?:\.git)?$/i);
  if (sshProtoMatch) return `https://${sshProtoMatch[1]}/${sshProtoMatch[2]}`;
  if (/^git:\/\//i.test(url)) return url.replace(/^git:\/\//i, "https://");
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("//")) return `https:${url}`;
  return `https://${url}`;
}

function normalizeUrlKey(rawUrl: string | null | undefined): string {
  const normalized = ensureExternalUrl(rawUrl).replace(/\.git$/i, "");
  if (!normalized) return "";
  try {
    const parsed = new URL(normalized);
    parsed.hash = "";
    if (parsed.pathname.endsWith("/")) parsed.pathname = parsed.pathname.slice(0, -1);
    return parsed.toString().toLowerCase();
  } catch {
    return normalized.toLowerCase();
  }
}

function maybeIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function toCompactNumber(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: value >= 1_000 ? 1 : 0,
  }).format(value);
}

function toPercent(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const normalized = value <= 1 ? value * 100 : value;
  return `${normalized.toFixed(normalized >= 10 ? 0 : 1)}%`;
}

function toUsd(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1 ? 2 : 4,
  }).format(value);
}

function toMs(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `${Math.round(value)} ms`;
}

function dedupeStringArray(values: Iterable<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = (value ?? "").trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function buildSectionEvidence(input: {
  source: string;
  verified?: boolean;
  confidence?: EvidenceConfidence;
  updatedAt?: string | null;
  emptyReason?: string | null;
}): DossierEvidence {
  return {
    source: input.source,
    verified: Boolean(input.verified),
    confidence: input.confidence ?? "medium",
    updatedAt: input.updatedAt ?? null,
    emptyReason: input.emptyReason ?? null,
  };
}

export function buildCoverageProtocols(input: {
  declaredProtocols: string[];
  supportsMcp: boolean;
  supportsA2a: boolean;
}): AgentDossier["coverage"]["protocols"] {
  const declared = new Set(input.declaredProtocols.map((item) => item.trim().toUpperCase()).filter(Boolean));
  const supported = new Set<string>();
  if (input.supportsMcp) supported.add("MCP");
  if (input.supportsA2a) supported.add("A2A");
  for (const protocol of declared) supported.add(protocol);

  return [...supported].map((protocol) => {
    const verified = (protocol === "MCP" && input.supportsMcp) || (protocol === "A2A" && input.supportsA2a);
    return {
      protocol,
      label: toProtocolLabel(protocol),
      status: verified ? "verified" : "self-declared",
      notes: verified ? "Confirmed by published contract metadata." : "Declared in the public agent profile.",
    };
  });
}

function getSourceLinkLabel(source: string): string {
  switch (canonicalizeSource(source)) {
    case "NPM":
      return "View on npm";
    case "PYPI":
      return "View on PyPI";
    case "CLAWHUB":
      return "View on ClawHub";
    case "HUGGINGFACE":
      return "View on Hugging Face";
    case "DOCKER":
      return "View on Docker Hub";
    case "REPLICATE":
      return "View on Replicate";
    case "GOOGLE_CLOUD_MARKETPLACE":
      return "View on Google Cloud";
    case "DIFY_MARKETPLACE":
      return "View on Dify";
    case "N8N_TEMPLATES":
      return "View on n8n";
    default:
      return "View Source";
  }
}

export function buildPrimaryLinks(input: {
  source: string;
  sourceUrl: string;
  homepage: string | null;
  githubUrl: string | null;
  ownerResources: AgentDossier["ownerResources"]["structuredLinks"];
  customLinks: Array<{ label: string; url: string }>;
}): DossierLink[] {
  const links: DossierLink[] = [];
  const seen = new Set<string>();

  function addLink(link: DossierLink | null) {
    if (!link) return;
    const key = normalizeUrlKey(link.url);
    if (!key || seen.has(key)) return;
    seen.add(key);
    links.push(link);
  }

  addLink({
    label: getSourceLinkLabel(input.source),
    url: input.sourceUrl,
    kind: "source",
  });
  addLink(input.homepage ? { label: "Homepage", url: input.homepage, kind: "homepage" } : null);
  addLink(input.githubUrl ? { label: "GitHub", url: input.githubUrl, kind: "github" } : null);
  addLink(input.ownerResources.docsUrl ? { label: "Docs", url: input.ownerResources.docsUrl, kind: "docs" } : null);
  addLink(input.ownerResources.demoUrl ? { label: "Demo", url: input.ownerResources.demoUrl, kind: "demo" } : null);
  addLink(input.ownerResources.supportUrl ? { label: "Support", url: input.ownerResources.supportUrl, kind: "support" } : null);
  addLink(input.ownerResources.pricingUrl ? { label: "Pricing", url: input.ownerResources.pricingUrl, kind: "pricing" } : null);
  addLink(input.ownerResources.statusUrl ? { label: "Status", url: input.ownerResources.statusUrl, kind: "status" } : null);

  for (const customLink of input.customLinks) {
    addLink({
      label: customLink.label,
      url: customLink.url,
      kind: "custom",
    });
  }

  return links;
}

async function hasOptionalTable(tableName: string): Promise<boolean> {
  if (OPTIONAL_TABLE_CACHE.has(tableName)) {
    return OPTIONAL_TABLE_CACHE.get(tableName) ?? false;
  }

  try {
    const result = await db.execute(
      sql`SELECT to_regclass(${`public.${tableName}`}) AS regclass`
    );
    const rows = (result as unknown as { rows?: Array<{ regclass?: string | null }> }).rows ?? [];
    const exists = Boolean(rows[0]?.regclass);
    OPTIONAL_TABLE_CACHE.set(tableName, exists);
    return exists;
  } catch {
    OPTIONAL_TABLE_CACHE.set(tableName, false);
    return false;
  }
}

function getGithubUrl(sourceUrl: string, homepage: string | null): string | null {
  const candidates = [sourceUrl, homepage];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (!/github\.com/i.test(candidate)) continue;
    const normalized = ensureExternalUrl(candidate).replace(/\.git$/i, "");
    if (normalized) return normalized;
  }
  return null;
}

function getInstallCommand(input: {
  source: string;
  sourceId: string | null;
  name: string;
  npmData: ClientAgentData["npmData"];
  sourceUrl: string;
}): string | null {
  const source = canonicalizeSource(input.source, input.sourceId);
  switch (source) {
    case "NPM": {
      const pkg = input.npmData?.packageName ?? input.name;
      return pkg ? `npm install ${pkg}` : null;
    }
    case "PYPI": {
      const pkg = input.sourceId?.replace(/^pypi:/, "") ?? input.name.toLowerCase().replace(/\s+/g, "-");
      return `pip install ${pkg}`;
    }
    case "CLAWHUB": {
      const slug = input.sourceId?.replace(/^clawhub:/, "") ?? input.name.toLowerCase().replace(/\s+/g, "-");
      return `clawhub skill install ${slug}`;
    }
    case "DOCKER": {
      const image = input.sourceId?.replace(/^docker:/, "") ?? input.name.toLowerCase().replace(/\s+/g, "-");
      return `docker pull ${image}`;
    }
    case "GITHUB_OPENCLEW":
    case "GITHUB_MCP":
    case "A2A_REGISTRY": {
      const match = input.sourceUrl.match(/github\.com[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/);
      const repo = match?.[1] ?? "";
      return repo ? `git clone https://github.com/${repo}.git` : null;
    }
    default:
      return null;
  }
}

function buildSetupFallback(input: {
  installCommand: string | null;
  source: string;
  contractStatus: "ready" | "missing" | "unavailable";
  authModes: string[];
  sourceUrl: string;
}): string[] {
  const steps: string[] = [];
  if (input.installCommand) {
    steps.push(`Install using \`${input.installCommand}\` in an isolated environment before connecting it to live workloads.`);
  }
  if (input.contractStatus === "ready" && input.authModes.length > 0) {
    steps.push(`Validate the published auth modes first: ${input.authModes.join(", ")}.`);
  } else {
    steps.push("No published capability contract is available yet, so validate auth and request/response behavior manually.");
  }
  steps.push(`Review the upstream ${sourceDisplayLabel(input.source)} listing at ${input.sourceUrl} before using production credentials.`);
  return steps;
}

function buildEvidenceSummary(input: {
  contractStatus: "ready" | "missing" | "unavailable";
  trustStatus: "ready" | "unavailable";
  trustConfidence: "high" | "medium" | "low" | "unknown";
  tractionLabel: string | null;
  lastVerifiedAt: string | null;
  lastUpdatedAt: string | null;
}): string {
  const parts: string[] = [];
  parts.push(
    input.contractStatus === "ready"
      ? "Published capability contract available."
      : "Capability contract not published."
  );
  if (input.trustStatus === "ready") {
    parts.push(`Trust data available with ${input.trustConfidence} confidence.`);
  } else {
    parts.push("No trust telemetry is available yet.");
  }
  if (input.tractionLabel) {
    parts.push(`${input.tractionLabel} reported by the source.`);
  }
  if (input.lastVerifiedAt) {
    parts.push(`Last verified ${new Date(input.lastVerifiedAt).toLocaleDateString("en-US")}.`);
  } else if (input.lastUpdatedAt) {
    parts.push(`Last updated ${new Date(input.lastUpdatedAt).toLocaleDateString("en-US")}.`);
  }
  return parts.join(" ");
}

function buildSeoDescription(input: {
  name: string;
  description: string;
  claimStatus: string;
  hasRichEditorial: boolean;
  capabilities: string[];
  protocols: string[];
}): string {
  const trimmed = input.description.trim();
  if (input.hasRichEditorial || input.claimStatus === "CLAIMED") {
    return trimmed.slice(0, 160);
  }

  const capabilityText = input.capabilities.slice(0, 3).join(", ");
  const protocolText = input.protocols.slice(0, 2).join(", ");
  if (capabilityText || protocolText) {
    return `${input.name} technical dossier on Xpersona with ${capabilityText || "agent"} coverage, ${protocolText || "protocol"} support, and live trust metadata.`.slice(0, 160);
  }
  return `${input.name} technical dossier on Xpersona with source links, trust signals, and execution metadata.`.slice(0, 160);
}

function buildDocsSourceLabel(source: string): string {
  if (source === "NPM") return "npm";
  if (source === "PYPI") return "PyPI";
  return sourceDisplayLabel(source);
}

export async function getAgentDossier(
  slug: string,
  viewerUserId?: string | null
): Promise<AgentDossier | null> {
  const publicData = await getPublicAgentPageData(slug, viewerUserId ?? null);
  if (!publicData) return null;

  const clientData = (publicData.agentForClient ?? {}) as ClientAgentData;
  const generatedAt = new Date().toISOString();

  const [supplemental] = await db
    .select({
      sourceId: agents.sourceId,
      primaryImageUrl: agents.primaryImageUrl,
      mediaAssetCount: agents.mediaAssetCount,
      lastCrawledAt: agents.lastCrawledAt,
      lastIndexedAt: agents.lastIndexedAt,
      nextCrawlAt: agents.nextCrawlAt,
      updatedAt: agents.updatedAt,
    })
    .from(agents)
    .where(eq(agents.id, publicData.id))
    .limit(1);

  const source = canonicalizeSource(
    publicData.source,
    supplemental?.sourceId ?? clientData.sourceId ?? null
  );
  const normalizedClawhub = normalizeClawhubPayload(clientData.openclawData ?? null);

  const editorial = await resolveEditorialContent({
    agentId: publicData.id,
    name: publicData.name,
    description: publicData.description,
    capabilities: publicData.capabilities,
    protocols: publicData.protocols,
    source,
    readmeExcerpt: publicData.readmeExcerpt,
    updatedAtIso: publicData.updatedAtIso,
    openclawData: clientData.openclawData ?? null,
    sourceUrl: publicData.sourceUrl,
    homepage: publicData.homepage,
  });
  const hasRichEditorial = editorial.quality.status === "ready";

  const [
    hasExecutionMetricsTable,
    hasMediaTable,
    hasBenchmarksTable,
    hasFailurePatternsTable,
    hasRuntimeMetricsTable,
  ] = await Promise.all([
    hasOptionalTable("agent_execution_metrics"),
    hasOptionalTable("agent_media_assets"),
    hasOptionalTable("agent_benchmark_results"),
    hasOptionalTable("failure_patterns"),
    hasOptionalTable("agent_metrics"),
  ]);

  const [
    executionMetricRows,
    mediaRows,
    benchmarkRows,
    failurePatternRows,
    runtimeMetricRows,
    relatedByProtocol,
  ] = await Promise.all([
    hasExecutionMetricsTable
      ? db
          .select({
            observedLatencyMsP50: agentExecutionMetrics.observedLatencyMsP50,
            observedLatencyMsP95: agentExecutionMetrics.observedLatencyMsP95,
            estimatedCostUsd: agentExecutionMetrics.estimatedCostUsd,
            uptime30d: agentExecutionMetrics.uptime30d,
            rateLimitRpm: agentExecutionMetrics.rateLimitRpm,
            rateLimitBurst: agentExecutionMetrics.rateLimitBurst,
            lastVerifiedAt: agentExecutionMetrics.lastVerifiedAt,
            verificationSource: agentExecutionMetrics.verificationSource,
          })
          .from(agentExecutionMetrics)
          .where(eq(agentExecutionMetrics.agentId, publicData.id))
          .limit(1)
      : Promise.resolve([]),
    hasMediaTable
      ? db
          .select({
            url: agentMediaAssets.url,
            title: agentMediaAssets.title,
            caption: agentMediaAssets.caption,
            altText: agentMediaAssets.altText,
            assetKind: agentMediaAssets.assetKind,
            sourcePageUrl: agentMediaAssets.sourcePageUrl,
          })
          .from(agentMediaAssets)
          .where(
            and(
              eq(agentMediaAssets.agentId, publicData.id),
              eq(agentMediaAssets.isPublic, true),
              eq(agentMediaAssets.isDead, false)
            )
          )
          .orderBy(desc(agentMediaAssets.rankScore), desc(agentMediaAssets.updatedAt))
          .limit(8)
      : Promise.resolve([]),
    hasBenchmarksTable
      ? db
          .select({
            suiteName: agentBenchmarkResults.suiteName,
            score: agentBenchmarkResults.score,
            accuracy: agentBenchmarkResults.accuracy,
            latencyMs: agentBenchmarkResults.latencyMs,
            costUsd: agentBenchmarkResults.costUsd,
            safetyViolations: agentBenchmarkResults.safetyViolations,
            createdAt: agentBenchmarkResults.createdAt,
          })
          .from(agentBenchmarkResults)
          .where(eq(agentBenchmarkResults.agentId, publicData.id))
          .orderBy(desc(agentBenchmarkResults.createdAt))
          .limit(8)
      : Promise.resolve([]),
    hasFailurePatternsTable
      ? db
          .select({
            type: failurePatterns.type,
            frequency: failurePatterns.frequency,
            lastSeen: failurePatterns.lastSeen,
          })
          .from(failurePatterns)
          .where(eq(failurePatterns.agentId, publicData.id))
          .orderBy(desc(failurePatterns.frequency), desc(failurePatterns.lastSeen))
          .limit(8)
      : Promise.resolve([]),
    hasRuntimeMetricsTable
      ? db
          .select({
            successRate: agentMetrics.successRate,
            avgLatencyMs: agentMetrics.avgLatencyMs,
            avgCostUsd: agentMetrics.avgCostUsd,
            hallucinationRate: agentMetrics.hallucinationRate,
            retryRate: agentMetrics.retryRate,
            disputeRate: agentMetrics.disputeRate,
            p50Latency: agentMetrics.p50Latency,
            p95Latency: agentMetrics.p95Latency,
            lastUpdated: agentMetrics.lastUpdated,
          })
          .from(agentMetrics)
          .where(eq(agentMetrics.agentId, publicData.id))
          .limit(1)
      : Promise.resolve([]),
    publicData.protocols.length > 0
      ? getAgentsByProtocol(publicData.protocols[0], 8)
      : Promise.resolve([]),
  ]);

  const executionMetricsRow = executionMetricRows[0] ?? null;
  const runtimeMetricsRow = runtimeMetricRows[0] ?? null;

  const customLinks = dedupeStringArray((clientData.customLinks ?? []).map((item) => item.url)).map((url) => {
    const found = (clientData.customLinks ?? []).find((item) => item.url === url);
    return {
      label: found?.label ?? "Link",
      url,
    };
  });

  const structuredLinks = {
    docsUrl: ensureExternalUrl(clientData.docsUrl ?? null) || null,
    demoUrl: ensureExternalUrl(clientData.demoUrl ?? null) || null,
    supportUrl: ensureExternalUrl(clientData.supportUrl ?? null) || null,
    pricingUrl: ensureExternalUrl(clientData.pricingUrl ?? null) || null,
    statusUrl: ensureExternalUrl(clientData.statusUrl ?? null) || null,
  };

  const installCommand = getInstallCommand({
    source,
    sourceId: supplemental?.sourceId ?? clientData.sourceId ?? null,
    name: publicData.name,
    npmData: clientData.npmData ?? null,
    sourceUrl: publicData.sourceUrl,
  });
  const githubUrl = getGithubUrl(publicData.sourceUrl, publicData.homepage);
  const primaryLinks = buildPrimaryLinks({
    source,
    sourceUrl: publicData.sourceUrl,
    homepage: publicData.homepage,
    githubUrl,
    ownerResources: structuredLinks,
    customLinks,
  });

  const coverageProtocols = buildCoverageProtocols({
    declaredProtocols: publicData.protocols,
    supportsMcp: publicData.machineBlocks.executionContractSummary.supportsMcp,
    supportsA2a: publicData.machineBlocks.executionContractSummary.supportsA2a,
  });
  const coverageCapabilities = publicData.capabilities.map((capability) => ({
    label: capability,
    status: "self-declared" as const,
  }));

  const downloads =
    typeof clientData.npmData?.downloads === "number"
      ? clientData.npmData.downloads
      : normalizedClawhub?.downloads ?? null;
  const tractionLabel = downloads
    ? `${toCompactNumber(downloads)} downloads`
    : typeof clientData.githubData?.stars === "number" && clientData.githubData.stars > 0
      ? `${toCompactNumber(clientData.githubData.stars)} GitHub stars`
      : null;

  const relatedAgents = relatedByProtocol
    .filter((item) => item.slug !== publicData.slug)
    .slice(0, 4);

  const parameters =
    clientData.openclawData &&
    typeof clientData.openclawData === "object" &&
    clientData.openclawData.parameters &&
    typeof clientData.openclawData.parameters === "object"
      ? (clientData.openclawData.parameters as AgentDossier["artifacts"]["parameters"])
      : null;

  const dependencies = Array.isArray(clientData.openclawData?.dependencies)
    ? dedupeStringArray(clientData.openclawData.dependencies as string[])
    : [];
  const permissions = Array.isArray(clientData.openclawData?.permissions)
    ? dedupeStringArray(clientData.openclawData.permissions as string[])
    : [];

  const executionEvidence = buildSectionEvidence({
    source:
      publicData.machineBlocks.executionContractSummary.contractStatus === "ready"
        ? "capability-contract"
        : sourceDisplayLabel(source),
    verified: publicData.machineBlocks.executionContractSummary.contractStatus === "ready",
    confidence:
      publicData.machineBlocks.executionContractSummary.contractStatus === "ready"
        ? "high"
        : "low",
    updatedAt: publicData.machineBlocks.executionContractSummary.contractUpdatedAt,
    emptyReason:
      publicData.machineBlocks.executionContractSummary.contractStatus === "ready"
        ? null
        : "No published capability contract is available yet.",
  });

  const adoptionEvidence = buildSectionEvidence({
    source: tractionLabel ? sourceDisplayLabel(source) : "no-adoption-signals",
    verified: false,
    confidence: tractionLabel ? "medium" : "low",
    updatedAt: clientData.npmData?.version ? publicData.updatedAtIso : maybeIso(supplemental?.updatedAt),
    emptyReason: tractionLabel ? null : "No source adoption metrics were available.",
  });

  const releaseHighlights =
    editorial.sections.releaseHighlights.length > 0
      ? editorial.sections.releaseHighlights
      : normalizedClawhub?.versions ?? [];

  const summaryDescription = hasRichEditorial
    ? editorial.sections.overview
    : publicData.description;
  const summaryDescriptionLabel = hasRichEditorial
    ? "Technical summary"
    : publicData.claimStatus === "CLAIMED"
      ? "Owner description"
      : "Source description";

  const evidenceSummary = buildEvidenceSummary({
    contractStatus: publicData.machineBlocks.executionContractSummary.contractStatus,
    trustStatus: publicData.machineBlocks.trustAndReliability.status,
    trustConfidence: publicData.machineBlocks.trustAndReliability.trustConfidence,
    tractionLabel,
    lastVerifiedAt:
      maybeIso(executionMetricsRow?.lastVerifiedAt) ??
      publicData.machineBlocks.trustAndReliability.trustUpdatedAt,
    lastUpdatedAt: publicData.updatedAtIso,
  });

  return {
    id: publicData.id,
    entityType: publicData.entityType,
    slug: publicData.slug,
    name: publicData.name,
    canonicalUrl: publicData.canonicalUrl,
    canonicalPath: publicData.canonicalPath,
    generatedAt,
    source,
    claimStatus: publicData.claimStatus,
    verificationTier: publicData.verificationTier,
    summary: {
      evidence: buildSectionEvidence({
        source: hasRichEditorial ? "editorial-content" : sourceDisplayLabel(source),
        verified: hasRichEditorial || publicData.claimStatus === "CLAIMED",
        confidence: hasRichEditorial ? "high" : "medium",
        updatedAt: editorial.lastReviewedAt ?? publicData.updatedAtIso,
        emptyReason: null,
      }),
      description: summaryDescription,
      descriptionLabel: summaryDescriptionLabel,
      evidenceSummary,
      installCommand,
      sourceUrl: publicData.sourceUrl,
      homepage: publicData.homepage,
      primaryLinks,
      safetyScore: publicData.safetyScore,
      overallRank: publicData.overallRank,
      popularityScore: Number((publicData.agentForClient as Record<string, unknown>)?.popularityScore ?? 0),
      trustScore: publicData.trustScore,
      claimedByName: publicData.claimedByName,
      isOwner: Boolean((publicData.agentForClient as Record<string, unknown>)?.isOwner),
      seoDescription: buildSeoDescription({
        name: publicData.name,
        description: summaryDescription,
        claimStatus: publicData.claimStatus,
        hasRichEditorial,
        capabilities: publicData.capabilities,
        protocols: publicData.protocols,
      }),
    },
    coverage: {
      evidence: buildSectionEvidence({
        source:
          publicData.machineBlocks.executionContractSummary.contractStatus === "ready"
            ? "capability-contract + public-profile"
            : "public-profile",
        verified: publicData.machineBlocks.executionContractSummary.contractStatus === "ready",
        confidence:
          publicData.machineBlocks.executionContractSummary.contractStatus === "ready"
            ? "high"
            : "medium",
        updatedAt:
          publicData.machineBlocks.executionContractSummary.contractUpdatedAt ?? publicData.updatedAtIso,
        emptyReason:
          coverageProtocols.length > 0 || coverageCapabilities.length > 0
            ? null
            : "No protocol or capability metadata is available.",
      }),
      protocols: coverageProtocols,
      capabilities: coverageCapabilities,
      verifiedCount: coverageProtocols.filter((item) => item.status === "verified").length,
      selfDeclaredCount:
        coverageProtocols.filter((item) => item.status === "self-declared").length +
        coverageCapabilities.length,
      capabilityMatrix: publicData.machineBlocks.capabilityMatrix,
    },
    adoption: {
      evidence: adoptionEvidence,
      stars: clientData.githubData?.stars ?? null,
      forks: clientData.githubData?.forks ?? null,
      downloads,
      packageName: clientData.npmData?.packageName ?? null,
      latestVersion: clientData.npmData?.version ?? releaseHighlights[0]?.version ?? null,
      tractionLabel,
    },
    release: {
      evidence: buildSectionEvidence({
        source: releaseHighlights.length > 0 ? sourceDisplayLabel(source) : "agent-index",
        verified: Boolean(executionMetricsRow?.lastVerifiedAt),
        confidence:
          releaseHighlights.length > 0 || supplemental?.lastCrawledAt ? "medium" : "low",
        updatedAt: maybeIso(supplemental?.lastCrawledAt) ?? publicData.updatedAtIso,
        emptyReason:
          releaseHighlights.length > 0 || supplemental?.lastCrawledAt
            ? null
            : "No release history or crawl freshness data is available.",
      }),
      lastUpdatedAt: publicData.updatedAtIso,
      lastCrawledAt: maybeIso(supplemental?.lastCrawledAt),
      lastIndexedAt: maybeIso(supplemental?.lastIndexedAt),
      nextCrawlAt: maybeIso(supplemental?.nextCrawlAt),
      lastVerifiedAt:
        maybeIso(executionMetricsRow?.lastVerifiedAt) ??
        publicData.machineBlocks.trustAndReliability.trustUpdatedAt,
      highlights: releaseHighlights,
    },
    execution: {
      evidence: executionEvidence,
      installCommand,
      setupComplexity: editorial.setupComplexity,
      setupSteps:
        hasRichEditorial && editorial.sections.setup.length > 0
          ? editorial.sections.setup
          : buildSetupFallback({
              installCommand,
              source,
              contractStatus: publicData.machineBlocks.executionContractSummary.contractStatus,
              authModes: publicData.machineBlocks.executionContractSummary.authModes,
              sourceUrl: publicData.sourceUrl,
            }),
      contract: publicData.machineBlocks.executionContractSummary,
      invocationGuide: publicData.machineBlocks.invocationGuide,
      endpoints: {
        dossierUrl: `${publicData.canonicalUrl.replace(/\/agent\/.+$/, "")}/api/v1/agents/${encodeURIComponent(publicData.slug)}/dossier`,
        snapshotUrl: publicData.snapshotUrl,
        contractUrl: publicData.contractUrl,
        trustUrl: publicData.trustUrl,
      },
    },
    reliability: {
      evidence: buildSectionEvidence({
        source:
          publicData.machineBlocks.trustAndReliability.status === "ready"
            ? "trust-telemetry"
            : hasRuntimeMetricsTable || hasExecutionMetricsTable
              ? "runtime-metrics"
              : "no-reliability-data",
        verified:
          publicData.machineBlocks.trustAndReliability.status === "ready" ||
          Boolean(executionMetricsRow?.lastVerifiedAt),
        confidence:
          publicData.machineBlocks.trustAndReliability.trustConfidence === "high"
            ? "high"
            : publicData.machineBlocks.trustAndReliability.trustConfidence === "medium"
              ? "medium"
              : "low",
        updatedAt:
          publicData.machineBlocks.trustAndReliability.trustUpdatedAt ??
          maybeIso(runtimeMetricsRow?.lastUpdated) ??
          maybeIso(executionMetricsRow?.lastVerifiedAt),
        emptyReason:
          publicData.machineBlocks.trustAndReliability.status === "ready" ||
          runtimeMetricsRow ||
          executionMetricsRow
            ? null
            : "No trust, reliability, or runtime telemetry is available.",
      }),
      trust: publicData.machineBlocks.trustAndReliability,
      decisionGuardrails: publicData.machineBlocks.decisionGuardrails,
      executionMetrics: {
        observedLatencyMsP50: executionMetricsRow?.observedLatencyMsP50 ?? null,
        observedLatencyMsP95: executionMetricsRow?.observedLatencyMsP95 ?? null,
        estimatedCostUsd: executionMetricsRow?.estimatedCostUsd ?? null,
        uptime30d: executionMetricsRow?.uptime30d ?? null,
        rateLimitRpm: executionMetricsRow?.rateLimitRpm ?? null,
        rateLimitBurst: executionMetricsRow?.rateLimitBurst ?? null,
        lastVerifiedAt: maybeIso(executionMetricsRow?.lastVerifiedAt),
        verificationSource: executionMetricsRow?.verificationSource ?? null,
      },
      runtimeMetrics: {
        successRate: runtimeMetricsRow?.successRate ?? null,
        avgLatencyMs: runtimeMetricsRow?.avgLatencyMs ?? null,
        avgCostUsd: runtimeMetricsRow?.avgCostUsd ?? null,
        hallucinationRate: runtimeMetricsRow?.hallucinationRate ?? null,
        retryRate: runtimeMetricsRow?.retryRate ?? null,
        disputeRate: runtimeMetricsRow?.disputeRate ?? null,
        p50Latency: runtimeMetricsRow?.p50Latency ?? null,
        p95Latency: runtimeMetricsRow?.p95Latency ?? null,
        lastUpdated: maybeIso(runtimeMetricsRow?.lastUpdated),
      },
    },
    benchmarks: {
      evidence: buildSectionEvidence({
        source:
          benchmarkRows.length > 0
            ? "benchmark-results"
            : failurePatternRows.length > 0
              ? "failure-patterns"
              : "no-benchmark-data",
        verified: benchmarkRows.length > 0,
        confidence:
          benchmarkRows.length > 0 ? "medium" : failurePatternRows.length > 0 ? "low" : "low",
        updatedAt:
          maybeIso(benchmarkRows[0]?.createdAt) ??
          maybeIso(failurePatternRows[0]?.lastSeen) ??
          null,
        emptyReason:
          benchmarkRows.length > 0 || failurePatternRows.length > 0
            ? null
            : "No benchmark suites or observed failure patterns are available.",
      }),
      suites: benchmarkRows.map((row) => ({
        suiteName: row.suiteName,
        score: Number(row.score ?? 0),
        accuracy: row.accuracy ?? null,
        latencyMs: row.latencyMs ?? null,
        costUsd: row.costUsd ?? null,
        safetyViolations: row.safetyViolations ?? null,
        createdAt: maybeIso(row.createdAt),
      })),
      failurePatterns: failurePatternRows.map((row) => ({
        type: row.type,
        frequency: row.frequency,
        lastSeen: maybeIso(row.lastSeen),
      })),
    },
    artifacts: {
      evidence: buildSectionEvidence({
        source:
          clientData.readme
            ? buildDocsSourceLabel(source)
            : normalizedClawhub?.extractedFiles.length
              ? sourceDisplayLabel(source)
              : "no-docs",
        verified: false,
        confidence:
          hasRichEditorial
            ? "high"
            : clientData.readme || normalizedClawhub?.extractedFiles.length
              ? "medium"
              : "low",
        updatedAt: editorial.lastReviewedAt ?? publicData.updatedAtIso,
        emptyReason:
          clientData.readme ||
          publicData.readmeExcerpt ||
          (clientData.codeSnippets ?? []).length > 0 ||
          normalizedClawhub?.extractedFiles.length
            ? null
            : "No documentation or extracted artifacts are available.",
      }),
      readme: clientData.readme ?? null,
      readmeExcerpt: publicData.readmeExcerpt,
      codeSnippets: dedupeStringArray(clientData.codeSnippets ?? []),
      executableExamples: extractExecutableExamples(clientData.readme ?? null).map((item) => ({
        language: item.language,
        snippet: item.snippet,
      })),
      parameters,
      dependencies,
      permissions,
      extractedFiles: normalizedClawhub?.extractedFiles ?? [],
      languages: dedupeStringArray(clientData.languages ?? []),
      docsSourceLabel: clientData.readme ? buildDocsSourceLabel(source) : null,
      editorialOverview: hasRichEditorial ? editorial.sections.overview : null,
      editorialQuality: editorial.quality,
    },
    media: {
      evidence: buildSectionEvidence({
        source:
          mediaRows.length > 0
            ? "agent-media-assets"
            : structuredLinks.demoUrl || supplemental?.primaryImageUrl
              ? "owner-or-source-media"
              : "no-media",
        verified: mediaRows.length > 0,
        confidence:
          mediaRows.length > 0
            ? "high"
            : structuredLinks.demoUrl || supplemental?.primaryImageUrl
              ? "medium"
              : "low",
        updatedAt: publicData.updatedAtIso,
        emptyReason:
          mediaRows.length > 0 || supplemental?.primaryImageUrl || structuredLinks.demoUrl
            ? null
            : "No screenshots, media assets, or demo links are available.",
      }),
      primaryImageUrl: supplemental?.primaryImageUrl ?? null,
      mediaAssetCount: supplemental?.mediaAssetCount ?? 0,
      assets: mediaRows.map((row) => ({
        url: row.url,
        title: row.title ?? null,
        caption: row.caption ?? null,
        altText: row.altText ?? null,
        assetKind: row.assetKind,
        sourcePageUrl: row.sourcePageUrl ?? null,
      })),
      demoUrl: structuredLinks.demoUrl,
    },
    ownerResources: {
      evidence: buildSectionEvidence({
        source: publicData.claimStatus === "CLAIMED" ? "claimed-owner" : "unclaimed",
        verified: publicData.claimStatus === "CLAIMED",
        confidence: publicData.claimStatus === "CLAIMED" ? "high" : "low",
        updatedAt: clientData.customPage?.updatedAt ?? publicData.updatedAtIso,
        emptyReason:
          publicData.claimStatus === "CLAIMED" ||
          customLinks.length > 0 ||
          Object.values(structuredLinks).some(Boolean)
            ? null
            : "This page has not been claimed by the agent owner.",
      }),
      hasCustomPage: Boolean((publicData.agentForClient as Record<string, unknown>)?.hasCustomPage),
      customPageUpdatedAt: clientData.customPage?.updatedAt ?? null,
      customLinks: customLinks.map((item) => ({
        label: item.label,
        url: item.url,
        kind: "custom",
      })),
      structuredLinks,
      customPage:
        clientData.customPage &&
        (clientData.customPage.html ||
          clientData.customPage.css ||
          clientData.customPage.js ||
          (Array.isArray(clientData.customPage.widgetLayout) &&
            clientData.customPage.widgetLayout.length > 0))
          ? {
              html: clientData.customPage.html,
              css: clientData.customPage.css,
              js: clientData.customPage.js,
              widgetLayout: clientData.customPage.widgetLayout ?? [],
              updatedAt: clientData.customPage.updatedAt ?? null,
            }
          : null,
    },
    relatedAgents: {
      evidence: buildSectionEvidence({
        source: relatedAgents.length > 0 ? "protocol-neighbors" : "agent-directory",
        verified: false,
        confidence: relatedAgents.length > 0 ? "medium" : "low",
        updatedAt: generatedAt,
        emptyReason: relatedAgents.length > 0 ? null : "No close protocol neighbors were found.",
      }),
      items: relatedAgents,
      links: {
        hub: "/agent",
        source: `/agent/source/${encodeURIComponent(sourceSlugFromValue(source))}`,
        protocols: publicData.protocols.map((protocol) => ({
          label: toProtocolLabel(protocol),
          href: `/agent/protocol/${encodeURIComponent(protocol.toLowerCase())}`,
        })),
      },
    },
  };
}

export function summarizeReliabilityChips(dossier: AgentDossier): string[] {
  const chips: string[] = [];
  chips.push(
    dossier.coverage.verifiedCount > 0
      ? `${dossier.coverage.verifiedCount} verified compatibility signal${dossier.coverage.verifiedCount === 1 ? "" : "s"}`
      : "No verified compatibility signals"
  );
  if (dossier.reliability.trust.reputationScore != null) {
    chips.push(`Reputation ${dossier.reliability.trust.reputationScore}`);
  }
  if (dossier.adoption.tractionLabel) {
    chips.push(dossier.adoption.tractionLabel);
  }
  if (dossier.release.lastVerifiedAt) {
    chips.push(`Verified ${new Date(dossier.release.lastVerifiedAt).toLocaleDateString("en-US")}`);
  }
  return chips;
}

export function summarizeReliabilityStats(dossier: AgentDossier): Array<{ label: string; value: string }> {
  const stats: Array<{ label: string; value: string }> = [];
  const successRate =
    toPercent(dossier.reliability.trust.successRate30d) ??
    toPercent(dossier.reliability.runtimeMetrics.successRate);
  if (successRate) stats.push({ label: "Success", value: successRate });

  const latency =
    toMs(dossier.reliability.trust.p95LatencyMs) ??
    toMs(dossier.reliability.executionMetrics.observedLatencyMsP95) ??
    toMs(dossier.reliability.runtimeMetrics.p95Latency);
  if (latency) stats.push({ label: "P95 latency", value: latency });

  const uptime = toPercent(dossier.reliability.executionMetrics.uptime30d);
  if (uptime) stats.push({ label: "Uptime 30d", value: uptime });

  const retryRate = toPercent(dossier.reliability.runtimeMetrics.retryRate);
  if (retryRate) stats.push({ label: "Retry rate", value: retryRate });

  const cost =
    toUsd(dossier.reliability.executionMetrics.estimatedCostUsd) ??
    toUsd(dossier.reliability.runtimeMetrics.avgCostUsd);
  if (cost) stats.push({ label: "Estimated cost", value: cost });

  return stats;
}
