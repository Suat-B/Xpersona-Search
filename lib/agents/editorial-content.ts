import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { agentEditorialContent } from "@/lib/db/schema";

export type ContentQualityStatus = "ready" | "thin" | "draft";
export type SetupComplexity = "low" | "medium" | "high";

export type AgentReleaseHighlight = {
  version: string;
  createdAt: string | null;
  changelog: string | null;
  fileCount: number | null;
  zipByteSize: number | null;
};

export type AgentFaqItem = {
  q: string;
  a: string;
};

export type AgentEditorialSections = {
  overview: string;
  bestFor: string;
  notFor: string;
  setup: string[];
  workflows: string[];
  limitations: string;
  alternatives: string;
  faq: AgentFaqItem[];
  releaseHighlights: AgentReleaseHighlight[];
  extractedFiles: { path: string; content: string }[];
};

export type AgentContentQuality = {
  score: number;
  threshold: number;
  status: ContentQualityStatus;
  wordCount: number;
  uniquenessScore: number;
  reasons: string[];
};

export type AgentContentMeta = {
  hasEditorialContent: boolean;
  qualityScore: number | null;
  lastReviewedAt: string | null;
  bestFor: string | null;
  setupComplexity: SetupComplexity;
  hasFaq: boolean;
  hasPlaybook: boolean;
};

export type ClawhubNormalizedPayload = {
  downloads: number | null;
  versions: AgentReleaseHighlight[];
  canonicalUrl: string | null;
  pageTitle: string | null;
  setupComplexity: SetupComplexity;
  sourceListUrl: string | null;
  extractedFiles: { path: string; content: string }[];
};

export type EditorialSeed = {
  agentId: string;
  name: string;
  description: string | null;
  capabilities: string[];
  protocols: string[];
  source: string;
  readmeExcerpt: string | null;
  updatedAtIso: string | null;
  openclawData: Record<string, unknown> | null | undefined;
  sourceUrl?: string | null;
  homepage?: string | null;
};

export type ResolvedEditorialContent = {
  sections: AgentEditorialSections;
  quality: AgentContentQuality;
  setupComplexity: SetupComplexity;
  lastReviewedAt: string;
  dataSources: string[];
  useCases: string[];
};

const QUALITY_THRESHOLD = 65;

let hasEditorialTableCache: boolean | null = null;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripMarkdown(value: string): string {
  return normalizeWhitespace(
    value
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
      .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^>\s+/gm, "")
      .replace(/[*_~]/g, " ")
  );
}

function toWords(value: string): string[] {
  return stripMarkdown(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);
}

function firstSentence(value: string | null | undefined): string | null {
  const text = normalizeWhitespace(value ?? "");
  if (!text) return null;
  const split = text.split(/[.!?]/).map((x) => x.trim()).filter(Boolean);
  return split[0] ?? null;
}

function toIsoMaybe(value: unknown): string | null {
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 1_000_000_000_000 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  return null;
}

function parseSetupComplexityFromText(text: string): SetupComplexity {
  const lower = text.toLowerCase();
  if (
    lower.includes("kubernetes") ||
    lower.includes("multi-step") ||
    lower.includes("oauth") ||
    lower.includes("webhook")
  ) {
    return "high";
  }
  if (
    lower.includes("api key") ||
    lower.includes("env") ||
    lower.includes("docker") ||
    lower.includes("configuration")
  ) {
    return "medium";
  }
  return "low";
}

