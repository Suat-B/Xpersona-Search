import { describe, it, expect } from "vitest";
import { GET as getLlms } from "./route";

describe("GET /llms.txt", () => {
  it("returns text content with key onboarding links and CTA", async () => {
    const res = await getLlms();
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    expect(body).toContain("/for-agents");
    expect(body).toContain("/api/v1/search/ai");
    expect(body).toContain("1) /search/ai -> 2) /snapshot -> 3) /contract + /trust -> then decide");
  });
});
