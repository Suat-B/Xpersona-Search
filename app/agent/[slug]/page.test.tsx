import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

const mockGetAgentDossier = vi.hoisted(() => vi.fn());
const mockGetPublicAgentEvidencePack = vi.hoisted(() => vi.fn());

vi.mock("@/lib/agents/agent-dossier", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agents/agent-dossier")>();
  return {
    ...actual,
    getAgentDossier: mockGetAgentDossier,
  };
});

vi.mock("@/lib/agents/public-facts", () => ({
  getPublicAgentEvidencePack: mockGetPublicAgentEvidencePack,
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue(null),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/auth-utils", () => ({
  getAuthUserFromCookie: vi.fn(() => null),
}));

vi.mock("@/components/agent/BackToSearchLink", () => ({
  BackToSearchLink: () => <button type="button">Back to search</button>,
}));

vi.mock("@/components/agent/CustomAgentPage", () => ({
  CustomAgentPage: () => <div data-testid="custom-agent-page">Custom content</div>,
}));

vi.mock("@/components/agent/InstallCommand", () => ({
  InstallCommand: ({ command }: { command: string }) => <div data-testid="install-command">{command}</div>,
}));

vi.mock("@/components/agent/SkillMarkdown", () => ({
  SkillMarkdown: ({ content }: { content: string }) => <div data-testid="skill-markdown">{content}</div>,
}));

vi.mock("@/components/agent/AgentMiniCard", () => ({
  AgentMiniCard: ({ agent }: { agent: { name: string } }) => <div data-testid="agent-mini-card">{agent.name}</div>,
}));

vi.mock("@/components/agent/AgentTechnicalDossier", () => ({
  AgentTechnicalDossier: () => (
    <section data-testid="agent-technical-dossier">
      <h1>Agent Profile</h1>
      <h2>Execution Readiness</h2>
      <h2>Reliability &amp; Benchmarks</h2>
      <h2>Machine Appendix</h2>
      <h2>Custom technical brief</h2>
      <h2>Quick Facts</h2>
      <h2>Release &amp; Crawl Timeline</h2>
      <a href="https://github.com/demo/demo-agent">View Source</a>
    </section>
  ),
}));

vi.mock("@/components/ads/BotAdBanner", () => ({
  BotAdBanner: () => <div data-testid="bot-ad-banner">Bot ads</div>,
}));

vi.mock("@/components/ads/AgentPageAds", () => ({
  AgentPageAds: () => <div data-testid="agent-page-ads">Agent page ads</div>,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: Record<string, unknown>) => (
    <a href={String(href ?? "#")} {...props}>
      {children as React.ReactNode}
    </a>
  ),
}));

vi.mock("next/image", () => ({
  default: ({ unoptimized: _unoptimized, ...props }: Record<string, unknown>) => (
    <img {...props} alt={String(props.alt ?? "")} />
  ),
}));

const mockNotFound = vi.hoisted(() => vi.fn(() => {
  throw new Error("notFound");
}));

vi.mock("next/navigation", async () => {
  const actual = await vi.importActual<typeof import("next/navigation")>("next/navigation");
  return {
    ...actual,
    notFound: mockNotFound,
  };
});

import AgentPage, { generateMetadata } from "./page";

