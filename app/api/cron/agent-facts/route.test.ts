import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockSelectNightlyAgentCandidates = vi.hoisted(() => vi.fn());
const mockMaterializeAgentEvidence = vi.hoisted(() => vi.fn());
const mockStartJob = vi.hoisted(() => vi.fn());
const mockHeartbeatJob = vi.hoisted(() => vi.fn());
const mockCompleteJob = vi.hoisted(() => vi.fn());
const mockFailJob = vi.hoisted(() => vi.fn());

vi.mock("@/lib/agents/evidence-materializer", () => ({
  selectNightlyAgentCandidates: mockSelectNightlyAgentCandidates,
  materializeAgentEvidence: mockMaterializeAgentEvidence,
}));

vi.mock("@/lib/search/crawlers/job-lifecycle", () => ({
  startJob: mockStartJob,
  heartbeatJob: mockHeartbeatJob,
  completeJob: mockCompleteJob,
  failJob: mockFailJob,
}));

import { GET } from "./route";

describe("GET /api/cron/agent-facts", () => {
  const originalCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.AGENT_FACTS_CRON_LIMIT = "3";
    process.env.AGENT_FACTS_RECENT_WINDOW_HOURS = "48";
    process.env.AGENT_FACTS_STALE_AFTER_HOURS = "168";
    mockStartJob.mockResolvedValue({ jobId: "job-1" });
  });

  it("returns 401 without valid cron auth", async () => {
    const res = await GET(new NextRequest("http://localhost/api/cron/agent-facts"));
    expect(res.status).toBe(401);
  });

  it("runs candidate refresh and returns counters", async () => {
    mockSelectNightlyAgentCandidates.mockResolvedValue([
      { agentId: "a1", slug: "alpha", reason: "recent" },
      { agentId: "a2", slug: "beta", reason: "stale" },
    ]);
    mockMaterializeAgentEvidence
      .mockResolvedValueOnce({
        agentId: "a1",
        slug: "alpha",
        factsInserted: 3,
        changeEventsInserted: 2,
        generatedAt: "2026-03-24T12:00:00.000Z",
      })
      .mockResolvedValueOnce(null);

    const req = new NextRequest("http://localhost/api/cron/agent-facts", {
      headers: { authorization: "Bearer test-cron-secret" },
    });
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.source).toBe("AGENT_FACTS_BACKFILL");
    expect(body.scanned).toBe(2);
    expect(body.updatedAgents).toBe(1);
    expect(body.factsInserted).toBe(3);
    expect(body.changeEventsInserted).toBe(2);
    expect(body.failureCount).toBe(1);
    expect(mockCompleteJob).toHaveBeenCalledTimes(1);
  });

  it("truncates failure payload in the JSON response", async () => {
    mockSelectNightlyAgentCandidates.mockResolvedValue(
      Array.from({ length: 60 }, (_, i) => ({
        agentId: `a-${i}`,
        slug: `agent-${i}`,
        reason: "stale",
      }))
    );
    mockMaterializeAgentEvidence.mockImplementation(async () => {
      throw new Error("boom");
    });

    const req = new NextRequest("http://localhost/api/cron/agent-facts", {
      headers: { authorization: "Bearer test-cron-secret" },
    });
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.failureCount).toBe(60);
    expect(body.failures).toHaveLength(50);
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalCronSecret;
  });
});

