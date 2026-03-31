import { and, desc, eq, sql } from "drizzle-orm";
import type { AgentCard } from "@/lib/agents/agent-card";
import { buildAgentCard } from "@/lib/agents/agent-card";
import { getAgentDossier, type AgentDossier } from "@/lib/agents/agent-dossier";
import { getPublicAgentPageData, type PublicAgentPageData } from "@/lib/agents/public-agent-page";
import { db } from "@/lib/db";
import {
  agentChangeEvents,
  agentFacts,
  agentMediaAssets,
  searchDocuments,
} from "@/lib/db/schema";

export type PublicAgentFactCategory =
  | "identity"
  | "vendor"
  | "compatibility"
  | "artifact"
  | "release"
  | "adoption"
  | "security"
  | "pricing"
  | "benchmark"
  | "integration"
  | "learning_asset";

export type PublicAgentFactSourceType =
  | "derived"
  | "profile"
  | "contract"
  | "trust"
  | "benchmark"
  | "media"
  | "release"
  | "search_document"
  | "owner";

export type PublicAgentFactConfidence = "high" | "medium" | "low";

export type PublicAgentChangeEventType =
  | "release"
  | "docs_update"
  | "artifact_added"
  | "benchmark_result"
  | "trust_refresh"
  | "pricing_changed"
  | "status_changed";

export interface PublicAgentFact {
  factKey: string;
  label: string;
  value: string;
  category: PublicAgentFactCategory;
  href: string | null;
  sourceUrl: string;
  sourceType: PublicAgentFactSourceType;
  confidence: PublicAgentFactConfidence;
  observedAt: string | null;
  isPublic: boolean;
  metadata?: Record<string, unknown>;
}

export interface PublicAgentChangeEvent {
  eventType: PublicAgentChangeEventType;
  title: string;
  description: string | null;
  href: string | null;
  sourceUrl: string | null;
  sourceType: PublicAgentFactSourceType;
  confidence: PublicAgentFactConfidence;
  observedAt: string | null;
  isPublic: boolean;
  metadata?: Record<string, unknown>;
}

export interface PublicAgentCardSummary {
  id: string;
  slug: string;
  name: string;
  description: string;
  canonicalUrl: string;
  sourceUrl: string;
  homepage: string | null;
  source: string;
  vendor: {
    slug: string | null;
    label: string | null;
    url: string | null;
  };
  protocols: string[];
  capabilities: string[];
  trustScore: number | null;
  trustConfidence: string | null;
  artifactCount: number;
  benchmarkCount: number;
  lastRelease: string | null;
  freshnessAt: string | null;
  freshnessLabel: string | null;
  securityReviewed: boolean;
  openapiReady: boolean;
  stats: Array<{ label: string; value: string }>;
  factsPreview: PublicAgentFact[];
  highlights: string[];
  agentCard: AgentCard;
}

export interface PublicAgentEvidencePack {
  card: PublicAgentCardSummary;
  facts: PublicAgentFact[];
  changeEvents: PublicAgentChangeEvent[];
}

type VendorInfo = {
  slug: string | null;
  label: string | null;
  url: string | null;
};

type PublicMediaAssetRow = {
  url: string;
  title: string | null;
  assetKind: string;
  artifactType: string | null;
  sourcePageUrl: string | null;
  updatedAt: Date | null;
};

type PublicDocumentRow = {
  canonicalUrl: string;
  title: string | null;
  indexedAt: Date | null;
};

const OPTIONAL_TABLE_CACHE = new Map<string, boolean>();

function maybeIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function humanizeToken(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function slugifyToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatDateLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatPercent(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const normalized = value <= 1 ? value * 100 : value;
  return `${normalized.toFixed(normalized >= 10 ? 0 : 1)}%`;
}

function formatCurrency(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1 ? 2 : 4,
  }).format(value);
}

function normalizeConfidence(value: string | null | undefined): PublicAgentFactConfidence {
  if (value === "high" || value === "medium" || value === "low") return value;
  return "medium";
}

function normalizeSourceType(value: string | null | undefined): PublicAgentFactSourceType {
  switch (value) {
    case "profile":
    case "contract":
    case "trust":
    case "benchmark":
    case "media":
    case "release":
    case "search_document":
    case "owner":
      return value;
    default:
      return "derived";
  }
}

