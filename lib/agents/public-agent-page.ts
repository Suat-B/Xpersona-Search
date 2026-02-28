import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  agents,
  agentCapabilityContracts,
  agentCapabilityHandshakes,
  agentCustomizations,
  agentReputationSnapshots,
  users,
} from "@/lib/db/schema";
import { getTrustSummary } from "@/lib/trust/summary";
import { hasTrustTable } from "@/lib/trust/db";

export type ContractStatus = "ready" | "missing" | "unavailable";
export type TrustConfidence = "high" | "medium" | "low" | "unknown";
export type CapabilityConfidenceSource = "contract" | "profile" | "inferred";

export interface MachineIdentity {
  agentId: string;
  slug: string;
  canonicalUrl: string;
  snapshotUrl: string;
  contractUrl: string;
  trustUrl: string;
  source: string;
  sourceUrl: string;
  homepage: string | null;
  lastUpdated: string | null;
  generatedAt: string;
}

export interface ExecutionContractSummary {
  contractStatus: ContractStatus;
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
}

export interface TrustAndReliability {
  status: "ready" | "unavailable";
  handshakeStatus: string;
  verificationFreshnessHours: number | null;
  reputationScore: number | null;
  p95LatencyMs: number | null;
  successRate30d: number | null;
  fallbackRate: number | null;
  attempts30d: number | null;
  trustUpdatedAt: string | null;
  trustConfidence: TrustConfidence;
  sourceUpdatedAt: string | null;
  freshnessSeconds: number | null;
}

export interface InvocationGuide {
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
}

export interface DecisionGuardrails {
  doNotUseIf: string[];
  safeUseWhen: string[];
  riskFlags: string[];
  operationalConfidence: "high" | "medium" | "low";
}

export interface CapabilityMatrixRow {
  key: string;
  type: "protocol" | "capability";
  support: "supported" | "unknown";
  confidenceSource: CapabilityConfidenceSource;
  notes: string;
}

export interface MachineBlocks {
  schemaVersion: "agent-page-machine-v1";
  generatedAt: string;
  machineIdentity: MachineIdentity;
  executionContractSummary: ExecutionContractSummary;
  trustAndReliability: TrustAndReliability;
  invocationGuide: InvocationGuide;
  decisionGuardrails: DecisionGuardrails;
  capabilityMatrix: {
    rows: CapabilityMatrixRow[];
    flattenedTokens: string;
  };
}

export interface PublicAgentPageData {
  id: string;
  slug: string;
  name: string;
  description: string;
  url: string;
  homepage: string | null;
  source: string;
  capabilities: string[];
  protocols: string[];
  safetyScore: number;
  overallRank: number;
  claimStatus: string;
  verificationTier: string;
  hasCustomPage: boolean;
  trustScore: number | null;
  trust: Awaited<ReturnType<typeof getTrustSummary>>;
  claimedByName: string | null;
  readmeExcerpt: string | null;
  updatedAtIso: string | null;
  canonicalUrl: string;
  snapshotUrl: string;
  contractUrl: string;
  trustUrl: string;
  sourceUrl: string;
  keyLinks: Array<{ label: string; url: string }>;
  keywords: string[];
  structuredSummary: Array<{ label: string; value: string }>;
  agentForClient: Record<string, unknown>;
  machineBlocks: MachineBlocks;
}

