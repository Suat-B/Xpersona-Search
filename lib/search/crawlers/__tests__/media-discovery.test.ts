import { describe, it, expect, vi } from "vitest";
import { canCrawlHomepage, discoverMediaAssets } from "../media-discovery";

describe("media discovery", () => {
  it("extracts markdown image and artifact links", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          headers: new Headers({
            "content-type": "image/png",
            "content-length": "1234",
          }),
        })
        .mockResolvedValueOnce({
          headers: new Headers({
            "content-type": "application/yaml",
            "content-length": "456",
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

  it("skips non-image mime for image extension", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        headers: new Headers({
          "content-type": "text/html",
          "content-length": "100",
        }),
      })
    );
    const assets = await discoverMediaAssets({
      sourcePageUrl: "https://github.com/org/repo",
      markdownOrHtml: "![img](./docs/screenshot.png)",
    });
    expect(assets.length).toBe(0);
  });

  it("demotes noisy badge assets quality", async () => {
    vi.stubEnv("SEARCH_MEDIA_ALLOWED_HOSTS", "raw.githubusercontent.com");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        headers: new Headers({
          "content-type": "image/svg+xml",
          "content-length": "321",
        }),
      })
    );
    const assets = await discoverMediaAssets({
      sourcePageUrl: "https://github.com/org/repo",
      markdownOrHtml: "![build badge](https://raw.githubusercontent.com/org/repo/main/docs/build-badge.svg)",
    });
    expect(assets.length).toBe(1);
    expect(assets[0].qualityScore).toBeLessThan(70);
  });
});
