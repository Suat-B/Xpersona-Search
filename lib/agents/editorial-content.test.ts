import { describe, expect, it } from "vitest";
import {
  buildFallbackContentMetaFromSearchResult,
  evaluateEditorialContent,
  normalizeClawhubPayload,
} from "@/lib/agents/editorial-content";

describe("editorial-content", () => {
  it("normalizes clawhub payload", () => {
    const normalized = normalizeClawhubPayload({
      clawhub: {
        stats: { downloads: 125000 },
        versions: [
          { version: "1.2.0", createdAt: 1_738_000_000_000, changelog: "Bug fixes and better docs" },
        ],
        archives: [
          { version: "1.2.0", fileCount: 120, zipByteSize: 40200, textFiles: [{ path: "README.md" }] },
        ],
        pageMeta: {
          title: "Sample Agent",
          canonicalUrl: "https://clawhub.ai/sample/agent",
        },
      },
    });

    expect(normalized?.downloads).toBe(125000);
    expect(normalized?.versions[0]?.version).toBe("1.2.0");
    expect(normalized?.canonicalUrl).toContain("clawhub.ai");
  });

  it("scores complete editorial content as ready", () => {
    const score = evaluateEditorialContent({
      overview:
        "This agent orchestrates multi-step research workflows with structured result validation and source citations. It emphasizes auditable steps, deterministic checks, and a repeatable checklist for validation, rollout, and post-deploy review across multiple data sources and team handoffs.",
      bestFor:
        "Best for teams building repeatable research pipelines with quality checks and machine-readable outputs. Ideal when compliance, monitoring, and change management require documented decisions and predictable escalation paths for reliability incidents.",
      notFor: "Not ideal for zero-configuration environments with strict no-code constraints.",
      setup: [
        "Set environment variables and required auth keys.",
        "Confirm protocol compatibility and required permissions.",
        "Run a smoke execution before production rollout.",
      ],
      workflows: [
        "Discover candidates, validate trust, and select protocol fit.",
        "Run snapshot/contract/trust preflight before invocation.",
        "Monitor reliability trends and rotate to fallback agents when needed.",
      ],
      limitations:
        "Limitations include varying source documentation quality and incomplete metadata for some third-party listings. Teams should still validate contracts and trust payloads before relying on any single source.",
      alternatives:
        "Compare alternatives in same protocol and use-case pages and prioritize fresher trust evidence. Benchmark candidates against reliability trends and long-run success rates to pick stable defaults.",
      extractedFiles: [
        {
          path: "README.md",
          content:
            "This agent provides structured workflows, protocol compatibility, and trust verification guidance.",
        },
      ],
      faq: [
        { q: "What does this agent do?", a: "It automates multi-step workflows." },
        { q: "How do I validate safety?", a: "Use trust and contract endpoints." },
        { q: "How hard is setup?", a: "Medium setup with env vars." },
        { q: "When to switch?", a: "Switch when trust becomes stale." },
        { q: "Does it support protocol checks?", a: "Yes, verify in contract." },
        { q: "How often to review?", a: "Review weekly for production." },
      ],
      releaseHighlights: [{ version: "1.0.0", createdAt: null, changelog: "Initial release", fileCount: 45, zipByteSize: 18000 }],
    });

    expect(score.status).toBe("ready");
    expect(score.score).toBeGreaterThanOrEqual(score.threshold);
    expect(score.wordCount).toBeGreaterThan(220);
  });

  it("builds fallback content meta from search rows", () => {
    const meta = buildFallbackContentMetaFromSearchResult({
      description: "Agent for code automation and deployment workflows with CI support.",
      capabilities: ["automation", "deployment", "ci"],
      openclawData: null,
      createdAt: new Date("2026-02-20T10:00:00.000Z"),
    });

    expect(meta.hasEditorialContent).toBe(true);
    expect(meta.bestFor).toContain("automation");
    expect(meta.qualityScore).not.toBeNull();
  });
});