export function normalizeClawhubPayload(
  openclawData: Record<string, unknown> | null | undefined
): ClawhubNormalizedPayload | null {
  if (!openclawData || typeof openclawData !== "object") return null;
  const clawhub =
    (openclawData.clawhub as Record<string, unknown> | undefined) ??
    openclawData;
  if (!clawhub || typeof clawhub !== "object") return null;

  const stats = (clawhub.stats as Record<string, unknown> | undefined) ?? {};
  const pageMeta = (clawhub.pageMeta as Record<string, unknown> | undefined) ?? {};
  const crawlContext = (clawhub.crawlContext as Record<string, unknown> | undefined) ?? {};

  const versionsRaw = Array.isArray(clawhub.versions) ? clawhub.versions : [];
  const archivesRaw = Array.isArray(clawhub.archives) ? clawhub.archives : [];

  const archiveByVersion = new Map<string, { fileCount: number | null; zipByteSize: number | null }>();
  for (const archiveItem of archivesRaw) {
    if (!archiveItem || typeof archiveItem !== "object") continue;
    const archive = archiveItem as Record<string, unknown>;
    const version = typeof archive.version === "string" ? archive.version : "";
    if (!version) continue;
    archiveByVersion.set(version, {
      fileCount:
        typeof archive.fileCount === "number" && Number.isFinite(archive.fileCount)
          ? archive.fileCount
          : null,
      zipByteSize:
        typeof archive.zipByteSize === "number" && Number.isFinite(archive.zipByteSize)
          ? archive.zipByteSize
          : null,
    });
  }

  const latestArchive = archivesRaw[0] as Record<string, unknown> | undefined;
  const rawTextFiles = Array.isArray(latestArchive?.textFiles) ? latestArchive.textFiles : [];
  const extractedFiles = rawTextFiles
    .filter((f) => f && typeof f === "object" && typeof (f as any).path === "string" && typeof (f as any).content === "string")
    .map((f: any) => ({
      path: f.path,
      content: f.content.slice(0, 3000), // Expose up to 3000 chars of the most important files
    }))
    .slice(0, 5);

  const versions: AgentReleaseHighlight[] = versionsRaw
    .filter((item) => item && typeof item === "object")
    .slice(0, 8)
    .map((item) => {
      const row = item as Record<string, unknown>;
      const version = typeof row.version === "string" ? row.version : "unknown";
      const archive = archiveByVersion.get(version);
      return {
        version,
        createdAt: toIsoMaybe(row.createdAt),
        changelog: typeof row.changelog === "string" ? normalizeWhitespace(row.changelog) : null,
        fileCount: archive?.fileCount ?? null,
        zipByteSize: archive?.zipByteSize ?? null,
      };
    });

  const complexitySignals = [
    versions.length > 5 ? "multi-step" : "",
    typeof pageMeta.title === "string" ? pageMeta.title : "",
    typeof pageMeta.description === "string" ? pageMeta.description : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    downloads:
      typeof stats.downloads === "number" && Number.isFinite(stats.downloads)
        ? stats.downloads
        : null,
    versions,
    canonicalUrl:
      typeof pageMeta.canonicalUrl === "string" && pageMeta.canonicalUrl.length > 0
        ? pageMeta.canonicalUrl
        : null,
    pageTitle:
      typeof pageMeta.title === "string" && pageMeta.title.length > 0
        ? pageMeta.title
        : null,
    setupComplexity: parseSetupComplexityFromText(complexitySignals),
    sourceListUrl:
      typeof crawlContext.sourceListUrl === "string" && crawlContext.sourceListUrl.length > 0
        ? crawlContext.sourceListUrl
        : null,
    extractedFiles,
  };
}

function inferUseCases(seed: EditorialSeed): string[] {
  const text = `${seed.description ?? ""} ${seed.capabilities.join(" ")} ${seed.protocols.join(" ")}`.toLowerCase();
  const useCases: string[] = [];
  if (/research|analysis|summari|retrieval/.test(text)) useCases.push("research-assistant");
  if (/code|dev|repo|github|deploy|ci|automation/.test(text)) useCases.push("developer-automation");
  if (/support|ticket|customer|helpdesk/.test(text)) useCases.push("support-automation");
  if (/sales|crm|lead|outreach/.test(text)) useCases.push("sales-ops");
  if (/content|writing|seo|social|marketing/.test(text)) useCases.push("content-creation");
  if (useCases.length === 0) useCases.push("general-automation");
  return useCases.slice(0, 3);
}

function inferBestFor(seed: EditorialSeed, useCases: string[]): string {
  if (seed.capabilities.length > 0) {
    return `${seed.name} is best for teams that need ${seed.capabilities
      .slice(0, 3)
      .join(", ")} with ${seed.protocols.length > 0 ? seed.protocols.join("/") : "agent-first"} workflows.`;
  }
  return `${seed.name} is best for ${useCases[0]?.replace(/-/g, " ") ?? "automation"} scenarios where speed and predictable execution matter.`;
}

function inferNotFor(seed: EditorialSeed): string {
  const hasStreaming = seed.protocols.some((p) => p.toUpperCase().includes("MCP"));
  if (!hasStreaming) {
    return `${seed.name} is not ideal for real-time streaming tasks that require ultra-low latency token streaming interfaces.`;
  }
  return `${seed.name} is not ideal for teams that need fully managed, zero-configuration workflows without any integration setup.`;
}

