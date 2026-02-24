import { beforeEach, describe, expect, it, vi } from "vitest";
import { ingestAgentMedia } from "../media-ingestion";

const mockGetAgentBySourceId = vi.hoisted(() => vi.fn());
const mockUpsertMediaAsset = vi.hoisted(() => vi.fn());
const mockDiscoverMediaAssets = vi.hoisted(() => vi.fn());
const mockFetchHomepageContent = vi.hoisted(() => vi.fn());

vi.mock("../../agent-upsert", () => ({
  getAgentBySourceId: mockGetAgentBySourceId,
  upsertMediaAsset: mockUpsertMediaAsset,
}));

vi.mock("../media-discovery", () => ({
  discoverMediaAssets: mockDiscoverMediaAssets,
  fetchHomepageContent: mockFetchHomepageContent,
}));

describe("media-ingestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SEARCH_MEDIA_VERTICAL_ENABLED", "1");
    vi.unstubAllEnvs();
    vi.stubEnv("SEARCH_MEDIA_VERTICAL_ENABLED", "1");
    mockGetAgentBySourceId.mockResolvedValue({ id: "agent-1" });
    mockDiscoverMediaAssets.mockResolvedValue([
      {
        assetKind: "IMAGE",
        artifactType: null,
        url: "https://raw.githubusercontent.com/x/y/a.png",
        sourcePageUrl: "https://github.com/x/y",
        title: null,
        caption: null,
        altText: "preview",
        mimeType: "image/png",
        byteSize: 200,
        qualityScore: 80,
        safetyScore: 85,
        isPublic: true,
        sha256: "abc",
      },
    ]);
    mockUpsertMediaAsset.mockResolvedValue(undefined);
    mockFetchHomepageContent.mockResolvedValue(null);
  });

  it("upserts discovered assets and returns metrics", async () => {
    const metrics = await ingestAgentMedia({
      agentSourceId: "npm:test",
      agentUrl: "https://npmjs.com/package/test",
      source: "NPM",
      readmeOrHtml: "![preview](./a.png)",
      allowHomepageFetch: false,
    });
    expect(metrics.discovered).toBe(1);
    expect(metrics.upserted).toBe(1);
    expect(metrics.errors).toBe(0);
    expect(mockUpsertMediaAsset).toHaveBeenCalledTimes(1);
  });

  it("respects min quality threshold", async () => {
    vi.stubEnv("SEARCH_MEDIA_MIN_QUALITY_SCORE", "90");
    const metrics = await ingestAgentMedia({
      agentSourceId: "npm:test",
      agentUrl: "https://npmjs.com/package/test",
      source: "NPM",
      readmeOrHtml: "![preview](./a.png)",
      allowHomepageFetch: false,
    });
    expect(metrics.upserted).toBe(0);
    expect(metrics.skipped).toBe(1);
  });
});
