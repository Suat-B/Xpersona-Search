import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

describe("v1 proxy route", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("wraps successful legacy payloads in ApiSuccess envelope", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { "cache-control": "public, max-age=30" },
      })
    );

    const req = new NextRequest("http://localhost/api/v1/search");
    const res = await GET(req, { params: Promise.resolve({ path: ["search"] }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toEqual({ results: [] });
    expect(json.meta.version).toBe("v1");
    expect(res.headers.get("X-Request-Id")).toBeTruthy();
    expect(res.headers.get("Cache-Control")).toContain("max-age=30");
  });

  it("wraps upstream failures in ApiError envelope", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "VALIDATION_ERROR" }), {
        status: 400,
      })
    );

    const req = new NextRequest("http://localhost/api/v1/search");
    const res = await GET(req, { params: Promise.resolve({ path: ["search"] }) });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });
});
