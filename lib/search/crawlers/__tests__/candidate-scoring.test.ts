import { describe, expect, it } from "vitest";
import { scoreCandidate } from "../candidate-scoring";

describe("candidate scoring", () => {
  it("scores MCP/OpenClaw signals high", () => {
    const scored = scoreCandidate({
      name: "awesome mcp agent",
      description: "openclaw skill for model context protocol",
      originSource: "MCP_REGISTRY",
    });
    expect(scored.confidence).toBeGreaterThanOrEqual(80);
    expect(scored.reasons.length).toBeGreaterThan(0);
  });

  it("keeps neutral items low", () => {
    const scored = scoreCandidate({
      name: "random project",
      description: "utility scripts",
      originSource: "UNKNOWN",
    });
    expect(scored.confidence).toBeLessThan(60);
  });
});

