import { describe, expect, it, vi, beforeEach } from "vitest";
import { runPartitionedRepoSearch } from "../github-search-runner";

const mockSearchRepos = vi.hoisted(() => vi.fn());

vi.mock("../../utils/github", () => ({
  searchRepos: mockSearchRepos,
  isRetryableGitHubError: vi.fn().mockReturnValue(false),
}));

describe("runPartitionedRepoSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("splits saturated ranges and continues with child slices", async () => {
    mockSearchRepos
      .mockResolvedValueOnce({ data: { total_count: 1200, items: [] } })
      .mockResolvedValueOnce({
        data: {
          total_count: 5,
          items: [{ id: 1, full_name: "owner/repo-1" }],
        },
      })
      .mockResolvedValueOnce({
        data: {
          total_count: 5,
          items: [{ id: 2, full_name: "owner/repo-2" }],
        },
      });

    const checkpoints: Array<{ emitted: number; queueLength: number }> = [];

    const result = await runPartitionedRepoSearch({
      queries: ["topic:test-agent"],
      maxResults: 20,
      saturationThreshold: 900,
      onItems: async (items) => items.length,
      onCheckpoint: async (cursor) => {
        checkpoints.push({ emitted: cursor.emitted, queueLength: cursor.queue.length });
      },
    });

    expect(mockSearchRepos).toHaveBeenCalledTimes(3);
    expect(result.emitted).toBe(2);
    expect(checkpoints.length).toBeGreaterThan(0);
  });

  it("resumes from checkpoint queue/page cursor", async () => {
    mockSearchRepos.mockResolvedValueOnce({
      data: {
        total_count: 3,
        items: [{ id: 10, full_name: "owner/resume-repo" }],
      },
    });

    const initialCursor = {
      emitted: 3,
      queue: [{ queryIndex: 0, from: "2025-01-01", to: "2025-02-01", page: 2 }],
    };

    const result = await runPartitionedRepoSearch({
      queries: ["topic:resume"],
      maxResults: 10,
      initialCursor,
      onItems: async (items) => items.length,
    });

    expect(mockSearchRepos).toHaveBeenCalledTimes(1);
    const firstCall = mockSearchRepos.mock.calls[0]?.[0] as { page?: number; q?: string };
    expect(firstCall.page).toBe(2);
    expect(String(firstCall.q ?? "")).toContain("pushed:2025-01-01..2025-02-01");
    expect(result.emitted).toBe(4);
  });
});
