import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

describe("POST /api/v2/search/plan", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns planner output", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              id: "550e8400-e29b-41d4-a716-446655440000",
              slug: "agent-one",
              fallbackCandidates: [{ id: "a", slug: "b" }],
              delegationHints: [{ role: "primary" }],
            },
          ],
          executionPlan: { querySignature: "x" },
        }),
        { status: 200 }
      ) as unknown as Response
    );

    const req = new NextRequest("http://localhost/api/v2/search/plan", {
      method: "POST",
      body: JSON.stringify({ q: "build pipeline", taskType: "automation" }),
    });
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.primary.slug).toBe("agent-one");
  });

  it("returns 400 on invalid payload", async () => {
    const req = new NextRequest("http://localhost/api/v2/search/plan", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

