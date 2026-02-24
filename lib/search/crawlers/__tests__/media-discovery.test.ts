import { describe, it, expect, vi } from "vitest";
import { canCrawlHomepage, discoverMediaAssets } from "../media-discovery";

describe("media discovery", () => {
  it("extracts markdown image and artifact links", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        headers: new Headers({
          "content-type": "image/png",
          "content-length": "1234",
        }),
      })
    );
    const markdown = `
![arch](./docs/architecture.png)
[OpenAPI](./openapi.yaml)
`;
    const assets = await discoverMediaAssets({
      sourcePageUrl: "https://github.com/org/repo",
      markdownOrHtml: markdown,
    });
    expect(assets.length).toBeGreaterThan(0);
    expect(assets.some((a) => a.assetKind === "IMAGE")).toBe(true);
    expect(assets.some((a) => a.assetKind === "ARTIFACT")).toBe(true);
  });

  it("blocks non-https homepage crawl", () => {
    expect(canCrawlHomepage("http://example.com")).toBe(false);
    expect(canCrawlHomepage("https://example.com")).toBe(true);
  });
});
