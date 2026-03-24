import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockIssueCrawlTokenForApiKey = vi.hoisted(() => vi.fn());

vi.mock("@/lib/crawl-license-store", () => ({
  issueCrawlTokenForApiKey: mockIssueCrawlTokenForApiKey,
}));

import { GET, POST } from "./route";

describe("GET/POST /api/v1/crawl-license", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ENABLE_PAY_PER_CRAWL;
    delete process.env.CRAWL_LICENSE_SECRET;
  });

  it("returns discovery details with configured packages", async () => {
    process.env.ENABLE_PAY_PER_CRAWL = "1";
    process.env.CRAWL_LICENSE_SECRET = "0123456789abcdef";
    process.env.STRIPE_CRAWL_PRICE_ID_STARTER = "price_starter";

    const res = await GET(new NextRequest("http://localhost/api/v1/crawl-license"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.pay_per_crawl_enabled).toBe(true);
    expect(body.secret_configured).toBe(true);
    expect(body.packages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "starter",
          credits: 10000,
          priceIdConfigured: true,
        }),
      ])
    );
    expect(body.free_surfaces).toEqual(expect.arrayContaining([
      "/api/v1/feeds/agents/{view}",
      "/api/v1/agents/{slug}/card",
      "/api/v1/agents/{slug}/facts",
      "/agent/benchmarked",
    ]));
    expect(body.gated_surfaces).toContain("/agent/{slug} (HTML)");
  });

  it("issues a signed token for a valid crawl API key", async () => {
    mockIssueCrawlTokenForApiKey.mockResolvedValue({
      ok: true,
      token: "signed-token",
      expiresIn: 600,
      customer: {
        id: "crawl_1",
        apiKeyPrefix: "xpcrawl_12345678",
        creditBalance: 25,
        status: "active",
      },
    });

    const res = await POST(
      new NextRequest("http://localhost/api/v1/crawl-license", {
        method: "POST",
        headers: {
          authorization: "Bearer xpcrawl_secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ ttlSeconds: 600 }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.access_token).toBe("signed-token");
    expect(mockIssueCrawlTokenForApiKey).toHaveBeenCalledWith("xpcrawl_secret", 600);
  });

  it("returns 402 when the crawl license has no credits", async () => {
    mockIssueCrawlTokenForApiKey.mockResolvedValue({
      ok: false,
      reason: "EXHAUSTED",
    });

    const res = await POST(
      new NextRequest("http://localhost/api/v1/crawl-license", {
        method: "POST",
        headers: {
          authorization: "Bearer xpcrawl_secret",
        },
      })
    );
    const body = await res.json();

    expect(res.status).toBe(402);
    expect(body.error.code).toBe("CRAWL_CREDITS_EXHAUSTED");
    expect(body.error.checkoutUrl).toBe("http://localhost/api/v1/crawl-license/checkout");
  });
});
