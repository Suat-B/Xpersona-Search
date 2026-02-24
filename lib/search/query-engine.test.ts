import { describe, it, expect } from "vitest";
import {
  normalizeQuery,
  sanitizeForStorage,
  parseSearchOperators,
  expandWithSynonyms,
  buildWebsearchQuery,
  parseSafetyFilter,
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

  it("parses quoted source values", () => {
    const result = parseSearchOperators('agent source:"github openclaw"');
    expect(result.textQuery).toBe("agent");
    expect(result.fieldFilters.source).toBe("GITHUB OPENCLAW");
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

  it("keeps expansion bounded for medium-length queries", () => {
    const result = expandWithSynonyms("ai trading bot");
    expect(result).toContain("ai trading bot");
    expect(result).toContain('"artificial intelligence"');
  });

  it("does not expand very long queries to avoid noisy recall", () => {
    const result = expandWithSynonyms("ai trading bot for crypto automation");
    expect(result).toBe("ai trading bot for crypto automation");
  });

  it("expands newly added assistant synonyms", () => {
    const result = expandWithSynonyms("assistant");
    expect(result).toContain('"ai assistant"');
  });

  it("does not alter advanced syntax with parentheses", () => {
    const result = expandWithSynonyms("agent (trading OR crypto)");
    expect(result).toBe("agent (trading OR crypto)");
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

  it("returns empty for unmatched quote to avoid tsquery parse failures", () => {
    const result = buildWebsearchQuery('"agent phrase');
    expect(result).toBe("");
  });
});

describe("parseSafetyFilter", () => {
  it("parses greater-than", () => {
    expect(parseSafetyFilter(">80")).toEqual({ operator: ">=", value: 80 });
  });

  it("parses less-than", () => {
    expect(parseSafetyFilter("<20")).toEqual({ operator: "<=", value: 20 });
  });

  it("parses equals", () => {
    expect(parseSafetyFilter("=55")).toEqual({ operator: "=", value: 55 });
  });

  it("parses bare number as equals", () => {
    expect(parseSafetyFilter("42")).toEqual({ operator: "=", value: 42 });
  });

  it("rejects out-of-range values", () => {
    expect(parseSafetyFilter("101")).toBeNull();
  });
});

describe("processQuery", () => {
  it("runs full pipeline", () => {
    const result = processQuery("  llm protocol:MCP  ");
    expect(result.parsed.textQuery).toBe("llm");
    expect(result.parsed.fieldFilters.protocol).toBe("MCP");
    expect(result.interpretedQuery).toBe("llm");
    expect(result.expandedQuery).toContain("llm");
    expect(result.expandedQuery).toContain('"large language model"');
    expect(result.websearchInput.length).toBeGreaterThan(0);
  });

  it("handles query with no operators or synonyms", () => {
    const result = processQuery("abcdefghijkl");
    expect(result.parsed.textQuery).toBe("abcdefghijkl");
    expect(result.interpretedQuery).toBe("abcdefghijkl");
    expect(result.expandedQuery).toBe("abcdefghijkl");
    expect(result.parsed.fieldFilters).toEqual({});
  });

  it("handles XSS attempt", () => {
    const result = processQuery('<script>alert("xss")</script>');
    expect(result.parsed.textQuery).not.toContain("<");
    expect(result.parsed.textQuery).not.toContain(">");
  });

  it("interprets conversational natural-language intent", () => {
    const result = processQuery("I want to make a movie");
    expect(result.interpretedQuery).toContain("build");
    expect(result.interpretedQuery).toContain("video");
    expect(result.interpretation.isNaturalLanguage).toBe(true);
  });
});