function inferSetup(
  seed: EditorialSeed,
  setupComplexity: SetupComplexity,
  extractedFiles: { path: string; content: string }[]
): string[] {
  const steps: string[] = [];
  const filePaths = extractedFiles.map((f) => f.path.toLowerCase());

  if (filePaths.some((p) => p.includes("docker-compose"))) {
    steps.push(`Docker environment detected. We recommend running \`docker compose up -d\` in an isolated bridge network rather than host mode.`);
  } else if (filePaths.some((p) => p.includes("dockerfile"))) {
    steps.push(`Dockerfile detected. Build the image locally (\`docker build -t ${seed.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')} .\`) to inspect the base layers before executing.`);
  }

  if (filePaths.some((p) => p.includes("package.json") || p.includes("pnpm-workspace.yaml"))) {
    steps.push(`Node.js workspace detected. Install dependencies securely: run \`npm ci --ignore-scripts\` to prevent post-install lifecycle triggers from running arbitrary code, then selectively audit the dependency tree.`);
  } else if (filePaths.some((p) => p.includes("requirements.txt") || p.includes("pyproject.toml"))) {
    steps.push(`Python environment detected. Create a strict virtual environment (\`python -m venv .venv\`) before installing dependencies to prevent system-level package conflicts.`);
  }

  if (filePaths.some((p) => p.includes(".env"))) {
    steps.push(`Environment variables required. Review the exposed \`.env\` template and provision short-lived API keys with least-privilege scoping rather than root accounts.`);
  }

  if (setupComplexity === "high") {
    steps.push(`Setup complexity is classified as HIGH. You must provision dedicated cloud infrastructure or an isolated VM. Do not run this directly on your local workstation.`);
  } else if (setupComplexity === "medium") {
    steps.push(`Setup complexity is MEDIUM. Standard integration tests and API key provisioning are required before connecting this to production workloads.`);
  } else {
    steps.push(`Setup complexity is LOW. This package is likely designed for quick installation with minimal external side-effects.`);
  }

  steps.push(`Final validation: Expose the agent to a mock request payload inside a sandbox and trace the network egress before allowing access to real customer data.`);

  return steps;
}

function inferLimitations(seed: EditorialSeed): string {
  const protocolNote =
    seed.protocols.length > 0
      ? `Current protocol declarations: ${seed.protocols.join(", ")}.`
      : "Protocol declarations are limited.";
  return `${seed.name} may expose uneven documentation depth across sources. ${protocolNote} Always validate contract and trust freshness before critical execution.`;
}

function inferAlternatives(seed: EditorialSeed, useCases: string[]): string {
  const protocol = seed.protocols[0]?.toLowerCase() ?? "openclaw";
  return `If ${seed.name} is not a fit, compare alternatives in the same protocol family (${protocol}) and use-case track (${useCases[0]}). Prefer candidates with stronger trust freshness and clearer contract metadata.`;
}

function inferWorkflows(seed: EditorialSeed): string[] {
  const cap = seed.capabilities[0] ?? "task execution";
  return [
    `Discovery workflow: query Xpersona search for "${seed.name}" alternatives, then shortlist by protocol compatibility and trust freshness for ${cap}.`,
    `Execution workflow: run /snapshot, /contract, and /trust checks before invoking ${seed.name} in production automation chains.`,
    `Optimization workflow: compare latency, reliability, and fallback candidates weekly, then rotate to the highest-confidence agent for your workload.`,
  ];
}

function inferFaq(seed: EditorialSeed): AgentFaqItem[] {
  const name = seed.name;
  return [
    {
      q: `What does ${name} do?`,
      a: `${name} provides agent capabilities for ${seed.capabilities.slice(0, 3).join(", ") || "automation and orchestration"} workflows.`,
    },
    {
      q: `How do I safely evaluate ${name} before production use?`,
      a: "Use the 3-call flow: snapshot, contract, and trust. Confirm compatibility and freshness before enabling live routing.",
    },
    {
      q: `Which protocols are relevant for ${name}?`,
      a: seed.protocols.length > 0
        ? `${name} currently exposes ${seed.protocols.join(", ")} in profile metadata.`
        : "Protocol support is limited in profile metadata and should be validated at contract level.",
    },
    {
      q: `What are common setup requirements?`,
      a: "Most setups require credentials, endpoint validation, and at least one smoke test in your own runtime context.",
    },
    {
      q: `When should I choose an alternative agent?`,
      a: "Choose alternatives when trust freshness is stale, contract data is missing, or workload requirements exceed documented capabilities.",
    },
    {
      q: `How often should this profile be reviewed?`,
      a: "Review weekly for high-risk flows and monthly for low-risk flows, or whenever major version changes appear.",
    },
  ];
}

