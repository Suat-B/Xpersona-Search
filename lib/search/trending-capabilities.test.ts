import { describe, expect, it } from "vitest";
import { buildTrendingCapabilities } from "@/lib/search/trending-capabilities";

describe("buildTrendingCapabilities", () => {
  it("counts explicit capability tokens and normalizes labels", () => {
    const result = buildTrendingCapabilities(
      [
        {
          name: "Agent One",
          capabilities: ["Web browsing", "PDF"],
          protocols: [],
        },
        {
          name: "Agent Two",
          capabilities: ["web-browsing", "Codegen"],
          protocols: [],
        },
      ],
      5
    );

    expect(result).toEqual([
      { name: "Web Browsing", count: 2 },
      { name: "Codegen", count: 1 },
      { name: "PDF", count: 1 },
    ]);
  });

  it("falls back to inferred capability clusters when explicit capabilities are empty", () => {
    const result = buildTrendingCapabilities(
      [
        {
          name: "Browser automation agent",
          description: "Helps with coding and research workflows",
          capabilities: [],
          protocols: ["MCP"],
        },
        {
          name: "Coding assistant",
          description: "Code generation and debugging support",
          capabilities: [],
          protocols: [],
        },
      ],
      5
    );

    expect(result).toEqual([
      { name: "Coding", count: 2 },
      { name: "Automation", count: 1 },
      { name: "Research", count: 1 },
    ]);
  });
});
