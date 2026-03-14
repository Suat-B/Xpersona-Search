import { describe, expect, it } from "vitest";
import {
  capabilityTokenToLabel,
  normalizeCapabilityToken,
  normalizeCapabilityTokens,
  parseCapabilityParam,
  sanitizeCapabilityLabels,
} from "./capability-tokens";

describe("capability tokens", () => {
  it("normalizes capability labels into URL-safe tokens", () => {
    expect(normalizeCapabilityToken("Web browsing")).toBe("web-browsing");
    expect(normalizeCapabilityToken("PDF")).toBe("pdf");
    expect(normalizeCapabilityToken("A2A / MCP")).toBe("a2a-mcp");
  });

  it("deduplicates sanitized capability labels while preserving display form", () => {
    expect(sanitizeCapabilityLabels([" Web browsing ", "web browsing", "PDF", "pdf"])).toEqual([
      "Web browsing",
      "PDF",
    ]);
  });

  it("parses and normalizes capability query params", () => {
    expect(parseCapabilityParam("web browsing,PDF,web-browsing")).toEqual([
      "web-browsing",
      "pdf",
    ]);
    expect(normalizeCapabilityTokens(["Research", "research"])).toEqual(["research"]);
  });

  it("humanizes capability tokens for metadata and UI", () => {
    expect(capabilityTokenToLabel("pdf")).toBe("PDF");
    expect(capabilityTokenToLabel("web-browsing")).toBe("Web Browsing");
    expect(capabilityTokenToLabel("a2a")).toBe("A2A");
  });
});
