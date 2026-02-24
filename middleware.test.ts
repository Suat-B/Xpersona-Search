import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

describe("api hard cutover middleware", () => {
  it("returns 410 for deprecated unversioned api routes", async () => {
    const req = new NextRequest("http://localhost/api/search?q=test");
    const res = await middleware(req);
    expect(res.status).toBe(410);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe("API_VERSION_DEPRECATED");
    expect(json.error.details.migration).toBe("/api/v1/search?q=test");
  });

  it("allows /api/v1 routes", async () => {
    const req = new NextRequest("http://localhost/api/v1/search?q=test");
    const res = await middleware(req);
    expect(res.status).toBe(200);
  });

  it("allows internal proxy bypass header", async () => {
    const req = new NextRequest("http://localhost/api/search?q=test", {
      headers: { "x-internal-api-proxy": "1" },
    });
    const res = await middleware(req);
    expect(res.status).toBe(200);
  });
});
