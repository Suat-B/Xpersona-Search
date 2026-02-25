import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

describe("GET /api/search/policy", () => {
  it("returns machine policy payload", async () => {
    const req = new NextRequest("http://localhost/api/search/policy");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.schemaVersion).toBe("xpersona-search-policy-v1");
    expect(data.cta).toContain("/search/ai");
    expect(Array.isArray(data.must_check)).toBe(true);
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=300");
  });
});
