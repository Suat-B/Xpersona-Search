import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetAgentDossier = vi.hoisted(() => vi.fn());
const mockRecordApiResponse = vi.hoisted(() => vi.fn());

vi.mock("@/lib/agents/agent-dossier", () => ({
  getAgentDossier: mockGetAgentDossier,
}));

vi.mock("@/lib/metrics/record", () => ({
  recordApiResponse: mockRecordApiResponse,
}));

import { GET } from "./route";

describe("GET /api/agents/[slug]/dossier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the dossier payload with cache headers", async () => {
    mockGetAgentDossier.mockResolvedValue({
      slug: "demo-agent",
      name: "Demo Agent",
      summary: { seoDescription: "Demo dossier" },
      coverage: { protocols: [], capabilities: [] },
    });

    const req = new NextRequest("http://localhost/api/agents/demo-agent/dossier");
    const res = await GET(req, { params: Promise.resolve({ slug: "demo-agent" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.slug).toBe("demo-agent");
    expect(body.summary.seoDescription).toBe("Demo dossier");
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=300");
  });

  it("returns 404 when dossier data is missing", async () => {
    mockGetAgentDossier.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/agents/missing/dossier");
    const res = await GET(req, { params: Promise.resolve({ slug: "missing" }) });

    expect(res.status).toBe(404);
  });
});
