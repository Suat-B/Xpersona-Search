import { describe, expect, it } from "vitest";
import {
  canonicalizeSource,
  expandSourceBuckets,
  sourceDisplayLabel,
} from "./source-taxonomy";

describe("source taxonomy", () => {
  it("canonicalizes legacy and prefix-based source aliases", () => {
    expect(canonicalizeSource("GITHUB_A2A", "a2a:sample")).toBe("A2A_REGISTRY");
    expect(canonicalizeSource("MCP_REGISTRY", "smithery:test/server")).toBe("SMITHERY");
    expect(canonicalizeSource("OTHER", "n8n:6270")).toBe("N8N_TEMPLATES");
  });

  it("expands registry bucket with new marketplace sources", () => {
    const expanded = expandSourceBuckets(["REGISTRY"]);
    expect(expanded).toContain("A2A_REGISTRY");
    expect(expanded).toContain("SMITHERY");
    expect(expanded).toContain("DIFY_MARKETPLACE");
    expect(expanded).toContain("N8N_TEMPLATES");
  });

  it("returns human-friendly labels for canonical sources", () => {
    expect(sourceDisplayLabel("SMITHERY")).toBe("Smithery");
    expect(sourceDisplayLabel("DIFY_MARKETPLACE")).toBe("Dify");
    expect(sourceDisplayLabel("GOOGLE_CLOUD_MARKETPLACE")).toBe("Google Cloud");
  });
});