async function hasOptionalTable(tableName: string): Promise<boolean> {
  if (OPTIONAL_TABLE_CACHE.has(tableName)) return OPTIONAL_TABLE_CACHE.get(tableName) ?? false;
  try {
    const result = await db.execute(sql`SELECT to_regclass(${`public.${tableName}`}) AS regclass`);
    const rows = (result as unknown as { rows?: Array<{ regclass?: string | null }> }).rows ?? [];
    const exists = Boolean(rows[0]?.regclass);
    OPTIONAL_TABLE_CACHE.set(tableName, exists);
    return exists;
  } catch {
    OPTIONAL_TABLE_CACHE.set(tableName, false);
    return false;
  }
}

function getDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function deriveVendorTokenFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.toLowerCase().endsWith("github.com")) {
      const owner = parsed.pathname.split("/").filter(Boolean)[0];
      return owner ? slugifyToken(owner) : null;
    }
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const parts = hostname.split(".");
    if (parts.length === 0) return null;
    if (parts.length === 1) return slugifyToken(parts[0]);
    return slugifyToken(parts[parts.length - 2] ?? parts[0] ?? "");
  } catch {
    return null;
  }
}

function deriveVendorInfo(input: { homepage: string | null; sourceUrl: string }): VendorInfo {
  const token =
    deriveVendorTokenFromUrl(input.homepage) ??
    deriveVendorTokenFromUrl(input.sourceUrl) ??
    null;
  return {
    slug: token,
    label: token ? humanizeToken(token) : null,
    url: input.homepage || input.sourceUrl || null,
  };
}

function isLearningAsset(asset: PublicMediaAssetRow): boolean {
  const haystack = `${asset.assetKind} ${asset.artifactType ?? ""} ${asset.title ?? ""} ${asset.url}`.toLowerCase();
  return (
    haystack.includes("video") ||
    haystack.includes("tutorial") ||
    haystack.includes("demo") ||
    haystack.includes("walkthrough") ||
    haystack.includes("youtube") ||
    haystack.includes("loom") ||
    haystack.includes("vimeo")
  );
}

function isSchemaAsset(asset: PublicMediaAssetRow): boolean {
  const haystack = `${asset.assetKind} ${asset.artifactType ?? ""} ${asset.title ?? ""} ${asset.url}`.toLowerCase();
  return (
    haystack.includes("openapi") ||
    haystack.includes("swagger") ||
    haystack.includes("schema") ||
    haystack.includes("manifest") ||
    haystack.includes("model-card")
  );
}