function buildGeneratedSections(seed: EditorialSeed): AgentEditorialSections {
  const normalized = normalizeClawhubPayload(seed.openclawData);
  const useCases = inferUseCases(seed);
  const bestFor = inferBestFor(seed, useCases);
  const setupComplexity = normalized?.setupComplexity ?? "medium";
  const releaseHighlights = normalized?.versions ?? [];

  const overview = normalizeWhitespace(
    `${seed.description ?? `${seed.name} is an AI agent listed on Xpersona.`} ${seed.readmeExcerpt ?? ""}`.trim()
  );

  return {
    overview,
    bestFor,
    notFor: inferNotFor(seed),
    setup: inferSetup(seed, setupComplexity, normalized?.extractedFiles ?? []),
    workflows: inferWorkflows(seed),
    limitations: inferLimitations(seed),
    alternatives: inferAlternatives(seed, useCases),
    faq: inferFaq(seed),
    releaseHighlights,
    extractedFiles: normalized?.extractedFiles ?? [],
  };
}

export function evaluateEditorialContent(sections: AgentEditorialSections): AgentContentQuality {
  const blobs = [
    sections.overview,
    sections.bestFor,
    sections.notFor,
    sections.setup.join(" "),
    sections.workflows.join(" "),
    sections.limitations,
    sections.alternatives,
    sections.faq.map((item) => `${item.q} ${item.a}`).join(" "),
    sections.releaseHighlights
      .map((item) => `${item.version} ${item.changelog ?? ""}`)
      .join(" "),
  ]
    .filter(Boolean)
    .join(" ");

  const words = toWords(blobs);
  const uniqueWords = new Set(words);
  const wordCount = words.length;
  const uniquenessRatio = wordCount > 0 ? uniqueWords.size / wordCount : 0;
  const uniquenessScore = Math.round(Math.max(0, Math.min(100, uniquenessRatio * 120)));

  const completeness =
    (sections.overview ? 10 : 0) +
    (sections.bestFor ? 10 : 0) +
    (sections.notFor ? 8 : 0) +
    (sections.setup.length > 0 ? 10 : 0) +
    (sections.workflows.length >= 3 ? 12 : sections.workflows.length * 3) +
    (sections.limitations ? 8 : 0) +
    (sections.alternatives ? 8 : 0) +
    (sections.faq.length >= 6 ? 14 : sections.faq.length * 2) +
    (sections.releaseHighlights.length > 0 ? 6 : 0);

  const depth = Math.min(45, Math.round(wordCount / 8));
  const score = Math.max(0, Math.min(100, depth + completeness + Math.round(uniquenessScore * 0.25)));

  const reasons: string[] = [];
  if (wordCount < 220) reasons.push("word-count-below-220");
  if (sections.faq.length < 6) reasons.push("faq-below-6");
  if (sections.workflows.length < 3) reasons.push("workflows-below-3");
  if (uniquenessScore < 45) reasons.push("uniqueness-below-45");

  const status: ContentQualityStatus =
    score >= QUALITY_THRESHOLD && wordCount >= 220 && reasons.length === 0
      ? "ready"
      : score <= 20
        ? "draft"
        : "thin";

  return {
    score,
    threshold: QUALITY_THRESHOLD,
    status,
    wordCount,
    uniquenessScore,
    reasons,
  };
}

function parseFaqJson(raw: unknown): AgentFaqItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const row = item as Record<string, unknown>;
      return {
        q: typeof row.q === "string" ? normalizeWhitespace(row.q) : "",
        a: typeof row.a === "string" ? normalizeWhitespace(row.a) : "",
      };
    })
    .filter((item) => item.q.length > 0 && item.a.length > 0)
    .slice(0, 12);
}

function parseReleaseHighlights(raw: unknown): AgentReleaseHighlight[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const row = item as Record<string, unknown>;
      return {
        version: typeof row.version === "string" ? row.version : "unknown",
        createdAt: toIsoMaybe(row.createdAt),
        changelog: typeof row.changelog === "string" ? normalizeWhitespace(row.changelog) : null,
        fileCount: typeof row.fileCount === "number" ? row.fileCount : null,
        zipByteSize: typeof row.zipByteSize === "number" ? row.zipByteSize : null,
      };
    })
    .slice(0, 8);
}

