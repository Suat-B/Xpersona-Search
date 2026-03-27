import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";
import { mintCrawlLicenseToken } from "@/lib/crawl-license-mint";

describe("api hard cutover middleware", () => {
  afterEach(() => {
    delete process.env.ENABLE_PAY_PER_CRAWL;
    delete process.env.CRAWL_LICENSE_SECRET;
  });

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

  it("allows gated crawler API requests without a crawl token while pay-per-crawl is disabled in code", async () => {
    process.env.ENABLE_PAY_PER_CRAWL = "1";
    process.env.CRAWL_LICENSE_SECRET = "0123456789abcdef";

    const req = new NextRequest("http://localhost/api/v1/agents/demo-agent/snapshot", {
      headers: { "user-agent": "GPTBot" },
    });
    const res = await middleware(req);

    expect(res.status).toBe(200);
  });

  it("allows gated agent detail pages for crawlers without a crawl token while pay-per-crawl is disabled in code", async () => {
    process.env.ENABLE_PAY_PER_CRAWL = "1";
    process.env.CRAWL_LICENSE_SECRET = "0123456789abcdef";

    const req = new NextRequest("http://localhost/agent/demo-agent", {
      headers: { "user-agent": "GPTBot", accept: "text/html" },
    });
    const res = await middleware(req);

    expect(res.status).toBe(200);
  });

  it("keeps public agent collection pages ungated for crawler requests", async () => {
    process.env.ENABLE_PAY_PER_CRAWL = "1";
    process.env.CRAWL_LICENSE_SECRET = "0123456789abcdef";

    const req = new NextRequest("http://localhost/agent/benchmarked", {
      headers: { "user-agent": "GPTBot", accept: "text/html" },
    });
    const res = await middleware(req);

    expect(res.status).toBe(200);
  });

  it("allows gated crawler requests with a valid crawl token", async () => {
    process.env.ENABLE_PAY_PER_CRAWL = "1";
    process.env.CRAWL_LICENSE_SECRET = "0123456789abcdef";
    const token = mintCrawlLicenseToken({
      customerId: "crawl_customer_1",
      keyPrefix: "xpcrawl_12345678",
      ttlSeconds: 3600,
    });

    const req = new NextRequest("http://localhost/api/v1/agents/demo-agent/snapshot", {
      headers: {
        "user-agent": "GPTBot",
        "x-crawl-license": token ?? "",
      },
    });
    const res = await middleware(req);

    expect(res.status).toBe(200);
  });
});
