import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockLimit = vi.hoisted(() => vi.fn());
const mockWhere = vi.hoisted(() => vi.fn(() => ({ limit: mockLimit })));
const mockFrom = vi.hoisted(() => vi.fn(() => ({ where: mockWhere })));
const mockSelect = vi.hoisted(() => vi.fn(() => ({ from: mockFrom })));

vi.mock("@/lib/db", () => ({
  db: {
    select: mockSelect,
  },
}));

vi.mock("@/lib/trust/db", () => ({
  hasTrustTable: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/metrics/record", () => ({
  recordApiResponse: vi.fn(),
}));

import { GET } from "./route";

describe("GET /api/v1/agents/[slug]/contract", () => {
  it("returns 200 for a public active agent without auth", async () => {
    mockLimit
      .mockResolvedValueOnce([{ id: "agent-1", slug: "demo-agent" }])
      .mockResolvedValueOnce([
        {
          authModes: ["api_key"],
          requires: ["json"],
          forbidden: [],
          dataRegion: "us",
          inputSchemaRef: "https://example.com/input.json",
          outputSchemaRef: "https://example.com/output.json",
          supportsStreaming: true,
          supportsMcp: true,
          supportsA2a: false,
          updatedAt: new Date("2026-03-29T00:00:00.000Z"),
          createdAt: new Date("2026-03-28T00:00:00.000Z"),
        },
      ]);

    const res = await GET(new NextRequest("http://localhost/api/v1/agents/demo-agent/contract"), {
      params: Promise.resolve({ slug: "demo-agent" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.slug).toBe("demo-agent");
    expect(body.contract.authModes).toEqual(["api_key"]);
  });
});
