import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRevealCrawlCheckoutApiKey = vi.hoisted(() => vi.fn());

vi.mock("@/lib/crawl-license-store", () => ({
  revealCrawlCheckoutApiKey: mockRevealCrawlCheckoutApiKey,
}));

import { POST } from "./route";

describe("POST /api/v1/crawl-license/reveal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reveals the API key once for a first-time checkout", async () => {
    mockRevealCrawlCheckoutApiKey.mockResolvedValue({
      ok: true,
      kind: "revealed",
      apiKey: "xpcrawl_secret",
      keyPrefix: "xpcrawl_12345678",
      credits: 10000,
      packageId: "starter",
    });

    const res = await POST(
      new NextRequest("http://localhost/api/v1/crawl-license/reveal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: "cs_test_123" }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.state).toBe("revealed");
    expect(body.data.apiKey).toBe("xpcrawl_secret");
  });

  it("returns 202 while provisioning is still finishing", async () => {
    mockRevealCrawlCheckoutApiKey.mockResolvedValue({
      ok: false,
      reason: "PROCESSING",
    });

    const res = await POST(
      new NextRequest("http://localhost/api/v1/crawl-license/reveal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: "cs_test_123" }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(202);
    expect(res.headers.get("Retry-After")).toBe("2");
    expect(body.error.code).toBe("CHECKOUT_PROCESSING");
  });

  it("returns 409 after the key has already been shown once", async () => {
    mockRevealCrawlCheckoutApiKey.mockResolvedValue({
      ok: false,
      reason: "ALREADY_REVEALED",
    });

    const res = await POST(
      new NextRequest("http://localhost/api/v1/crawl-license/reveal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: "cs_test_123" }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe("API_KEY_ALREADY_REVEALED");
  });
});
