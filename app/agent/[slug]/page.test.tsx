import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

const mockGetPublicAgentPageData = vi.hoisted(() => vi.fn());

vi.mock("@/lib/agents/public-agent-page", () => ({
  getPublicAgentPageData: mockGetPublicAgentPageData,
  shouldEnableMachineBlocks: () => true,
}));

vi.mock("@/lib/agents/editorial-content", () => ({
  resolveEditorialContent: async () => ({
    sections: {
      overview: "Overview text",
      bestFor: "Best for text",
      notFor: "Not for text",
      setup: ["Setup text"],
      workflows: ["One", "Two", "Three"],
      limitations: "Limitations text",
      alternatives: "Alternatives text",
      faq: [{ q: "Q1", a: "A1" }],
      releaseHighlights: [],
    },
    quality: {
      score: 82,
      threshold: 65,
      status: "ready",
      wordCount: 420,
      uniquenessScore: 71,
      reasons: [],
    },
    setupComplexity: "medium",
    lastReviewedAt: "2026-02-25T10:00:30.000Z",
    dataSources: ["https://github.com/example/docker-jumpserver-node"],
    useCases: ["developer-automation"],
  }),
  isThinContent: () => false,
}));

vi.mock("@/lib/agents/hub-data", () => ({
  getAgentsByProtocol: async () => [],
  sourceSlugFromValue: (value: string) => value.toLowerCase(),
}));

vi.mock("@/components/agent/AgentPageClient", () => ({
  AgentPageClient: () => <div data-testid="agent-page-client">Interactive Agent Content</div>,
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue(null),
}));

const mockNotFound = vi.hoisted(() => vi.fn(() => {
  throw new Error("notFound");
}));

vi.mock("next/navigation", () => ({
  notFound: mockNotFound,
}));

import AgentPage, { generateMetadata } from "./page";

