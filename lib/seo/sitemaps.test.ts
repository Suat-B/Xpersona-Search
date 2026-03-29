import { describe, expect, it } from "vitest";
import { SITEMAP_AGENT_CHUNK_SIZE, renderUrlSet, sliceAgentEntries, type SitemapEntry } from "./sitemaps";

describe("sitemap helpers", () => {
  it("keeps agent child sitemaps under the chunk limit", () => {
    const entries: SitemapEntry[] = Array.from({ length: 90_001 }, (_, index) => ({
      url: `https://xpersona.co/agent/demo-${index + 1}`,
    }));

    expect(sliceAgentEntries(entries, 1)).toHaveLength(SITEMAP_AGENT_CHUNK_SIZE);
    expect(sliceAgentEntries(entries, 2)).toHaveLength(SITEMAP_AGENT_CHUNK_SIZE);
    expect(sliceAgentEntries(entries, 3)).toHaveLength(1);
  });

  it("renders XML urlsets for child sitemap files", () => {
    const xml = renderUrlSet([
      {
        url: "https://xpersona.co/for-agents",
        changeFrequency: "daily",
        priority: 1,
        lastModified: "2026-03-29T00:00:00.000Z",
      },
    ]);

    expect(xml).toContain("<urlset");
    expect(xml).toContain("<loc>https://xpersona.co/for-agents</loc>");
    expect(xml).toContain("<changefreq>daily</changefreq>");
    expect(xml).toContain("<priority>1.00</priority>");
  });
});
