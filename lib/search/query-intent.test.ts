import { describe, expect, it } from "vitest";
import { interpretIntentQuery } from "./query-intent";

describe("interpretIntentQuery", () => {
  it("rewrites conversational query into intent terms", () => {
    const result = interpretIntentQuery("I want to make a movie");
    expect(result.interpretedText).toContain("build");
    expect(result.interpretedText).toContain("video");
    expect(result.isNaturalLanguage).toBe(true);
  });

  it("keeps technical query mostly intact", () => {
    const result = interpretIntentQuery("langchain mcp server");
    expect(result.interpretedText).toBe("langchain mcp server");
    expect(result.isNaturalLanguage).toBe(false);
  });
});

