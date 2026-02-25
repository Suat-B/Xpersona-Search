import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const mockResolveAgentId = vi.hoisted(() => vi.fn());
const mockBuildSuggestions = vi.hoisted(() => vi.fn());

vi.mock("@/lib/reliability/lookup", () => ({
  resolveAgentId: mockResolveAgentId,
}));

vi.mock("@/lib/reliability/suggestions", () => ({
  buildSuggestions: mockBuildSuggestions,
}));

describe("GET /api/reliability/suggest/:agentId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when agent is not found", async () => {
    mockResolveAgentId.mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/reliability/suggest/unknown");
    const res = await GET(req, { params: Promise.resolve({ agentId: "unknown" }) });
    expect(res.status).toBe(404);
  });

  it("returns 200 with fallback when suggestions builder throws", async () => {
    mockResolveAgentId.mockResolvedValue("agent-1");
    mockBuildSuggestions.mockRejectedValue(new Error("db down"));

    const req = new NextRequest("http://localhost/api/reliability/suggest/agent-1");
    const res = await GET(req, { params: Promise.resolve({ agentId: "agent-1" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.agentId).toBe("agent-1");
    expect(Array.isArray(data.recommended_actions)).toBe(true);
    expect(data.recommended_actions.length).toBeGreaterThan(0);
    expect(data.expected_success_rate_gain).toBe(0);
    expect(data.expected_cost_reduction).toBe(0);
  });
});

