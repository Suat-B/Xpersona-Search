import { describe, expect, it } from "vitest";
import { computeContentHash, normalizedUrlHash, simhash64 } from "../hash";

describe("crawl-pipeline/hash", () => {
  it("normalizes URL hash across fragments and tracking params", () => {
    const a = normalizedUrlHash(
      "https://example.com/docs/page/?utm_source=test&gclid=abc#section-1"
    );
    const b = normalizedUrlHash("https://example.com/docs/page");
    expect(a).toBe(b);
  });

  it("normalizes content hash across case and whitespace", () => {
    const a = computeContentHash({
      title: "Hello World",
      snippet: "Sample Snippet",
      bodyText: "AI agents   are   useful.",
    });
    const b = computeContentHash({
      title: " hello world ",
      snippet: "sample snippet",
      bodyText: "ai AGENTS are useful.",
    });
    expect(a).toBe(b);
  });

  it("produces a 64-bit hex simhash", () => {
    const out = simhash64("agentic search crawler architecture for web pages");
    expect(out).toMatch(/^[0-9a-f]{16}$/);
  });
});

