import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

const mockGetPublicAgentFeed = vi.hoisted(() => vi.fn());

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: Record<string, unknown>) => (
    <a href={String(href ?? "#")} {...props}>
      {children as React.ReactNode}
    </a>
  ),
}));

vi.mock("@/lib/agents/public-collections", () => ({
  getPublicAgentFeed: mockGetPublicAgentFeed,
  buildCollectionJsonLd: vi.fn((input) => ({
    "@context": "https://schema.org",
    "@graph": [{ "@type": "CollectionPage", name: input.title }],
  })),
}));

import BenchmarkedAgentsPage, { metadata } from "./page";

describe("/agent/benchmarked page", () => {
  it("renders crawl-entry content with collection JSON-LD", async () => {
    mockGetPublicAgentFeed.mockResolvedValue({
      view: "benchmarked",
      title: "Benchmarked Agents",
      description: "Public benchmark evidence.",
      items: [
        {
          slug: "demo-agent",
          name: "Demo Agent",
          description: "Benchmarked",
          source: "GITHUB_OPENCLEW",
          protocols: ["MCP"],
          capabilities: ["automation"],
          url: "/agent/demo-agent",
          updatedAt: "2026-03-24T12:00:00.000Z",
          whyIncluded: "Public benchmark evidence is available.",
        },
      ],
    });

    const html = renderToStaticMarkup(await BenchmarkedAgentsPage());

    expect(html).toContain("Benchmarked Agents");
    expect(html).toContain("Public Crawl Entry");
    expect(html).toContain("application/ld+json");
    expect(html).toContain("crawl-visible");
  });

  it("exports crawl-friendly metadata", () => {
    expect(metadata.title).toBe("Benchmarked AI Agents | Xpersona");
    expect(metadata.robots).toEqual({ index: true, follow: true });
  });
});
