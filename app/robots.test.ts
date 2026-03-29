import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/seo/sitemaps", () => ({
  getSitemapDescriptors: vi.fn().mockResolvedValue([
    { path: "/sitemaps/core.xml", lastModified: new Date("2026-03-29T00:00:00.000Z") },
    { path: "/sitemaps/agents-1.xml", lastModified: new Date("2026-03-29T00:00:00.000Z") },
  ]),
}));

import robots from "./robots";

describe("robots()", () => {
  it("keeps AI-facing surfaces crawlable and lists sitemap files", async () => {
    const result = await robots();
    const firstRule = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    const allow = Array.isArray(firstRule?.allow)
      ? firstRule.allow
      : firstRule?.allow
        ? [firstRule.allow]
        : [];
    const sitemap = Array.isArray(result.sitemap) ? result.sitemap : [result.sitemap];

    expect(allow).toContain("/for-agents");
    expect(allow).toContain("/llms.txt");
    expect(allow).toContain("/api/v1/openapi/ai-public");
    expect(allow).toContain("/api/v1/agents/*/snapshot");
    expect(allow).toContain("/api/v1/agents/*/contract");
    expect(allow).toContain("/api/v1/agents/*/trust");
    expect(sitemap).toContain("https://xpersona.co/sitemap.xml");
    expect(sitemap).toContain("https://xpersona.co/sitemaps/core.xml");
    expect(sitemap).toContain("https://xpersona.co/sitemaps/agents-1.xml");
  });
});