function dedupeFacts(facts: PublicAgentFact[]): PublicAgentFact[] {
  const seen = new Set<string>();
  return facts.filter((fact) => {
    const key = `${fact.factKey}::${fact.value}::${fact.sourceUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeEvents(events: PublicAgentChangeEvent[]): PublicAgentChangeEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = `${event.eventType}::${event.title}::${event.observedAt ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortFactsByObservedAt(facts: PublicAgentFact[]): PublicAgentFact[] {
  return [...facts].sort((a, b) => {
    const aTime = a.observedAt ? Date.parse(a.observedAt) : 0;
    const bTime = b.observedAt ? Date.parse(b.observedAt) : 0;
    return bTime - aTime;
  });
}

function sortEventsByObservedAt(events: PublicAgentChangeEvent[]): PublicAgentChangeEvent[] {
  return [...events].sort((a, b) => {
    const aTime = a.observedAt ? Date.parse(a.observedAt) : 0;
    const bTime = b.observedAt ? Date.parse(b.observedAt) : 0;
    return bTime - aTime;
  });
}

async function getStoredFacts(agentId: string): Promise<PublicAgentFact[]> {
  if (!(await hasOptionalTable("agent_facts"))) return [];
  const rows = await db
    .select({
      factKey: agentFacts.factKey,
      category: agentFacts.category,
      label: agentFacts.label,
      value: agentFacts.value,
      href: agentFacts.href,
      sourceUrl: agentFacts.sourceUrl,
      sourceType: agentFacts.sourceType,
      confidence: agentFacts.confidence,
      observedAt: agentFacts.observedAt,
      isPublic: agentFacts.isPublic,
      metadata: agentFacts.metadata,
      position: agentFacts.position,
    })
    .from(agentFacts)
    .where(and(eq(agentFacts.agentId, agentId), eq(agentFacts.isPublic, true)))
    .orderBy(agentFacts.position, desc(agentFacts.observedAt), agentFacts.label);

  return rows.map((row) => ({
    factKey: row.factKey,
    label: row.label,
    value: row.value,
    category: row.category as PublicAgentFactCategory,
    href: row.href ?? null,
    sourceUrl: row.sourceUrl ?? "",
    sourceType: normalizeSourceType(row.sourceType),
    confidence: normalizeConfidence(row.confidence),
    observedAt: maybeIso(row.observedAt),
    isPublic: Boolean(row.isPublic),
    metadata: (row.metadata ?? undefined) as Record<string, unknown> | undefined,
  }));
}

async function getStoredChangeEvents(agentId: string): Promise<PublicAgentChangeEvent[]> {
  if (!(await hasOptionalTable("agent_change_events"))) return [];
  const rows = await db
    .select({
      eventType: agentChangeEvents.eventType,
      title: agentChangeEvents.title,
      description: agentChangeEvents.description,
      href: agentChangeEvents.href,
      sourceUrl: agentChangeEvents.sourceUrl,
      sourceType: agentChangeEvents.sourceType,
      confidence: agentChangeEvents.confidence,
      observedAt: agentChangeEvents.observedAt,
      isPublic: agentChangeEvents.isPublic,
      metadata: agentChangeEvents.metadata,
    })
    .from(agentChangeEvents)
    .where(and(eq(agentChangeEvents.agentId, agentId), eq(agentChangeEvents.isPublic, true)))
    .orderBy(desc(agentChangeEvents.observedAt), agentChangeEvents.title);

  return rows.map((row) => ({
    eventType: row.eventType as PublicAgentChangeEventType,
    title: row.title,
    description: row.description ?? null,
    href: row.href ?? null,
    sourceUrl: row.sourceUrl ?? null,
    sourceType: normalizeSourceType(row.sourceType),
    confidence: normalizeConfidence(row.confidence),
    observedAt: maybeIso(row.observedAt),
    isPublic: Boolean(row.isPublic),
    metadata: (row.metadata ?? undefined) as Record<string, unknown> | undefined,
  }));
}

async function getPublicMediaAssets(agentId: string): Promise<PublicMediaAssetRow[]> {
  const rows = await db
    .select({
      url: agentMediaAssets.url,
      title: agentMediaAssets.title,
      assetKind: agentMediaAssets.assetKind,
      artifactType: agentMediaAssets.artifactType,
      sourcePageUrl: agentMediaAssets.sourcePageUrl,
      updatedAt: agentMediaAssets.updatedAt,
    })
    .from(agentMediaAssets)
    .where(
      and(
        eq(agentMediaAssets.agentId, agentId),
        eq(agentMediaAssets.isPublic, true),
        eq(agentMediaAssets.isDead, false)
      )
    )
    .orderBy(desc(agentMediaAssets.rankScore), desc(agentMediaAssets.updatedAt))
    .limit(24);

  return rows.map((row) => ({
    url: row.url,
    title: row.title ?? null,
    assetKind: row.assetKind,
    artifactType: row.artifactType ?? null,
    sourcePageUrl: row.sourcePageUrl ?? null,
    updatedAt: row.updatedAt ?? null,
  }));
}

async function getRelatedDocuments(publicData: PublicAgentPageData): Promise<PublicDocumentRow[]> {
  if (!(await hasOptionalTable("search_documents"))) return [];
  const domain = getDomain(publicData.homepage) ?? getDomain(publicData.sourceUrl) ?? null;
  if (!domain) return [];

  const rows = await db
    .select({
      canonicalUrl: searchDocuments.canonicalUrl,
      title: searchDocuments.title,
      indexedAt: searchDocuments.indexedAt,
    })
    .from(searchDocuments)
    .where(and(eq(searchDocuments.domain, domain), eq(searchDocuments.isPublic, true)))
    .orderBy(desc(searchDocuments.indexedAt))
    .limit(6);

  return rows.map((row) => ({
    canonicalUrl: row.canonicalUrl,
    title: row.title ?? null,
    indexedAt: row.indexedAt ?? null,
  }));
}

function buildDerivedFacts(input: {
  publicData: PublicAgentPageData;
  dossier: AgentDossier;
  vendor: VendorInfo;
  mediaAssets: PublicMediaAssetRow[];
  documents: PublicDocumentRow[];
}): PublicAgentFact[] {
  const { publicData, dossier, vendor, mediaAssets, documents } = input;
  const latestRelease = dossier.release.highlights[0];
  const learningAssets = mediaAssets.filter(isLearningAsset);
  const schemaAssets = mediaAssets.filter(isSchemaAsset);
  const protocolValue = dossier.coverage.protocols.map((item) => item.label).join(", ");
  const authModes = publicData.machineBlocks.executionContractSummary.authModes.join(", ");
  const facts: PublicAgentFact[] = [];

  if (vendor.label && vendor.url) {
    facts.push({
      factKey: "vendor",
      category: "vendor",
      label: "Vendor",
      value: vendor.label,
      href: vendor.url,
      sourceUrl: vendor.url,
      sourceType: "profile",
      confidence: "medium",
      observedAt: publicData.updatedAtIso,
      isPublic: true,
    });
  }

  if (protocolValue) {
    facts.push({
      factKey: "protocols",
      category: "compatibility",
      label: "Protocol compatibility",
      value: protocolValue,
      href: publicData.contractUrl,
      sourceUrl: publicData.contractUrl,
      sourceType: "contract",
      confidence: dossier.coverage.verifiedCount > 0 ? "high" : "medium",
      observedAt: publicData.machineBlocks.executionContractSummary.contractUpdatedAt ?? publicData.updatedAtIso,
      isPublic: true,
    });
  }

  if (authModes) {
    facts.push({
      factKey: "auth_modes",
      category: "compatibility",
      label: "Auth modes",
      value: authModes,
      href: publicData.contractUrl,
      sourceUrl: publicData.contractUrl,
      sourceType: "contract",
      confidence: "high",
      observedAt: publicData.machineBlocks.executionContractSummary.contractUpdatedAt,
      isPublic: true,
    });
  }

  if (
    publicData.machineBlocks.executionContractSummary.inputSchemaRef ||
    publicData.machineBlocks.executionContractSummary.outputSchemaRef
  ) {
    facts.push({
      factKey: "schema_refs",
      category: "artifact",
      label: "Machine-readable schemas",
      value: "OpenAPI or schema references published",
      href:
        publicData.machineBlocks.executionContractSummary.inputSchemaRef ??
        publicData.machineBlocks.executionContractSummary.outputSchemaRef,
      sourceUrl: publicData.contractUrl,
      sourceType: "contract",
      confidence: "high",
      observedAt: publicData.machineBlocks.executionContractSummary.contractUpdatedAt,
      isPublic: true,
    });
  }

  if (mediaAssets.length > 0) {
    facts.push({
      factKey: "artifact_count",
      category: "artifact",
      label: "Public artifacts",
      value: `${mediaAssets.length} crawlable asset${mediaAssets.length === 1 ? "" : "s"}`,
      href: mediaAssets[0]?.url ?? publicData.canonicalUrl,
      sourceUrl: mediaAssets[0]?.sourcePageUrl ?? mediaAssets[0]?.url ?? publicData.canonicalUrl,
      sourceType: "media",
      confidence: "medium",
      observedAt: maybeIso(mediaAssets[0]?.updatedAt),
      isPublic: true,
    });
  }

  if (schemaAssets.length > 0) {
    facts.push({
      factKey: "artifact_gallery",
      category: "artifact",
      label: "Schema-heavy artifacts",
      value: `${schemaAssets.length} schema or manifest artifact${schemaAssets.length === 1 ? "" : "s"} discovered`,
      href: schemaAssets[0]?.url ?? publicData.canonicalUrl,
      sourceUrl: schemaAssets[0]?.sourcePageUrl ?? schemaAssets[0]?.url ?? publicData.canonicalUrl,
      sourceType: "media",
      confidence: "medium",
      observedAt: maybeIso(schemaAssets[0]?.updatedAt),
      isPublic: true,
    });
  }

  if (latestRelease?.version) {
    facts.push({
      factKey: "latest_release",
      category: "release",
      label: "Latest release",
      value: latestRelease.version,
      href: publicData.sourceUrl,
      sourceUrl: publicData.sourceUrl,
      sourceType: "release",
      confidence: "medium",
      observedAt: maybeIso(latestRelease.createdAt) ?? dossier.release.lastUpdatedAt,
      isPublic: true,
    });
  }

  if (dossier.adoption.tractionLabel) {
    facts.push({
      factKey: "traction",
      category: "adoption",
      label: "Adoption signal",
      value: dossier.adoption.tractionLabel,
      href: publicData.sourceUrl,
      sourceUrl: publicData.sourceUrl,
      sourceType: "profile",
      confidence: "medium",
      observedAt: publicData.updatedAtIso,
      isPublic: true,
    });
  }

  if (dossier.reliability.trust.handshakeStatus) {
    facts.push({
      factKey: "handshake_status",
      category: "security",
      label: "Handshake status",
      value: dossier.reliability.trust.handshakeStatus,
      href: publicData.trustUrl,
      sourceUrl: publicData.trustUrl,
      sourceType: "trust",
      confidence: dossier.reliability.trust.trustConfidence === "high" ? "high" : "medium",
      observedAt: dossier.reliability.trust.trustUpdatedAt,
      isPublic: true,
    });
  }

  if (dossier.reliability.trust.verificationFreshnessHours != null) {
    facts.push({
      factKey: "verification_freshness",
      category: "security",
      label: "Verification freshness",
      value: `${dossier.reliability.trust.verificationFreshnessHours}h`,
      href: publicData.trustUrl,
      sourceUrl: publicData.trustUrl,
      sourceType: "trust",
      confidence: "high",
      observedAt: dossier.reliability.trust.trustUpdatedAt,
      isPublic: true,
    });
  }

  if (dossier.ownerResources.structuredLinks.pricingUrl) {
    facts.push({
      factKey: "pricing_page",
      category: "pricing",
      label: "Pricing page",
      value: "Public pricing linked",
      href: dossier.ownerResources.structuredLinks.pricingUrl,
      sourceUrl: dossier.ownerResources.structuredLinks.pricingUrl,
      sourceType: "owner",
      confidence: "medium",
      observedAt: dossier.ownerResources.customPageUpdatedAt ?? publicData.updatedAtIso,
      isPublic: true,
    });
  }

  if (dossier.benchmarks.suites.length > 0) {
    const topBenchmark = dossier.benchmarks.suites[0];
    facts.push({
      factKey: "benchmark_count",
      category: "benchmark",
      label: "Benchmarks",
      value: `${dossier.benchmarks.suites.length} suite${dossier.benchmarks.suites.length === 1 ? "" : "s"}; top score ${topBenchmark.score}`,
      href: publicData.canonicalUrl,
      sourceUrl: publicData.canonicalUrl,
      sourceType: "benchmark",
      confidence: "medium",
      observedAt: topBenchmark.createdAt,
      isPublic: true,
    });
  }

  if (dossier.ownerResources.structuredLinks.docsUrl) {
    facts.push({
      factKey: "docs_link",
      category: "integration",
      label: "Integration docs",
      value: "Public docs linked",
      href: dossier.ownerResources.structuredLinks.docsUrl,
      sourceUrl: dossier.ownerResources.structuredLinks.docsUrl,
      sourceType: "owner",
      confidence: "medium",
      observedAt: publicData.updatedAtIso,
      isPublic: true,
    });
  }

  if (documents.length > 0) {
    facts.push({
      factKey: "docs_crawl",
      category: "integration",
      label: "Crawlable docs",
      value: `${documents.length} indexed page${documents.length === 1 ? "" : "s"} on the official domain`,
      href: documents[0]?.canonicalUrl ?? publicData.canonicalUrl,
      sourceUrl: documents[0]?.canonicalUrl ?? publicData.canonicalUrl,
      sourceType: "search_document",
      confidence: "medium",
      observedAt: maybeIso(documents[0]?.indexedAt),
      isPublic: true,
    });
  }

  if (learningAssets.length > 0 || dossier.media.demoUrl) {
    facts.push({
      factKey: "learning_assets",
      category: "learning_asset",
      label: "Learning assets",
      value:
        learningAssets.length > 0
          ? `${learningAssets.length} demo or tutorial asset${learningAssets.length === 1 ? "" : "s"}`
          : "Demo link available",
      href: dossier.media.demoUrl ?? learningAssets[0]?.url ?? publicData.canonicalUrl,
      sourceUrl:
        learningAssets[0]?.sourcePageUrl ??
        dossier.media.demoUrl ??
        learningAssets[0]?.url ??
        publicData.canonicalUrl,
      sourceType: learningAssets.length > 0 ? "media" : "owner",
      confidence: "medium",
      observedAt: maybeIso(learningAssets[0]?.updatedAt) ?? publicData.updatedAtIso,
      isPublic: true,
    });
  }

  const uptime = formatPercent(dossier.reliability.executionMetrics.uptime30d);
  if (uptime) {
    facts.push({
      factKey: "uptime_30d",
      category: "security",
      label: "Observed uptime",
      value: uptime,
      href: publicData.trustUrl,
      sourceUrl: publicData.trustUrl,
      sourceType: "trust",
      confidence: "medium",
      observedAt: dossier.reliability.executionMetrics.lastVerifiedAt,
      isPublic: true,
    });
  }

  const estimatedCost = formatCurrency(dossier.reliability.executionMetrics.estimatedCostUsd);
  if (estimatedCost) {
    facts.push({
      factKey: "estimated_cost",
      category: "pricing",
      label: "Estimated cost",
      value: estimatedCost,
      href: publicData.trustUrl,
      sourceUrl: publicData.trustUrl,
      sourceType: "trust",
      confidence: "low",
      observedAt: dossier.reliability.executionMetrics.lastVerifiedAt,
      isPublic: true,
    });
  }

  return dedupeFacts(facts);
}

function buildDerivedEvents(input: {
  publicData: PublicAgentPageData;
  dossier: AgentDossier;
  mediaAssets: PublicMediaAssetRow[];
  documents: PublicDocumentRow[];
}): PublicAgentChangeEvent[] {
  const { publicData, dossier, mediaAssets, documents } = input;
  const latestRelease = dossier.release.highlights[0];
  const latestBenchmark = dossier.benchmarks.suites[0];
  const latestDoc = documents[0];
  const latestArtifact = mediaAssets.find((asset) => asset.artifactType || asset.assetKind !== "IMAGE");
  const events: PublicAgentChangeEvent[] = [];

  if (latestRelease?.version) {
    events.push({
      eventType: "release",
      title: `Release ${latestRelease.version}`,
      description: latestRelease.changelog ?? "A new release highlight was captured for this agent.",
      href: publicData.sourceUrl,
      sourceUrl: publicData.sourceUrl,
      sourceType: "release",
      confidence: "medium",
      observedAt: maybeIso(latestRelease.createdAt) ?? dossier.release.lastUpdatedAt,
      isPublic: true,
    });
  }

  if (latestDoc) {
    events.push({
      eventType: "docs_update",
      title: latestDoc.title ? `Docs refreshed: ${latestDoc.title}` : "Docs refreshed",
      description: "Fresh crawlable documentation was indexed for the official domain.",
      href: latestDoc.canonicalUrl,
      sourceUrl: latestDoc.canonicalUrl,
      sourceType: "search_document",
      confidence: "medium",
      observedAt: maybeIso(latestDoc.indexedAt),
      isPublic: true,
    });
  }

  if (latestArtifact) {
    events.push({
      eventType: "artifact_added",
      title: latestArtifact.title ? `Artifact discovered: ${latestArtifact.title}` : "New public artifact discovered",
      description: latestArtifact.artifactType
        ? `${humanizeToken(latestArtifact.artifactType)} evidence is now crawl-visible.`
        : "A public machine-usable artifact is now crawl-visible.",
      href: latestArtifact.url,
      sourceUrl: latestArtifact.sourcePageUrl ?? latestArtifact.url,
      sourceType: "media",
      confidence: "medium",
      observedAt: maybeIso(latestArtifact.updatedAt),
      isPublic: true,
    });
  }

  if (latestBenchmark) {
    events.push({
      eventType: "benchmark_result",
      title: `Benchmark refresh: ${latestBenchmark.suiteName}`,
      description: `Latest public benchmark score: ${latestBenchmark.score}.`,
      href: publicData.canonicalUrl,
      sourceUrl: publicData.canonicalUrl,
      sourceType: "benchmark",
      confidence: "medium",
      observedAt: latestBenchmark.createdAt,
      isPublic: true,
    });
  }

  if (dossier.reliability.trust.trustUpdatedAt) {
    events.push({
      eventType: "trust_refresh",
      title: "Trust signals refreshed",
      description: `Trust confidence is ${dossier.reliability.trust.trustConfidence}.`,
      href: publicData.trustUrl,
      sourceUrl: publicData.trustUrl,
      sourceType: "trust",
      confidence: dossier.reliability.trust.trustConfidence === "high" ? "high" : "medium",
      observedAt: dossier.reliability.trust.trustUpdatedAt,
      isPublic: true,
    });
  }

  if (dossier.ownerResources.structuredLinks.pricingUrl) {
    events.push({
      eventType: "pricing_changed",
      title: "Pricing surface available",
      description: "A public pricing page is linked for this agent.",
      href: dossier.ownerResources.structuredLinks.pricingUrl,
      sourceUrl: dossier.ownerResources.structuredLinks.pricingUrl,
      sourceType: "owner",
      confidence: "low",
      observedAt: dossier.ownerResources.customPageUpdatedAt ?? publicData.updatedAtIso,
      isPublic: true,
    });
  }

  return dedupeEvents(events).sort((a, b) => {
    const aTime = a.observedAt ? Date.parse(a.observedAt) : 0;
    const bTime = b.observedAt ? Date.parse(b.observedAt) : 0;
    return bTime - aTime;
  });
}

function buildCardSummary(input: {
  publicData: PublicAgentPageData;
  dossier: AgentDossier;
  vendor: VendorInfo;
  facts: PublicAgentFact[];
  artifactCount: number;
  benchmarkCount: number;
}): PublicAgentCardSummary {
  const { publicData, dossier, vendor, facts, artifactCount, benchmarkCount } = input;
  const client = publicData.agentForClient as Record<string, unknown>;
  const lastRelease = dossier.release.highlights[0]?.version ?? dossier.adoption.latestVersion ?? null;
  const freshnessAt =
    dossier.release.lastVerifiedAt ??
    dossier.release.lastCrawledAt ??
    dossier.release.lastUpdatedAt ??
    publicData.updatedAtIso;
  const openapiReady = Boolean(
    publicData.machineBlocks.executionContractSummary.inputSchemaRef ||
      publicData.machineBlocks.executionContractSummary.outputSchemaRef ||
      facts.some((fact) => fact.factKey === "schema_refs")
  );
  const securityReviewed =
    publicData.machineBlocks.trustAndReliability.status === "ready" ||
    facts.some((fact) => fact.category === "security");

  const stats = [
    {
      label: "Trust score",
      value: publicData.trustScore == null ? "Unknown" : publicData.trustScore.toFixed(2),
    },
    {
      label: "Compatibility",
      value:
        dossier.coverage.protocols.length > 0
          ? dossier.coverage.protocols.map((item) => item.label).join(", ")
          : "Profile only",
    },
    {
      label: "Freshness",
      value: formatDateLabel(freshnessAt) ?? "No freshness signal",
    },
    {
      label: "Vendor",
      value: vendor.label ?? publicData.source,
    },
    { label: "Artifacts", value: String(artifactCount) },
    { label: "Benchmarks", value: String(benchmarkCount) },
    { label: "Last release", value: lastRelease ?? "Unpublished" },
  ];

  const highlights = [
    dossier.adoption.tractionLabel,
    openapiReady ? "Schema refs published" : null,
    securityReviewed ? "Trust evidence available" : null,
    artifactCount > 0 ? `${artifactCount} public artifact${artifactCount === 1 ? "" : "s"}` : null,
  ].filter((value): value is string => Boolean(value));

  const executableExamples = dossier.artifacts.executableExamples.slice(0, 2).map((example) => ({
    kind: "example",
    language: example.language,
    snippet: example.snippet,
  }));

  return {
    id: publicData.id,
    slug: publicData.slug,
    name: publicData.name,
    description: publicData.description,
    canonicalUrl: publicData.canonicalUrl,
    sourceUrl: publicData.sourceUrl,
    homepage: publicData.homepage,
    source: publicData.source,
    vendor,
    protocols: publicData.protocols,
    capabilities: publicData.capabilities,
    trustScore: publicData.trustScore,
    trustConfidence: publicData.machineBlocks.trustAndReliability.trustConfidence,
    artifactCount,
    benchmarkCount,
    lastRelease,
    freshnessAt,
    freshnessLabel: formatDateLabel(freshnessAt),
    securityReviewed,
    openapiReady,
    stats,
    factsPreview: facts.slice(0, 8),
    highlights,
    agentCard: buildAgentCard(
      {
        id: publicData.id,
        name: publicData.name,
        slug: publicData.slug,
        description: publicData.description,
        url: publicData.sourceUrl,
        homepage: publicData.homepage,
        source: publicData.source,
        sourceId: typeof client.sourceId === "string" ? client.sourceId : null,
        protocols: publicData.protocols,
        capabilities: publicData.capabilities,
        languages: Array.isArray(client.languages)
          ? client.languages.filter((item): item is string => typeof item === "string")
          : null,
        npmData:
          client.npmData && typeof client.npmData === "object"
            ? (client.npmData as { packageName?: string | null })
            : null,
        readmeSource: typeof client.readmeSource === "string" ? client.readmeSource : null,
        examples: executableExamples,
      },
      publicData.canonicalUrl.replace(/\/agent\/[^/]+$/, "")
    ),
  };
}

export function selectStoredFirstEvidence(input: {
  storedFacts: PublicAgentFact[];
  storedEvents: PublicAgentChangeEvent[];
  derivedFacts: PublicAgentFact[];
  derivedEvents: PublicAgentChangeEvent[];
}): { facts: PublicAgentFact[]; changeEvents: PublicAgentChangeEvent[] } {
  return {
    facts: input.storedFacts.length > 0 ? input.storedFacts : input.derivedFacts,
    changeEvents: input.storedEvents.length > 0 ? input.storedEvents : input.derivedEvents,
  };
}

export function combinePublicEvidence(input: {
  storedFacts: PublicAgentFact[];
  storedEvents: PublicAgentChangeEvent[];
  derivedFacts: PublicAgentFact[];
  derivedEvents: PublicAgentChangeEvent[];
}): { facts: PublicAgentFact[]; changeEvents: PublicAgentChangeEvent[] } {
  return {
    facts: sortFactsByObservedAt(dedupeFacts([...input.storedFacts, ...input.derivedFacts])),
    changeEvents: sortEventsByObservedAt(
      dedupeEvents([...input.storedEvents, ...input.derivedEvents])
    ),
  };
}

type EvidencePackMode = "stored-first" | "derived-only" | "combined";

async function resolveEvidencePack(
  slug: string,
  mode: EvidencePackMode = "stored-first"
): Promise<PublicAgentEvidencePack | null> {
  const [publicData, dossier] = await Promise.all([getPublicAgentPageData(slug), getAgentDossier(slug)]);
  if (!publicData || !dossier) return null;

  const [mediaAssets, documents] = await Promise.all([
    getPublicMediaAssets(publicData.id),
    getRelatedDocuments(publicData),
  ]);

  const vendor = deriveVendorInfo({
    homepage: publicData.homepage,
    sourceUrl: publicData.sourceUrl,
  });

  const derivedFacts = sortFactsByObservedAt(
    dedupeFacts(
    buildDerivedFacts({
      publicData,
      dossier,
      vendor,
      mediaAssets,
      documents,
    })
    )
  );

  const derivedEvents = sortEventsByObservedAt(
    dedupeEvents(
    buildDerivedEvents({
      publicData,
      dossier,
      mediaAssets,
      documents,
    })
    )
  );

  let facts = derivedFacts;
  let changeEvents = derivedEvents;

  if (mode !== "derived-only") {
    const [storedFacts, storedEvents] = await Promise.all([
      getStoredFacts(publicData.id),
      getStoredChangeEvents(publicData.id),
    ]);

    if (mode === "combined") {
      const combined = combinePublicEvidence({
        storedFacts,
        storedEvents,
        derivedFacts,
        derivedEvents,
      });
      facts = combined.facts;
      changeEvents = combined.changeEvents;
    } else {
      const selected = selectStoredFirstEvidence({
        storedFacts,
        storedEvents,
        derivedFacts,
        derivedEvents,
      });
      facts = selected.facts;
      changeEvents = selected.changeEvents;
    }
  }

  return {
    card: buildCardSummary({
      publicData,
      dossier,
      vendor,
      facts,
      artifactCount: mediaAssets.length,
      benchmarkCount: dossier.benchmarks.suites.length,
    }),
    facts,
    changeEvents,
  };
}

export async function getPublicAgentEvidencePack(slug: string): Promise<PublicAgentEvidencePack | null> {
  return resolveEvidencePack(slug, "stored-first");
}

export async function getPublicAgentCard(slug: string): Promise<PublicAgentCardSummary | null> {
  const pack = await resolveEvidencePack(slug, "stored-first");
  return pack?.card ?? null;
}

export async function getPublicAgentFacts(slug: string): Promise<PublicAgentFact[]> {
  const pack = await resolveEvidencePack(slug, "stored-first");
  return pack?.facts ?? [];
}

export async function getPublicAgentChangeEvents(slug: string): Promise<PublicAgentChangeEvent[]> {
  const pack = await resolveEvidencePack(slug, "stored-first");
  return pack?.changeEvents ?? [];
}

export async function getDerivedPublicAgentEvidencePack(slug: string): Promise<PublicAgentEvidencePack | null> {
  return resolveEvidencePack(slug, "derived-only");
}

export async function getCombinedPublicAgentEvidencePack(
  slug: string
): Promise<PublicAgentEvidencePack | null> {
  return resolveEvidencePack(slug, "combined");
}
