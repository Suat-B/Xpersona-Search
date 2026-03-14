import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {},
}));

import { normalizeDifyTemplate } from "./dify-marketplace";

describe("normalizeDifyTemplate", () => {
  it("maps Dify templates into canonical marketplace agents", () => {
    const normalized = normalizeDifyTemplate({
      id: "tpl-1",
      publisher_type: "organization",
      publisher_unique_handle: "langgenius",
      template_name: "Daily AI News Digest",
      categories: ["marketing", "knowledge"],
      deps_plugins: ["langgenius/openai"],
      preferred_languages: ["en"],
      overview: "Summarize the latest AI news.",
      readme: "Setup instructions",
      usage_count: 336,
      updated_at: "2026-03-04T00:33:57.010502Z",
    });

    expect(normalized.source).toBe("DIFY_MARKETPLACE");
    expect(normalized.sourceId).toBe("dify:tpl-1");
    expect(normalized.capabilities).toContain("workflow");
    expect(normalized.capabilities).toContain("marketing");
    expect(normalized.languages).toEqual(["en"]);
    expect(normalized.openclawData).toMatchObject({
      discoverySignals: {
        installCount: 336,
        verified: true,
        hasManifest: true,
      },
    });
    expect(normalized.popularityScore).toBeGreaterThan(0);
  });
});