const dossierFixture = {
  id: "agent-1",
  slug: "demo-agent",
  name: "Demo Agent",
  canonicalUrl: "https://xpersona.co/agent/demo-agent",
  generatedAt: "2026-03-13T18:00:00.000Z",
  source: "GITHUB_OPENCLEW",
  claimStatus: "CLAIMED",
  verificationTier: "SILVER",
  summary: {
    evidence: {
      source: "editorial-content",
      confidence: "high",
      verified: true,
      updatedAt: "2026-03-13T17:00:00.000Z",
      emptyReason: null,
    },
    description: "A deep technical dossier for evaluating Demo Agent.",
    descriptionLabel: "Technical summary",
    evidenceSummary: "Published capability contract available. Trust data available with high confidence.",
    installCommand: "npm install demo-agent",
    sourceUrl: "https://github.com/demo/demo-agent",
    homepage: "https://github.com/demo/demo-agent",
    primaryLinks: [
      { label: "View Source", url: "https://github.com/demo/demo-agent", kind: "source" },
    ],
    safetyScore: 92,
    overallRank: 88,
    popularityScore: 77,
    trustScore: 0.91,
    claimedByName: "Maintainer",
    isOwner: false,
    seoDescription: "Demo Agent technical dossier on Xpersona.",
  },
  coverage: {
    evidence: {
      source: "capability-contract + public-profile",
      confidence: "high",
      verified: true,
      updatedAt: "2026-03-13T17:00:00.000Z",
      emptyReason: null,
    },
    protocols: [
      { protocol: "MCP", label: "MCP", status: "verified", notes: "Confirmed." },
      { protocol: "OPENCLAW", label: "OpenClaw", status: "self-declared", notes: "Declared." },
    ],
    capabilities: [{ label: "automation", status: "self-declared" }],
    verifiedCount: 1,
    selfDeclaredCount: 2,
    capabilityMatrix: {
      rows: [
        {
          key: "MCP",
          type: "protocol",
          support: "supported",
          confidenceSource: "contract",
          notes: "Confirmed by contract",
        },
      ],
      flattenedTokens: "protocol:MCP|supported|contract",
    },
  },
  adoption: {
    evidence: {
      source: "GitHub",
      confidence: "medium",
      verified: false,
      updatedAt: "2026-03-13T16:00:00.000Z",
      emptyReason: null,
    },
    stars: 5400,
    forks: 320,
    downloads: 180000,
    packageName: "demo-agent",
    latestVersion: "1.4.0",
    tractionLabel: "180K downloads",
  },
  release: {
    evidence: {
      source: "GitHub",
      confidence: "medium",
      verified: true,
      updatedAt: "2026-03-13T16:00:00.000Z",
      emptyReason: null,
    },
    lastUpdatedAt: "2026-03-13T16:00:00.000Z",
    lastCrawledAt: "2026-03-13T16:30:00.000Z",
    lastIndexedAt: "2026-03-13T16:45:00.000Z",
    nextCrawlAt: "2026-03-14T16:45:00.000Z",
    lastVerifiedAt: "2026-03-13T17:00:00.000Z",
    highlights: [{ version: "1.4.0", createdAt: "2026-03-10T00:00:00.000Z", changelog: "Reliability improvements", fileCount: 12, zipByteSize: 2048 }],
  },
  execution: {
    evidence: {
      source: "capability-contract",
      confidence: "high",
      verified: true,
      updatedAt: "2026-03-13T17:00:00.000Z",
      emptyReason: null,
    },
    installCommand: "npm install demo-agent",
    setupComplexity: "medium",
    setupSteps: ["Install in a sandbox.", "Validate auth.", "Run smoke tests."],
    contract: {
      contractStatus: "ready",
      authModes: ["api_key"],
      requires: ["json"],
      forbidden: [],
      supportsMcp: true,
      supportsA2a: false,
      supportsStreaming: true,
      inputSchemaRef: "https://example.com/input.json",
      outputSchemaRef: "https://example.com/output.json",
      dataRegion: "us",
      contractUpdatedAt: "2026-03-13T17:00:00.000Z",
      sourceUpdatedAt: "2026-03-13T17:00:00.000Z",
      freshnessSeconds: 1200,
    },
    invocationGuide: {
      preferredApi: {
        snapshotUrl: "https://xpersona.co/api/v1/agents/demo-agent/snapshot",
        contractUrl: "https://xpersona.co/api/v1/agents/demo-agent/contract",
        trustUrl: "https://xpersona.co/api/v1/agents/demo-agent/trust",
      },
      curlExamples: ["curl -s https://xpersona.co/api/v1/agents/demo-agent/snapshot"],
      jsonRequestTemplate: { query: "hello" },
      jsonResponseTemplate: { ok: true },
      retryPolicy: {
        maxAttempts: 3,
        backoffMs: [500, 1500],
        retryableConditions: ["HTTP_429"],
      },
    },
    endpoints: {
      dossierUrl: "https://xpersona.co/api/v1/agents/demo-agent/dossier",
      snapshotUrl: "https://xpersona.co/api/v1/agents/demo-agent/snapshot",
      contractUrl: "https://xpersona.co/api/v1/agents/demo-agent/contract",
      trustUrl: "https://xpersona.co/api/v1/agents/demo-agent/trust",
    },
  },
  reliability: {
    evidence: {
      source: "trust-telemetry",
      confidence: "high",
      verified: true,
      updatedAt: "2026-03-13T17:00:00.000Z",
      emptyReason: null,
    },
    trust: {
      status: "ready",
      handshakeStatus: "VERIFIED",
      verificationFreshnessHours: 2,
      reputationScore: 91,
      p95LatencyMs: 480,
      successRate30d: 0.98,
      fallbackRate: 0.01,
      attempts30d: 120,
      trustUpdatedAt: "2026-03-13T17:00:00.000Z",
      trustConfidence: "high",
      sourceUpdatedAt: "2026-03-13T17:00:00.000Z",
      freshnessSeconds: 3600,
    },
    decisionGuardrails: {
      doNotUseIf: ["Contract freshness is stale."],
      safeUseWhen: ["Published contract available."],
      riskFlags: [],
      operationalConfidence: "high",
    },
    executionMetrics: {
      observedLatencyMsP50: 140,
      observedLatencyMsP95: 320,
      estimatedCostUsd: 0.01,
      uptime30d: 0.996,
      rateLimitRpm: 60,
      rateLimitBurst: 10,
      lastVerifiedAt: "2026-03-13T17:00:00.000Z",
      verificationSource: "probe",
    },
    runtimeMetrics: {
      successRate: 0.97,
      avgLatencyMs: 150,
      avgCostUsd: 0.02,
      hallucinationRate: 0.01,
      retryRate: 0.05,
      disputeRate: 0.0,
      p50Latency: 130,
      p95Latency: 310,
      lastUpdated: "2026-03-13T17:00:00.000Z",
    },
  },
  benchmarks: {
    evidence: {
      source: "benchmark-results",
      confidence: "medium",
      verified: true,
      updatedAt: "2026-03-13T17:00:00.000Z",
      emptyReason: null,
    },
    suites: [{ suiteName: "core", score: 89, accuracy: 0.96, latencyMs: 320, costUsd: 0.02, safetyViolations: 0, createdAt: "2026-03-13T17:00:00.000Z" }],
    failurePatterns: [{ type: "RATE_LIMIT", frequency: 3, lastSeen: "2026-03-13T16:00:00.000Z" }],
  },
  artifacts: {
    evidence: {
      source: "GitHub",
      confidence: "high",
      verified: false,
      updatedAt: "2026-03-13T17:00:00.000Z",
      emptyReason: null,
    },
    readme: "# Demo Agent\n\nTechnical notes.",
    readmeExcerpt: "Technical notes.",
    codeSnippets: ["console.log('hello')"],
    executableExamples: [{ language: "typescript", snippet: "console.log('hello')" }],
    parameters: {
      mode: { type: "string", required: true, description: "Execution mode" },
    },
    dependencies: ["zod"],
    permissions: ["network"],
    extractedFiles: [{ path: "README.md", content: "Technical notes." }],
    languages: ["TypeScript"],
    docsSourceLabel: "GitHub",
    editorialOverview: "Editorial overview",
    editorialQuality: {
      score: 84,
      threshold: 65,
      status: "ready",
      wordCount: 420,
      uniquenessScore: 78,
      reasons: [],
    },
  },
  media: {
    evidence: {
      source: "agent-media-assets",
      confidence: "high",
      verified: true,
      updatedAt: "2026-03-13T17:00:00.000Z",
      emptyReason: null,
    },
    primaryImageUrl: "https://cdn.example.com/demo.png",
    mediaAssetCount: 2,
    assets: [{ url: "https://cdn.example.com/demo.png", title: "Screenshot", caption: "Demo", altText: "Demo", assetKind: "image", sourcePageUrl: "https://example.com" }],
    demoUrl: "https://demo.example.com",
  },
  ownerResources: {
    evidence: {
      source: "claimed-owner",
      confidence: "high",
      verified: true,
      updatedAt: "2026-03-13T17:00:00.000Z",
      emptyReason: null,
    },
    hasCustomPage: true,
    customPageUpdatedAt: "2026-03-13T17:00:00.000Z",
    customLinks: [{ label: "Support", url: "https://support.example.com", kind: "custom" }],
    structuredLinks: {
      docsUrl: "https://docs.example.com",
      demoUrl: "https://demo.example.com",
      supportUrl: "https://support.example.com",
      pricingUrl: "https://example.com/pricing",
      statusUrl: "https://status.example.com",
    },
    customPage: {
      html: "<div>Custom</div>",
      css: "",
      js: "",
      widgetLayout: [],
      updatedAt: "2026-03-13T17:00:00.000Z",
    },
  },
  relatedAgents: {
    evidence: {
      source: "protocol-neighbors",
      confidence: "medium",
      verified: false,
      updatedAt: "2026-03-13T17:00:00.000Z",
      emptyReason: null,
    },
    items: [
      {
        id: "alt-1",
        slug: "alt-agent",
        name: "Alt Agent",
        description: "Alternative",
        source: "GITHUB_OPENCLEW",
        protocols: ["MCP"],
        capabilities: ["automation"],
        safetyScore: 80,
        overallRank: 77,
        updatedAt: "2026-03-13T15:00:00.000Z",
        createdAt: "2026-03-10T00:00:00.000Z",
        downloads: 1200,
      },
    ],
    links: {
      hub: "/agent",
      source: "/agent/source/github-openclew",
      protocols: [{ label: "MCP", href: "/agent/protocol/mcp" }],
    },
  },
};

