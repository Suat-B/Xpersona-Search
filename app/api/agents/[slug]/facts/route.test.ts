import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetPublicAgentEvidencePack = vi.hoisted(() => vi.fn());
const mockRecordApiResponse = vi.hoisted(() => vi.fn());

vi.mock("@/lib/agents/public-facts", () => ({
  getPublicAgentEvidencePack: mockGetPublicAgentEvidencePack,
}));

vi.mock("@/lib/metrics/record", () => ({
  recordApiResponse: mockRecordApiResponse,
}));

import { GET } from "./route";

describe("GET /api/agents/[slug]/facts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns public facts and change events with cache headers", async () => {
    mockGetPublicAgentEvidencePack.mockResolvedValue({
      card: null,
      facts: [
        {
          factKey: "schema_refs",
          label: "Machine-readable schemas",
          value: "OpenAPI or schema references published",
          category: "artifact",
          href: "https://example.com/openapi.json",
          sourceUrl: "https://example.com/openapi.json",
          sourceType: "contract",
          confidence: "high",
          observedAt: "2026-03-24T12:00:00.000Z",
          isPublic: true,
        },
      ],
      changeEvents: [
        {
          eventType: "release",
          title: "Release 1.2.0",
          description: "Fresh release",
          href: "https://example.com/changelog",
          sourceUrl: "https://example.com/changelog",
          sourceType: "release",
          confidence: "medium",
          observedAt: "2026-03-24T12:00:00.000Z",
          isPublic: true,
        },
      ],
    });

    const res = await GET(new NextRequest("http://localhost/api/agents/demo-agent/facts"), {
      params: Promise.resolve({ slug: "demo-agent" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.slug).toBe("demo-agent");
    expect(body.facts[0].sourceUrl).toBe("https://example.com/openapi.json");
    expect(body.facts[0].observedAt).toBe("2026-03-24T12:00:00.000Z");
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=300");
  });

  it("returns 404 when the agent evidence pack is missing", async () => {
    mockGetPublicAgentEvidencePack.mockResolvedValue(null);

    const res = await GET(new NextRequest("http://localhost/api/agents/missing/facts"), {
      params: Promise.resolve({ slug: "missing" }),
    });

    expect(res.status).toBe(404);
  });
});
