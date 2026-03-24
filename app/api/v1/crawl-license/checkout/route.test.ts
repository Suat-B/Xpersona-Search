import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockFindCrawlCustomerByEmail = vi.hoisted(() => vi.fn());
const mockCreateCheckoutSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/crawl-license-store", () => ({
  findCrawlCustomerByEmail: mockFindCrawlCustomerByEmail,
}));

vi.mock("@/lib/stripe", () => ({
  requireStripe: () => ({
    checkout: {
      sessions: {
        create: mockCreateCheckoutSession,
      },
    },
  }),
}));

import { POST } from "./route";

describe("POST /api/v1/crawl-license/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_CRAWL_PRICE_ID_STARTER = "price_starter";
    delete process.env.STRIPE_CRAWL_PRICE_ID_GROWTH;
    delete process.env.STRIPE_CRAWL_PRICE_ID_SCALE;
  });

  it("starts a Stripe checkout session for a valid package", async () => {
    mockFindCrawlCustomerByEmail.mockResolvedValue(null);
    mockCreateCheckoutSession.mockResolvedValue({
      id: "cs_test_123",
      url: "https://checkout.stripe.com/pay/cs_test_123",
    });

    const res = await POST(
      new NextRequest("http://localhost/api/v1/crawl-license/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "crawler@example.com",
          packageId: "starter",
        }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.url).toBe("https://checkout.stripe.com/pay/cs_test_123");
    expect(mockCreateCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "payment",
        customer_email: "crawler@example.com",
        customer_creation: "always",
        metadata: expect.objectContaining({
          xpersona_product: "crawl_license",
          xpersona_package_id: "starter",
        }),
      })
    );
  });

  it("returns 400 for an invalid request body", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/v1/crawl-license/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "not-an-email",
        }),
      })
    );

    expect(res.status).toBe(400);
  });

  it("returns 500 when the Stripe price is missing", async () => {
    delete process.env.STRIPE_CRAWL_PRICE_ID_SCALE;

    const res = await POST(
      new NextRequest("http://localhost/api/v1/crawl-license/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "crawler@example.com",
          packageId: "scale",
        }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error.code).toBe("CRAWL_PRICE_NOT_CONFIGURED");
  });
});