describe("Agent page SSR extractability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPublicAgentPageData.mockResolvedValue({
      id: "agent-1",
      slug: "docker-jumpserver-node",
      name: "Docker Jumpserver Node",
      description: "A secure Docker jumpserver agent for Node operations.",
      url: "https://github.com/example/docker-jumpserver-node",
      homepage: "https://example.com",
      source: "GITHUB_OPENCLEW",
      capabilities: ["remote execution", "deployment"],
      protocols: ["MCP", "A2A"],
      safetyScore: 93,
      overallRank: 97.5,
      claimStatus: "CLAIMED",
      verificationTier: "SILVER",
      hasCustomPage: true,
      trustScore: 0.91,
      trust: null,
      claimedByName: "Maintainer",
      readmeExcerpt: "This agent helps automate secure deployments.",
      updatedAtIso: "2026-02-25T10:00:00.000Z",
      canonicalUrl: "https://xpersona.co/agent/docker-jumpserver-node",
      snapshotUrl: "https://xpersona.co/api/v1/agents/docker-jumpserver-node/snapshot",
      sourceUrl: "https://github.com/example/docker-jumpserver-node",
      keyLinks: [
        { label: "Homepage", url: "https://example.com" },
        { label: "Snapshot API", url: "https://xpersona.co/api/v1/agents/docker-jumpserver-node/snapshot" },
      ],
      keywords: ["MCP", "A2A", "remote execution"],
      structuredSummary: [
        { label: "Name", value: "Docker Jumpserver Node" },
        { label: "Trust Score", value: "0.91" },
      ],
      contractUrl: "https://xpersona.co/api/v1/agents/docker-jumpserver-node/contract",
      trustUrl: "https://xpersona.co/api/v1/agents/docker-jumpserver-node/trust",
      machineBlocks: {
        schemaVersion: "agent-page-machine-v1",
        generatedAt: "2026-02-25T10:00:30.000Z",
        machineIdentity: {
          agentId: "agent-1",
          slug: "docker-jumpserver-node",
          canonicalUrl: "https://xpersona.co/agent/docker-jumpserver-node",
          snapshotUrl: "https://xpersona.co/api/v1/agents/docker-jumpserver-node/snapshot",
          contractUrl: "https://xpersona.co/api/v1/agents/docker-jumpserver-node/contract",
          trustUrl: "https://xpersona.co/api/v1/agents/docker-jumpserver-node/trust",
          source: "GITHUB_OPENCLEW",
          sourceUrl: "https://github.com/example/docker-jumpserver-node",
          homepage: "https://example.com",
          lastUpdated: "2026-02-25T10:00:00.000Z",
          generatedAt: "2026-02-25T10:00:30.000Z",
        },
        executionContractSummary: {
          contractStatus: "ready",
          authModes: ["api_key"],
          requires: ["json"],
          forbidden: [],
          supportsMcp: true,
          supportsA2a: true,
          supportsStreaming: false,
          inputSchemaRef: null,
          outputSchemaRef: null,
          dataRegion: null,
          contractUpdatedAt: "2026-02-25T10:00:00.000Z",
          sourceUpdatedAt: "2026-02-25T10:00:00.000Z",
          freshnessSeconds: 30,
        },
        trustAndReliability: {
          status: "ready",
          handshakeStatus: "VERIFIED",
          verificationFreshnessHours: 2,
          reputationScore: 91,
          p95LatencyMs: 450,
          successRate30d: 0.98,
          fallbackRate: 0.02,
          attempts30d: 50,
          trustUpdatedAt: "2026-02-25T09:00:00.000Z",
          trustConfidence: "high",
          sourceUpdatedAt: "2026-02-25T09:00:00.000Z",
          freshnessSeconds: 3600,
        },
        invocationGuide: {
          preferredApi: {
            snapshotUrl: "https://xpersona.co/api/v1/agents/docker-jumpserver-node/snapshot",
            contractUrl: "https://xpersona.co/api/v1/agents/docker-jumpserver-node/contract",
            trustUrl: "https://xpersona.co/api/v1/agents/docker-jumpserver-node/trust",
          },
          curlExamples: ["curl -s \"https://xpersona.co/api/v1/agents/docker-jumpserver-node/snapshot\""],
          jsonRequestTemplate: { query: "hello" },
          jsonResponseTemplate: { ok: true },
          retryPolicy: {
            maxAttempts: 3,
            backoffMs: [500, 1500, 3500],
            retryableConditions: ["HTTP_429", "HTTP_503", "NETWORK_TIMEOUT"],
          },
        },
        decisionGuardrails: {
          doNotUseIf: [],
          safeUseWhen: ["Contract is available."],
          riskFlags: [],
          operationalConfidence: "high",
        },
        capabilityMatrix: {
          rows: [
            {
              key: "MCP",
              type: "protocol",
              support: "supported",
              confidenceSource: "contract",
              notes: "Confirmed by capability contract",
            },
          ],
          flattenedTokens: "protocol:MCP|supported|contract",
        },
      },
      agentForClient: { id: "agent-1", slug: "docker-jumpserver-node", name: "Docker Jumpserver Node" },
    });
  });

  it("renders key agent content in HTML without JS execution", async () => {
    const element = await AgentPage({ params: Promise.resolve({ slug: "docker-jumpserver-node" }) });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Docker Jumpserver Node");
    expect(html).toContain("A secure Docker jumpserver agent for Node operations.");
    expect(html).toContain("MCP, A2A");
    expect(html).toContain("remote execution, deployment");
  });

  it("includes JSON-LD and snapshot alternate link", async () => {
    const element = await AgentPage({ params: Promise.resolve({ slug: "docker-jumpserver-node" }) });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("application/ld+json");
    expect(html).toContain("SoftwareApplication");
    expect(html).toContain("rel=\"alternate\"");
    expect(html).toContain("/api/v1/agents/docker-jumpserver-node/snapshot");
  });

  it("includes machine JSON script blocks and sections", async () => {
    const element = await AgentPage({ params: Promise.resolve({ slug: "docker-jumpserver-node" }) });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Execution Contract (AI)");
    expect(html).toContain("Invocation Templates (AI)");
    expect(html).toContain("Trust and Reliability (AI)");
    expect(html).toContain("Decision Guardrails (AI)");
    expect(html).toContain("Capability Matrix (AI)");
    expect(html).toContain("id=\"machine-contract\"");
    expect(html).toContain("id=\"machine-invocation\"");
    expect(html).toContain("id=\"machine-trust\"");
    expect(html).toContain("id=\"machine-guardrails\"");
    expect(html).toContain("id=\"machine-capability-matrix\"");
  });

  it("generateMetadata includes canonical and crawl directives", async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: "docker-jumpserver-node" }) });

    expect(metadata.title).toBe("Docker Jumpserver Node | Xpersona Agent");
    expect(metadata.alternates?.canonical).toBe("https://xpersona.co/agent/docker-jumpserver-node");
    expect(metadata.robots).toEqual({ index: true, follow: true });
  });
});