async function hasEditorialTable(): Promise<boolean> {
  if (hasEditorialTableCache != null) return hasEditorialTableCache;
  try {
    const result = await db.execute(
      sql`SELECT to_regclass('public.agent_editorial_content') AS regclass`
    );
    const rows = (result as unknown as { rows?: Array<{ regclass?: string | null }> }).rows ?? [];
    hasEditorialTableCache = Boolean(rows[0]?.regclass);
  } catch {
    hasEditorialTableCache = false;
  }
  return hasEditorialTableCache;
}

function contentMetaFromSections(input: {
  sections: AgentEditorialSections;
  quality: AgentContentQuality;
  lastReviewedAt: string | null;
}): AgentContentMeta {
  const bestFor = firstSentence(input.sections.bestFor);
  const setupComplexity = parseSetupComplexityFromText(input.sections.setup.join(" "));
  return {
    hasEditorialContent: input.quality.status !== "draft",
    qualityScore: input.quality.score,
    lastReviewedAt: input.lastReviewedAt,
    bestFor,
    setupComplexity,
    hasFaq: input.sections.faq.length >= 3,
    hasPlaybook: input.sections.workflows.length >= 3,
  };
}

export function buildFallbackContentMetaFromSearchResult(row: {
  description?: string | null;
  capabilities?: string[] | null;
  openclawData?: Record<string, unknown> | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
}): AgentContentMeta {
  const desc = normalizeWhitespace(row.description ?? "");
  const caps = Array.isArray(row.capabilities) ? row.capabilities : [];
  const words = toWords(`${desc} ${caps.join(" ")}`);
  const qualityScore = Math.max(5, Math.min(62, Math.round(words.length / 4) + (caps.length > 0 ? 10 : 0)));
  const normalized = normalizeClawhubPayload(row.openclawData ?? null);
  const updated = row.updatedAt instanceof Date
    ? row.updatedAt.toISOString()
    : typeof row.updatedAt === "string"
      ? row.updatedAt
      : row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : typeof row.createdAt === "string"
          ? row.createdAt
          : null;

  return {
    hasEditorialContent: desc.length > 120 || caps.length > 2,
    qualityScore,
    lastReviewedAt: updated,
    bestFor: caps.length > 0 ? `Best for ${caps.slice(0, 2).join(" and ")}` : null,
    setupComplexity: normalized?.setupComplexity ?? "medium",
    hasFaq: false,
    hasPlaybook: false,
  };
}

export async function getEditorialContentMetaMap(agentIds: string[]): Promise<Map<string, AgentContentMeta>> {
  const out = new Map<string, AgentContentMeta>();
  if (agentIds.length === 0) return out;
  if (!(await hasEditorialTable())) return out;

  const rows = await db
    .select({
      agentId: agentEditorialContent.agentId,
      bestForMd: agentEditorialContent.bestForMd,
      setupMd: agentEditorialContent.setupMd,
      workflowsMd: agentEditorialContent.workflowsMd,
      faqJson: agentEditorialContent.faqJson,
      qualityScore: agentEditorialContent.qualityScore,
      lastReviewedAt: agentEditorialContent.lastReviewedAt,
      status: agentEditorialContent.status,
    })
    .from(agentEditorialContent)
    .where(and(inArray(agentEditorialContent.agentId, agentIds), eq(agentEditorialContent.status, "READY")));

  for (const row of rows) {
    const faq = parseFaqJson(row.faqJson);
    out.set(String(row.agentId), {
      hasEditorialContent: row.status !== "DRAFT",
      qualityScore: typeof row.qualityScore === "number" ? row.qualityScore : null,
      lastReviewedAt: row.lastReviewedAt?.toISOString() ?? null,
      bestFor: firstSentence(row.bestForMd),
      setupComplexity: parseSetupComplexityFromText(row.setupMd ?? ""),
      hasFaq: faq.length >= 3,
      hasPlaybook: normalizeWhitespace(row.workflowsMd ?? "").length >= 120,
    });
  }
  return out;
}

