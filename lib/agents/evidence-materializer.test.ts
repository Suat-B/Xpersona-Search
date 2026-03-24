import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentChangeEvents, agentFacts } from "@/lib/db/schema";

const mockGetDerivedPublicAgentEvidencePack = vi.hoisted(() => vi.fn());
const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/agents/public-facts", () => ({
  getDerivedPublicAgentEvidencePack: mockGetDerivedPublicAgentEvidencePack,
}));

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

import {
  materializeAgentEvidence,
  selectNightlyAgentCandidates,
} from "@/lib/agents/evidence-materializer";

function createSelectChain<T>(rows: T[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

describe("materializeAgentEvidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("replaces per-agent facts/events and inserts deterministic positioned facts", async () => {
    mockDb.select.mockReturnValueOnce(
      createSelectChain([{ id: "agent-1", slug: "demo-agent" }])
    );
    mockGetDerivedPublicAgentEvidencePack.mockResolvedValue({
      card: {
        canonicalUrl: "https://xpersona.co/agent/demo-agent",
      },
      facts: [
        {
          factKey: "",
          label: "",
          value: "",
          category: "",
          href: null,
          sourceUrl: "",
          sourceType: "",
          confidence: "",
          observedAt: "2026-03-24T12:00:00.000Z",
          isPublic: true,
        },
        {
          factKey: "",
          label: "",
          value: "",
          category: "",
          href: null,
          sourceUrl: "https://example.com/other",
          sourceType: "profile",
          confidence: "low",
          observedAt: "2026-03-23T12:00:00.000Z",
          isPublic: true,
        },
      ],
      changeEvents: [
        {
          eventType: "release",
          title: "Release 1.0.0",
          description: null,
          href: null,
          sourceUrl: "",
          sourceType: "release",
          confidence: "medium",
          observedAt: "2026-03-24T12:00:00.000Z",
          isPublic: true,
        },
      ],
    });

    const deleteWhereFacts = vi.fn().mockResolvedValue(undefined);
    const deleteWhereEvents = vi.fn().mockResolvedValue(undefined);
    const insertFacts = vi.fn().mockResolvedValue(undefined);
    const insertEvents = vi.fn().mockResolvedValue(undefined);

    const tx = {
      delete: vi.fn((table: unknown) => ({
        where: table === agentFacts ? deleteWhereFacts : deleteWhereEvents,
      })),
      insert: vi.fn((table: unknown) => ({
        values: table === agentFacts ? insertFacts : insertEvents,
      })),
    };
    mockDb.transaction.mockImplementation(async (cb: (txArg: unknown) => Promise<void>) => cb(tx));

    const result = await materializeAgentEvidence({
      slug: "demo-agent",
    });

    expect(result?.agentId).toBe("agent-1");
    expect(result?.factsInserted).toBe(1);
    expect(result?.changeEventsInserted).toBe(1);
    expect(deleteWhereFacts).toHaveBeenCalledTimes(1);
    expect(deleteWhereEvents).toHaveBeenCalledTimes(1);
    expect(insertFacts).toHaveBeenCalledTimes(1);
    expect(insertEvents).toHaveBeenCalledTimes(1);

    const insertedFacts = insertFacts.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(insertedFacts[0]?.position).toBe(0);
    expect(insertedFacts[0]?.label).toBe("Fact");
    expect(insertedFacts[0]?.value).toBe("Unknown");
    expect(insertedFacts[0]?.sourceUrl).toBe("https://xpersona.co/agent/demo-agent");
  });
});

describe("selectNightlyAgentCandidates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a de-duplicated recent+stale hybrid list honoring the cap", async () => {
    mockDb.select.mockReturnValueOnce(
      createSelectChain([
        {
          agentId: "recent-1",
          slug: "recent-agent",
          updatedAt: new Date("2026-03-24T12:00:00.000Z"),
        },
      ])
    );

    mockDb.execute.mockResolvedValueOnce({
      rows: [
        {
          agent_id: "recent-1",
          slug: "recent-agent",
          updated_at: new Date("2026-03-24T12:00:00.000Z"),
          last_materialized_at: new Date("2026-03-10T12:00:00.000Z"),
        },
        {
          agent_id: "stale-1",
          slug: "stale-agent",
          updated_at: new Date("2026-03-12T12:00:00.000Z"),
          last_materialized_at: null,
        },
      ],
    });

    const rows = await selectNightlyAgentCandidates({
      limit: 2,
      now: new Date("2026-03-24T13:00:00.000Z"),
      recentWindowHours: 48,
      staleAfterHours: 168,
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]?.agentId).toBe("recent-1");
    expect(rows[0]?.reason).toBe("recent");
    expect(rows[1]?.agentId).toBe("stale-1");
    expect(rows[1]?.reason).toBe("stale");
  });
});