function getBaseUrl(): string {
  return (
    process.env.NEXTAUTH_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

function toStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
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

function summarizeReadme(readme: string | null): string | null {
  if (!readme) return null;
  const plain = readme
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[[^\]]+\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!plain) return null;
  return plain.slice(0, 420);
}

function toTrustScore(reputationScore: number | null): number | null {
  if (reputationScore == null || !Number.isFinite(reputationScore)) return null;
  if (reputationScore <= 1 && reputationScore >= 0) return Number(reputationScore.toFixed(3));
  return Number(Math.max(0, Math.min(1, reputationScore / 100)).toFixed(3));
}

function toFreshnessSeconds(updatedAtIso: string | null, generatedAtIso: string): number | null {
  if (!updatedAtIso) return null;
  const updatedAtMs = Date.parse(updatedAtIso);
  const generatedAtMs = Date.parse(generatedAtIso);
  if (!Number.isFinite(updatedAtMs) || !Number.isFinite(generatedAtMs)) return null;
  return Math.max(0, Math.floor((generatedAtMs - updatedAtMs) / 1000));
}

function toTrustConfidence(input: { reputationScore: number | null; verificationFreshnessHours: number | null }): TrustConfidence {
  if (input.reputationScore == null && input.verificationFreshnessHours == null) return "unknown";
  const stale = input.verificationFreshnessHours != null && input.verificationFreshnessHours > 168;
  if (stale) return "low";
  if ((input.reputationScore ?? 0) >= 80) return "high";
  if ((input.reputationScore ?? 0) >= 50) return "medium";
  return "low";
}

function buildCapabilityMatrix(protocols: string[], capabilities: string[], contract: ExecutionContractSummary): { rows: CapabilityMatrixRow[]; flattenedTokens: string } {
  const rows: CapabilityMatrixRow[] = [];

  for (const protocol of protocols) {
    const key = protocol.toUpperCase();
    const explicitlySupported =
      (key === "MCP" && contract.supportsMcp) ||
      (key === "A2A" && contract.supportsA2a);

    rows.push({
      key,
      type: "protocol",
      support: explicitlySupported ? "supported" : "unknown",
      confidenceSource: explicitlySupported ? "contract" : "profile",
      notes: explicitlySupported ? "Confirmed by capability contract" : "Listed on profile",
    });
  }

  for (const capability of capabilities) {
    rows.push({
      key: capability,
      type: "capability",
      support: "supported",
      confidenceSource: "profile",
      notes: "Declared in agent profile metadata",
    });
  }

  const flattenedTokens = rows
    .map((row) => `${row.type}:${row.key}|${row.support}|${row.confidenceSource}`)
    .join(" ");

  return { rows, flattenedTokens };
}

export function shouldEnableMachineBlocks(slug: string): boolean {
  return true;
}

export async function getPublicAgentPageData(slug: string): Promise<PublicAgentPageData | null> {
  const rows = await db
    .select({
      id: agents.id,
      sourceId: agents.sourceId,
      source: agents.source,
      name: agents.name,
      slug: agents.slug,
      description: agents.description,
      url: agents.url,
      homepage: agents.homepage,
      capabilities: agents.capabilities,
      protocols: agents.protocols,
      languages: agents.languages,
      githubData: agents.githubData,
      npmData: agents.npmData,
      readme: agents.readme,
      codeSnippets: agents.codeSnippets,
      openclawData: agents.openclawData,
      safetyScore: agents.safetyScore,
      popularityScore: agents.popularityScore,
      overallRank: agents.overallRank,
      claimedByUserId: agents.claimedByUserId,
      claimedAt: agents.claimedAt,
      claimStatus: agents.claimStatus,
      ownerOverrides: agents.ownerOverrides,
      verificationTier: agents.verificationTier,
      hasCustomPage: agents.hasCustomPage,
      updatedAt: agents.updatedAt,
    })
    .from(agents)
    .where(and(eq(agents.slug, slug), eq(agents.status, "ACTIVE")))
    .limit(1);

  const rawAgent = rows[0];
  if (!rawAgent) return null;

  const overrides = (rawAgent.ownerOverrides ?? {}) as Record<string, unknown>;
  const merged = { ...rawAgent } as Record<string, unknown>;
  const claimStatus = (rawAgent.claimStatus as string | null) ?? "UNCLAIMED";
  merged.claimStatus = claimStatus;

  if (claimStatus === "CLAIMED" && Object.keys(overrides).length > 0) {
    for (const [key, value] of Object.entries(overrides)) {
      if (key !== "customLinks" && value !== undefined) {
        merged[key] = value;
      }
    }
    if (overrides.customLinks) merged.customLinks = overrides.customLinks;
  }

  let claimedByName: string | null = null;
  if (rawAgent.claimedByUserId) {
    const [owner] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, rawAgent.claimedByUserId))
      .limit(1);
    claimedByName = owner?.name ?? "Verified Owner";
  }

  const trust = await getTrustSummary(rawAgent.id);
  const trustScore = toTrustScore(trust?.reputationScore ?? null);

  const hasContracts = await hasTrustTable("agent_capability_contracts");
  const hasHandshake = await hasTrustTable("agent_capability_handshakes");
  const hasReputation = await hasTrustTable("agent_reputation_snapshots");

  const [contractRow] = hasContracts
    ? await db
      .select({
        authModes: agentCapabilityContracts.authModes,
        requires: agentCapabilityContracts.requires,
        forbidden: agentCapabilityContracts.forbidden,
        dataRegion: agentCapabilityContracts.dataRegion,
        inputSchemaRef: agentCapabilityContracts.inputSchemaRef,
        outputSchemaRef: agentCapabilityContracts.outputSchemaRef,
        supportsStreaming: agentCapabilityContracts.supportsStreaming,
        supportsMcp: agentCapabilityContracts.supportsMcp,
        supportsA2a: agentCapabilityContracts.supportsA2a,
        updatedAt: agentCapabilityContracts.updatedAt,
      })
      .from(agentCapabilityContracts)
      .where(eq(agentCapabilityContracts.agentId, rawAgent.id))
      .limit(1)
    : [];

  const [handshakeRow] = hasHandshake
    ? await db
      .select({
        status: agentCapabilityHandshakes.status,
        verifiedAt: agentCapabilityHandshakes.verifiedAt,
      })
      .from(agentCapabilityHandshakes)
      .where(eq(agentCapabilityHandshakes.agentId, rawAgent.id))
      .orderBy(desc(agentCapabilityHandshakes.verifiedAt))
      .limit(1)
    : [];

  const [reputationRow] = hasReputation
    ? await db
      .select({
        scoreTotal: agentReputationSnapshots.scoreTotal,
        attempts30d: agentReputationSnapshots.attempts30d,
        successRate30d: agentReputationSnapshots.successRate30d,
        p95LatencyMs: agentReputationSnapshots.p95LatencyMs,
        fallbackRate: agentReputationSnapshots.fallbackRate,
        computedAt: agentReputationSnapshots.computedAt,
      })
      .from(agentReputationSnapshots)
      .where(eq(agentReputationSnapshots.agentId, rawAgent.id))
      .orderBy(desc(agentReputationSnapshots.computedAt))
      .limit(1)
    : [];

  let customPage: {
    html: string;
    css: string;
    js: string;
    widgetLayout: unknown[];
    updatedAt: string | null;
  } | null = null;

  if (Boolean(rawAgent.hasCustomPage)) {
    const [customization] = await db
      .select({
        status: agentCustomizations.status,
        sanitizedHtml: agentCustomizations.sanitizedHtml,
        sanitizedCss: agentCustomizations.sanitizedCss,
        sanitizedJs: agentCustomizations.sanitizedJs,
        widgetLayout: agentCustomizations.widgetLayout,
        updatedAt: agentCustomizations.updatedAt,
      })
      .from(agentCustomizations)
      .where(eq(agentCustomizations.agentId, rawAgent.id))
      .limit(1);

    if (customization && customization.status === "PUBLISHED") {
      customPage = {
        html: customization.sanitizedHtml ?? "",
        css: customization.sanitizedCss ?? "",
        js: customization.sanitizedJs ?? "",
        widgetLayout: customization.widgetLayout ?? [],
        updatedAt: customization.updatedAt?.toISOString() ?? null,
      };
    }
  }

  const generatedAt = new Date().toISOString();
  const baseUrl = getBaseUrl();
  const canonicalUrl = `${baseUrl}/agent/${encodeURIComponent(slug)}`;
  const snapshotUrl = `${baseUrl}/api/v1/agents/${encodeURIComponent(slug)}/snapshot`;
  const contractUrl = `${baseUrl}/api/v1/agents/${encodeURIComponent(slug)}/contract`;
  const trustUrl = `${baseUrl}/api/v1/agents/${encodeURIComponent(slug)}/trust`;
  const sourceUrl = ensureExternalUrl(String((merged.url as string | null) ?? ""));
  const homepage = merged.homepage ? String(merged.homepage) : null;
  const homepageUrl = ensureExternalUrl(homepage);

  const capabilities = toStringArray(merged.capabilities);
  const protocols = toStringArray(merged.protocols);
  const description =
    (typeof merged.description === "string" && merged.description.trim()) ||
    `OpenClaw agent: ${String(merged.name ?? "Agent")}`;

  const readmeExcerpt = summarizeReadme(typeof merged.readme === "string" ? merged.readme : null);

  const keyLinks: Array<{ label: string; url: string }> = [];
  if (homepageUrl) keyLinks.push({ label: "Homepage", url: homepageUrl });
  if (sourceUrl) keyLinks.push({ label: "Source", url: sourceUrl });
  keyLinks.push({ label: "Snapshot API", url: snapshotUrl });
  keyLinks.push({ label: "Contract API", url: contractUrl });
  keyLinks.push({ label: "Trust API", url: trustUrl });

  const contractUpdatedAt = contractRow?.updatedAt?.toISOString() ?? null;
  const executionContractSummary: ExecutionContractSummary = {
    contractStatus: !hasContracts ? "unavailable" : contractRow ? "ready" : "missing",
    authModes: toStringArray(contractRow?.authModes),
    requires: toStringArray(contractRow?.requires),
    forbidden: toStringArray(contractRow?.forbidden),
    supportsMcp: Boolean(contractRow?.supportsMcp),
    supportsA2a: Boolean(contractRow?.supportsA2a),
    supportsStreaming: Boolean(contractRow?.supportsStreaming),
    inputSchemaRef: contractRow?.inputSchemaRef ?? null,
    outputSchemaRef: contractRow?.outputSchemaRef ?? null,
    dataRegion: contractRow?.dataRegion ?? null,
    contractUpdatedAt,
    sourceUpdatedAt: contractUpdatedAt,
    freshnessSeconds: toFreshnessSeconds(contractUpdatedAt, generatedAt),
  };

  const trustUpdatedAt =
    handshakeRow?.verifiedAt?.toISOString() ?? reputationRow?.computedAt?.toISOString() ?? trust?.lastVerifiedAt ?? null;
  const trustAndReliability: TrustAndReliability = {
    status: hasHandshake || hasReputation ? "ready" : "unavailable",
    handshakeStatus: handshakeRow?.status ?? trust?.handshakeStatus ?? "UNKNOWN",
    verificationFreshnessHours: trust?.verificationFreshnessHours ?? null,
    reputationScore: reputationRow?.scoreTotal ?? trust?.reputationScore ?? null,
    p95LatencyMs: reputationRow?.p95LatencyMs ?? null,
    successRate30d: reputationRow?.successRate30d ?? null,
    fallbackRate: reputationRow?.fallbackRate ?? null,
    attempts30d: reputationRow?.attempts30d ?? null,
    trustUpdatedAt,
    trustConfidence: toTrustConfidence({
      reputationScore: reputationRow?.scoreTotal ?? trust?.reputationScore ?? null,
      verificationFreshnessHours: trust?.verificationFreshnessHours ?? null,
    }),
    sourceUpdatedAt: trustUpdatedAt,
    freshnessSeconds: toFreshnessSeconds(trustUpdatedAt, generatedAt),
  };

  const invocationGuide: InvocationGuide = {
    preferredApi: {
      snapshotUrl,
      contractUrl,
      trustUrl,
    },
    curlExamples: [
      `curl -s "${snapshotUrl}"`,
      `curl -s "${contractUrl}"`,
      `curl -s "${trustUrl}"`,
    ],
    jsonRequestTemplate: {
      query: "summarize this repo",
      constraints: {
        maxLatencyMs: 2000,
        protocolPreference: protocols,
      },
    },
    jsonResponseTemplate: {
      ok: true,
      result: {
        summary: "...",
        confidence: 0.9,
      },
      meta: {
        source: String(merged.source ?? "UNKNOWN"),
        generatedAt,
      },
    },
    retryPolicy: {
      maxAttempts: 3,
      backoffMs: [500, 1500, 3500],
      retryableConditions: ["HTTP_429", "HTTP_503", "NETWORK_TIMEOUT"],
    },
  };

  const riskFlags: string[] = [];
  const doNotUseIf: string[] = [];
  const safeUseWhen: string[] = [];

  if (executionContractSummary.contractStatus !== "ready") {
    riskFlags.push("missing_or_unavailable_contract");
    doNotUseIf.push("Contract metadata is missing or unavailable for deterministic execution.");
  }

  if (trustAndReliability.trustConfidence === "low") {
    riskFlags.push("low_trust_confidence");
    doNotUseIf.push("Trust confidence is low or stale beyond acceptable policy.");
  }

  if (trustAndReliability.status === "unavailable") {
    riskFlags.push("trust_data_unavailable");
  }

  if (!executionContractSummary.inputSchemaRef || !executionContractSummary.outputSchemaRef) {
    riskFlags.push("schema_references_missing");
  }

  if (executionContractSummary.contractStatus === "ready" && trustAndReliability.trustConfidence !== "low") {
    safeUseWhen.push("Contract is available with explicit auth and schema references.");
    safeUseWhen.push("Trust confidence is not low and verification freshness is acceptable.");
  }

  if (executionContractSummary.supportsMcp || executionContractSummary.supportsA2a) {
    safeUseWhen.push("Protocol support is explicitly confirmed in contract metadata.");
  }

  const decisionGuardrails: DecisionGuardrails = {
    doNotUseIf,
    safeUseWhen,
    riskFlags,
    operationalConfidence:
      doNotUseIf.length > 0
        ? "low"
        : trustAndReliability.trustConfidence === "high"
          ? "high"
          : "medium",
  };

  const capabilityMatrix = buildCapabilityMatrix(protocols, capabilities, executionContractSummary);

  const machineIdentity: MachineIdentity = {
    agentId: rawAgent.id,
    slug: String(merged.slug ?? slug),
    canonicalUrl,
    snapshotUrl,
    contractUrl,
    trustUrl,
    source: String(merged.source ?? "UNKNOWN"),
    sourceUrl,
    homepage,
    lastUpdated: rawAgent.updatedAt?.toISOString?.() ?? null,
    generatedAt,
  };

  const machineBlocks: MachineBlocks = {
    schemaVersion: "agent-page-machine-v1",
    generatedAt,
    machineIdentity,
    executionContractSummary,
    trustAndReliability,
    invocationGuide,
    decisionGuardrails,
    capabilityMatrix,
  };

  const structuredSummary: Array<{ label: string; value: string }> = [
    { label: "Name", value: String(merged.name ?? "Agent") },
    { label: "Slug", value: String(merged.slug ?? slug) },
    { label: "Source", value: String(merged.source ?? "UNKNOWN") },
    { label: "Claim Status", value: claimStatus },
    { label: "Verification Tier", value: String(merged.verificationTier ?? "NONE") },
    { label: "Trust Score", value: trustScore == null ? "unknown" : String(trustScore) },
    { label: "Overall Rank", value: String(merged.overallRank ?? 0) },
    { label: "Machine Schema", value: machineBlocks.schemaVersion },
    { label: "Operational Confidence", value: decisionGuardrails.operationalConfidence },
  ];

  const agentForClient = {
    ...merged,
    description,
    capabilities,
    protocols,
    claimStatus,
    verificationTier: String(merged.verificationTier ?? "NONE"),
    hasCustomPage: Boolean(merged.hasCustomPage),
    claimedByName,
    isOwner: false,
    trust,
    customPage,
  } as Record<string, unknown>;

  return {
    id: rawAgent.id,
    slug: String(merged.slug ?? slug),
    name: String(merged.name ?? "Agent"),
    description,
    url: sourceUrl,
    homepage,
    source: String(merged.source ?? "UNKNOWN"),
    capabilities,
    protocols,
    safetyScore: Number(merged.safetyScore ?? 0),
    overallRank: Number(merged.overallRank ?? 0),
    claimStatus,
    verificationTier: String(merged.verificationTier ?? "NONE"),
    hasCustomPage: Boolean(merged.hasCustomPage),
    trustScore,
    trust,
    claimedByName,
    readmeExcerpt,
    updatedAtIso: rawAgent.updatedAt?.toISOString?.() ?? null,
    canonicalUrl,
    snapshotUrl,
    contractUrl,
    trustUrl,
    sourceUrl,
    keyLinks,
    keywords: [...protocols.slice(0, 8), ...capabilities.slice(0, 8)],
    structuredSummary,
    machineBlocks,
    agentForClient,
  };
}