describe("Agent page dossier SSR", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAgentDossier.mockResolvedValue(dossierFixture);
    mockGetPublicAgentEvidencePack.mockResolvedValue({
      card: {
        highlights: ["Schema refs published", "Trust evidence available"],
        stats: [
          { label: "Trust score", value: "0.91" },
          { label: "Compatibility", value: "MCP, OpenClaw" },
        ],
      },
      facts: [
        {
          factKey: "vendor",
          label: "Vendor",
          value: "Demo",
          category: "vendor",
          href: "https://github.com/demo/demo-agent",
          sourceUrl: "https://github.com/demo/demo-agent",
          sourceType: "profile",
          confidence: "medium",
          observedAt: "2026-03-13T17:00:00.000Z",
          isPublic: true,
        },
        {
          factKey: "schema_refs",
          label: "Machine-readable schemas",
          value: "OpenAPI or schema references published",
          category: "artifact",
          href: "https://example.com/input.json",
          sourceUrl: "https://xpersona.co/api/v1/agents/demo-agent/contract",
          sourceType: "contract",
          confidence: "high",
          observedAt: "2026-03-13T17:00:00.000Z",
          isPublic: true,
        },
      ],
      changeEvents: [
        {
          eventType: "release",
          title: "Release 1.4.0",
          description: "Reliability improvements",
          href: "https://github.com/demo/demo-agent",
          sourceUrl: "https://github.com/demo/demo-agent",
          sourceType: "release",
          confidence: "medium",
          observedAt: "2026-03-10T00:00:00.000Z",
          isPublic: true,
        },
      ],
    });
  });

  it("renders the new dossier sections and removes the old nested shell", async () => {
    const element = await AgentPage({
      params: Promise.resolve({ slug: "demo-agent" }),
      searchParams: Promise.resolve({ from: "/search?q=demo" }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Agent Profile");
    expect(html).toContain("Execution Readiness");
    expect(html).toContain("Reliability &amp; Benchmarks");
    expect(html).toContain("Machine Appendix");
    expect(html).toContain("Custom technical brief");
    expect(html).toContain("Quick Facts");
    expect(html).toContain("Release &amp; Crawl Timeline");
    expect(html).not.toContain("Agent Experience");
  });

  it("dedupes source/homepage CTA links in the summary band", async () => {
    const element = await AgentPage({
      params: Promise.resolve({ slug: "demo-agent" }),
      searchParams: Promise.resolve({}),
    });
    const html = renderToStaticMarkup(element);
    const matches = html.match(/View Source/g) ?? [];

    expect(matches).toHaveLength(1);
  });

  it("includes JSON-LD and alternate dossier link", async () => {
    const element = await AgentPage({
      params: Promise.resolve({ slug: "demo-agent" }),
      searchParams: Promise.resolve({}),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("application/ld+json");
    expect(html).toContain("rel=\"alternate\"");
    expect(html).toContain("/api/v1/agents/demo-agent/dossier");
    expect(html).toContain("/api/v1/agents/demo-agent/facts");
    expect(html).toContain("FAQPage");
    expect(html).toContain("Dataset");
  });

  it("generateMetadata uses dossier SEO copy and indexing rules", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "demo-agent" }),
      searchParams: Promise.resolve({}),
    });

    expect(metadata.title).toBe("Demo Agent | Xpersona Agent");
    expect(metadata.description).toBe("Demo Agent technical dossier on Xpersona.");
    expect(metadata.robots).toEqual({ index: true, follow: true });
  });
});