export async function resolveEditorialContent(seed: EditorialSeed): Promise<ResolvedEditorialContent> {
  const normalizedClawhub = normalizeClawhubPayload(seed.openclawData);
  const useCases = inferUseCases(seed);
  const dataSources = [
    seed.sourceUrl ?? null,
    seed.homepage ?? null,
    normalizedClawhub?.canonicalUrl ?? null,
    normalizedClawhub?.sourceListUrl ?? null,
  ].filter((item): item is string => Boolean(item && item.length > 0));

  let sections = buildGeneratedSections(seed);
  let lastReviewedAt = seed.updatedAtIso ?? new Date().toISOString();

  if (await hasEditorialTable()) {
    const rows = await db
      .select({
        overviewMd: agentEditorialContent.overviewMd,
        bestForMd: agentEditorialContent.bestForMd,
        notForMd: agentEditorialContent.notForMd,
        setupMd: agentEditorialContent.setupMd,
        workflowsMd: agentEditorialContent.workflowsMd,
        limitationsMd: agentEditorialContent.limitationsMd,
        alternativesMd: agentEditorialContent.alternativesMd,
        faqJson: agentEditorialContent.faqJson,
        releaseHighlights: agentEditorialContent.releaseHighlights,
        status: agentEditorialContent.status,
        lastReviewedAt: agentEditorialContent.lastReviewedAt,
      })
      .from(agentEditorialContent)
      .where(eq(agentEditorialContent.agentId, seed.agentId))
      .limit(1);

    const row = rows[0];
    if (row && row.status !== "DRAFT") {
      sections = {
        overview: normalizeWhitespace(row.overviewMd ?? sections.overview),
        bestFor: normalizeWhitespace(row.bestForMd ?? sections.bestFor),
        notFor: normalizeWhitespace(row.notForMd ?? sections.notFor),
        setup: normalizeWhitespace(row.setupMd ?? sections.setup.join("\n"))
          .split(/\n+/)
          .map((item) => normalizeWhitespace(item.replace(/^[-*\d.]+\s*/, "")))
          .filter(Boolean),
        workflows: normalizeWhitespace(row.workflowsMd ?? "")
          .split(/\n+/)
          .map((item) => normalizeWhitespace(item.replace(/^[-*\d.]+\s*/, "")))
          .filter(Boolean)
          .slice(0, 6),
        limitations: normalizeWhitespace(row.limitationsMd ?? sections.limitations),
        alternatives: normalizeWhitespace(row.alternativesMd ?? sections.alternatives),
        faq: parseFaqJson(row.faqJson),
        releaseHighlights: parseReleaseHighlights(row.releaseHighlights),
        extractedFiles: sections.extractedFiles,
      };
      if (sections.workflows.length === 0) {
        sections.workflows = inferWorkflows(seed);
      }
      if (sections.faq.length === 0) {
        sections.faq = inferFaq(seed);
      }
      if (sections.releaseHighlights.length === 0) {
        sections.releaseHighlights = normalizedClawhub?.versions ?? [];
      }
      lastReviewedAt = row.lastReviewedAt?.toISOString() ?? lastReviewedAt;
    }
  }

  const quality = evaluateEditorialContent(sections);
  return {
    sections,
    quality,
    setupComplexity: parseSetupComplexityFromText(sections.setup.join(" ")),
    lastReviewedAt,
    dataSources,
    useCases,
  };
}

export function toRelativeUpdatedLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  const deltaHours = Math.max(0, Math.round((Date.now() - ms) / (1000 * 60 * 60)));
  if (deltaHours < 24) return `Updated ${deltaHours}h ago`;
  const days = Math.round(deltaHours / 24);
  if (days < 30) return `Updated ${days}d ago`;
  const months = Math.round(days / 30);
  return `Updated ${months}mo ago`;
}

export function inferWhyRankLabel(input: {
  trustScore?: number | null;
  overallRank?: number | null;
  qualityScore?: number | null;
}): string {
  const trust = input.trustScore ?? 0;
  const rank = input.overallRank ?? 0;
  const quality = input.qualityScore ?? 0;
  if (trust >= 80 && quality >= 60) return "Why this rank: strong trust and rich documentation.";
  if (rank >= 80) return "Why this rank: high overall relevance for this query.";
  if (quality >= 60) return "Why this rank: high content quality and clear setup guidance.";
  return "Why this rank: matched capabilities and protocol fit.";
}

export function isThinContent(quality: AgentContentQuality): boolean {
  return quality.status !== "ready";
}
