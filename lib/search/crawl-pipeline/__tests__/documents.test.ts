import { describe, expect, it } from "vitest";
import { buildChunkDocuments, scoreDocument } from "../documents";

describe("crawl-pipeline/documents", () => {
  it("scores content in 0..100 ranges", () => {
    const score = scoreDocument({
      bodyText: "Reliable agent platform documentation with setup steps and examples.",
      title: "Agent Setup",
      source: "WEB",
    });
    expect(score.quality).toBeGreaterThanOrEqual(0);
    expect(score.quality).toBeLessThanOrEqual(100);
    expect(score.safety).toBeGreaterThanOrEqual(0);
    expect(score.safety).toBeLessThanOrEqual(100);
    expect(score.freshness).toBeGreaterThanOrEqual(0);
    expect(score.freshness).toBeLessThanOrEqual(100);
    expect(score.confidence).toBeGreaterThanOrEqual(0);
    expect(score.confidence).toBeLessThanOrEqual(100);
  });

  it("builds a web_page head chunk and web_chunk tail entries", () => {
    const plainText = "a".repeat(1000);
    const docs = buildChunkDocuments({
      source: "WEB",
      sourceId: "seed-1",
      canonicalUrl: "https://example.com/page",
      domain: "example.com",
      title: "Example Page",
      plainText,
    });
    expect(docs.length).toBeGreaterThan(1);
    expect(docs[0]?.docType).toBe("web_page");
    expect(docs.slice(1).every((d) => d.docType === "web_chunk")).toBe(true);
  });
});

