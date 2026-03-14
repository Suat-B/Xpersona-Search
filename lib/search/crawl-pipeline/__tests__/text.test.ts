import { describe, expect, it } from "vitest";
import { buildSnippet, chunkText, extractLinksFromHtml } from "../text";

describe("crawl-pipeline/text", () => {
  it("chunks text with overlap", () => {
    const chunks = chunkText("abcdefghijklmnopqrstuvwxyz", 10, 3);
    expect(chunks).toEqual(["abcdefghij", "hijklmnopq", "opqrstuvwx", "vwxyz"]);
  });

  it("builds bounded snippets", () => {
    const snippet = buildSnippet("one two three four five six seven", 12);
    expect(snippet.length).toBeLessThanOrEqual(12);
    expect(snippet.endsWith("...")).toBe(true);
  });

  it("extracts and normalizes unique public https links", () => {
    const html = `
      <a href="/docs?utm_source=ads">Docs</a>
      <a href="https://foo.com/path#frag">Foo</a>
      <a href="http://foo.com/insecure">Nope</a>
      <img src="/assets/logo.png?gclid=1" />
      <script src="https://localhost/test.js"></script>
      <a href="https://foo.com/path#other">Foo Duplicate</a>
    `;
    const out = extractLinksFromHtml(html, "https://example.com/start");
    expect(out.sort()).toEqual(
      [
        "https://example.com/assets/logo.png",
        "https://example.com/docs",
        "https://foo.com/path",
      ].sort()
    );
  });
});

