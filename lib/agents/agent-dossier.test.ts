import { describe, expect, it } from "vitest";
import {
  buildCoverageProtocols,
  buildPrimaryLinks,
  buildSectionEvidence,
} from "@/lib/agents/agent-dossier";

describe("agent-dossier helpers", () => {
  it("marks contract-backed protocols as verified and declared-only protocols as self-declared", () => {
    const coverage = buildCoverageProtocols({
      declaredProtocols: ["MCP", "OPENCLAW"],
      supportsMcp: true,
      supportsA2a: false,
    });

    expect(coverage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ protocol: "MCP", status: "verified" }),
        expect.objectContaining({ protocol: "OPENCLAW", status: "self-declared" }),
      ])
    );
  });

  it("builds explicit missing evidence metadata", () => {
    expect(
      buildSectionEvidence({
        source: "no-docs",
        confidence: "low",
        emptyReason: "No documentation is available.",
      })
    ).toEqual({
      source: "no-docs",
      confidence: "low",
      verified: false,
      updatedAt: null,
      emptyReason: "No documentation is available.",
    });
  });

  it("dedupes primary links when homepage and source point to the same URL", () => {
    const links = buildPrimaryLinks({
      source: "GITHUB_OPENCLEW",
      sourceUrl: "https://github.com/demo/agent",
      homepage: "https://github.com/demo/agent/",
      githubUrl: "https://github.com/demo/agent.git",
      ownerResources: {
        docsUrl: null,
        demoUrl: null,
        supportUrl: null,
        pricingUrl: null,
        statusUrl: null,
      },
      customLinks: [],
    });

    expect(links).toHaveLength(1);
    expect(links[0]?.label).toBe("View Source");
  });
});
