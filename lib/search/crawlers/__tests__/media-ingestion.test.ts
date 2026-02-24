import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetAgentBySourceId = vi.hoisted(() => vi.fn());
const mockUpsertMediaAssetsBulk = vi.hoisted(() => vi.fn());
const mockComputeMediaRankScore = vi.hoisted(() => vi.fn());
const mockDiscoverMediaAssets = vi.hoisted(() => vi.fn());
const mockFetchHomepageContent = vi.hoisted(() => vi.fn());
const mockEnqueueMediaWebUrls = vi.hoisted(() => vi.fn());

vi.mock("../../agent-upsert", () => ({
  getAgentBySourceId: mockGetAgentBySourceId,
  upsertMediaAssetsBulk: mockUpsertMediaAssetsBulk,
  computeMediaRankScore: mockComputeMediaRankScore,
}));

vi.mock("../media-discovery", () => ({
  discoverMediaAssets: mockDiscoverMediaAssets,
  fetchHomepageContent: mockFetchHomepageContent,
}));
vi.mock("../media-web-frontier", () => ({
  enqueueMediaWebUrls: mockEnqueueMediaWebUrls,
}));
import { ingestAgentMedia } from "../media-ingestion";

describe("media-ingestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("SEARCH_MEDIA_VERTICAL_ENABLED", "1");
    mockGetAgentBySourceId.mockResolvedValue({ id: "agent-1" });
    mockComputeMediaRankScore.mockReturnValue(90);
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
    mockUpsertMediaAssetsBulk.mockResolvedValue(undefined);
    mockFetchHomepageContent.mockResolvedValue(null);
    mockEnqueueMediaWebUrls.mockResolvedValue(0);
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
    expect(mockUpsertMediaAssetsBulk).toHaveBeenCalledTimes(1);
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
