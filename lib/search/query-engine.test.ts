import { describe, it, expect } from "vitest";
import {
  normalizeQuery,
  sanitizeForStorage,
  parseSearchOperators,
  expandWithSynonyms,
  buildWebsearchQuery,
  processQuery,
} from "./query-engine";

describe("normalizeQuery", () => {
  it("trims whitespace", () => {
    expect(normalizeQuery("  hello world  ")).toBe("hello world");
  });

  it("collapses multiple spaces", () => {
    expect(normalizeQuery("hello   world")).toBe("hello world");
  });

  it("strips HTML angle brackets", () => {
    expect(normalizeQuery("<script>alert('xss')</script>")).toBe("scriptalert('xss')/script");
  });

  it("truncates to 500 characters", () => {
    const longQuery = "a".repeat(600);
    expect(normalizeQuery(longQuery).length).toBe(500);
  });

  it("handles empty string", () => {
    expect(normalizeQuery("")).toBe("");
  });
});

describe("sanitizeForStorage", () => {
  it("strips angle brackets", () => {
    expect(sanitizeForStorage("<b>bold</b>")).toBe("bbold/b");
  });

  it("preserves normal text", () => {
    expect(sanitizeForStorage("crypto trading agent")).toBe("crypto trading agent");
  });

  it("trims whitespace", () => {
    expect(sanitizeForStorage("  hello  ")).toBe("hello");
  });
});

describe("parseSearchOperators", () => {
  it("extracts protocol operator", () => {
    const result = parseSearchOperators("agent protocol:MCP");
    expect(result.textQuery).toBe("agent");
    expect(result.fieldFilters.protocol).toBe("MCP");
  });

  it("normalizes OPENCLAW to OPENCLEW", () => {
    const result = parseSearchOperators("protocol:openclaw search");
    expect(result.fieldFilters.protocol).toBe("OPENCLEW");
  });

  it("extracts lang operator", () => {
    const result = parseSearchOperators("trading lang:python");
    expect(result.textQuery).toBe("trading");
    expect(result.fieldFilters.lang).toBe("python");
  });

  it("extracts language operator", () => {
    const result = parseSearchOperators("bot language:TypeScript");
    expect(result.textQuery).toBe("bot");
    expect(result.fieldFilters.lang).toBe("typescript");
  });

  it("extracts safety operator", () => {
    const result = parseSearchOperators("agent safety:>80");
    expect(result.textQuery).toBe("agent");
    expect(result.fieldFilters.safety).toBe(">80");
  });

  it("extracts source operator", () => {
    const result = parseSearchOperators("llm source:github");
    expect(result.textQuery).toBe("llm");
    expect(result.fieldFilters.source).toBe("GITHUB");
  });

  it("handles multiple operators", () => {
    const result = parseSearchOperators("trading protocol:A2A lang:python safety:>90");
    expect(result.textQuery).toBe("trading");
    expect(result.fieldFilters.protocol).toBe("A2A");
    expect(result.fieldFilters.lang).toBe("python");
    expect(result.fieldFilters.safety).toBe(">90");
  });

  it("returns original query when no operators", () => {
    const result = parseSearchOperators("crypto trading bot");
    expect(result.textQuery).toBe("crypto trading bot");
    expect(result.fieldFilters).toEqual({});
  });

  it("preserves the original query", () => {
    const result = parseSearchOperators("agent protocol:MCP");
    expect(result.originalQuery).toBe("agent protocol:MCP");
  });
});

describe("expandWithSynonyms", () => {
  it("expands known synonyms", () => {
    const result = expandWithSynonyms("llm");
    expect(result).toContain("llm");
    expect(result).toContain('"large language model"');
    expect(result).toContain('"language model"');
  });

  it("returns original if no synonyms found", () => {
    const result = expandWithSynonyms("xyznonexistent");
    expect(result).toBe("xyznonexistent");
  });

  it("expands chatbot", () => {
    const result = expandWithSynonyms("chatbot");
    expect(result).toContain('"conversational ai"');
  });

  it("handles multi-word keys", () => {
    const result = expandWithSynonyms("code review");
    expect(result).toContain('"code analysis"');
  });

  it("handles multiple tokens with some having synonyms", () => {
    const result = expandWithSynonyms("ai trading");
    expect(result).toContain('"artificial intelligence"');
    expect(result).toContain('"algorithmic trading"');
  });
});

describe("buildWebsearchQuery", () => {
  it("cleans dangerous characters", () => {
    const result = buildWebsearchQuery("hello; DROP TABLE agents--");
    expect(result).not.toContain(";");
    expect(result).not.toContain("'");
  });

  it("collapses whitespace", () => {
    expect(buildWebsearchQuery("hello   world")).toBe("hello world");
  });

  it("returns empty for empty input", () => {
    expect(buildWebsearchQuery("")).toBe("");
  });

  it("preserves quotes for phrase search", () => {
    const result = buildWebsearchQuery('"exact phrase"');
    expect(result).toContain("exact phrase");
  });

  it("preserves minus for exclusion", () => {
    const result = buildWebsearchQuery("agent -deprecated");
    expect(result).toContain("-deprecated");
  });
});

describe("processQuery", () => {
  it("runs full pipeline", () => {
    const result = processQuery("  llm protocol:MCP  ");
    expect(result.parsed.textQuery).toBe("llm");
    expect(result.parsed.fieldFilters.protocol).toBe("MCP");
    expect(result.expandedQuery).toContain("llm");
    expect(result.expandedQuery).toContain('"large language model"');
    expect(result.websearchInput.length).toBeGreaterThan(0);
  });

  it("handles query with no operators or synonyms", () => {
    const result = processQuery("abcdefghijkl");
    expect(result.parsed.textQuery).toBe("abcdefghijkl");
    expect(result.expandedQuery).toBe("abcdefghijkl");
    expect(result.parsed.fieldFilters).toEqual({});
  });

  it("handles XSS attempt", () => {
    const result = processQuery('<script>alert("xss")</script>');
    expect(result.parsed.textQuery).not.toContain("<");
    expect(result.parsed.textQuery).not.toContain(">");
  });
});
