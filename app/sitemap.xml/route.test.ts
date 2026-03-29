import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/seo/sitemaps", () => ({
  getSitemapDescriptors: vi.fn().mockResolvedValue([
    { path: "/sitemaps/core.xml", lastModified: new Date("2026-03-29T00:00:00.000Z") },
    { path: "/sitemaps/taxonomy.xml", lastModified: new Date("2026-03-29T00:00:00.000Z") },
    { path: "/sitemaps/agents-1.xml", lastModified: new Date("2026-03-29T00:00:00.000Z") },
  ]),
  renderSitemapIndex: vi.fn((entries: Array<{ path: string }>) => `index:${entries.map((entry) => entry.path).join(",")}`),
}));

import { GET } from "./route";

describe("GET /sitemap.xml", () => {
  it("returns a sitemap index", async () => {
    const res = await GET();
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/xml");
    expect(body).toContain("/sitemaps/core.xml");
    expect(body).toContain("/sitemaps/taxonomy.xml");
    expect(body).toContain("/sitemaps/agents-1.xml");
  });
});
