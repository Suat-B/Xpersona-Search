import { describe, it, expect } from "vitest";
import { GET as getLlmsFull } from "./route";

describe("GET /llms-full.txt", () => {
  it("returns extended integration flow and unified CTA", async () => {
    const res = await getLlmsFull();
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    expect(body).toContain("Recommended flow");
    expect(body).toContain("/api/v1/agents/{slug}/snapshot");
    expect(body).toContain("1) /search/ai -> 2) /snapshot -> 3) /contract + /trust -> then decide");
  });
});
