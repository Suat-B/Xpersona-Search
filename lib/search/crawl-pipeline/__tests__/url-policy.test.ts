import { describe, expect, it } from "vitest";
import {
  getDomainFromUrl,
  isPrivateOrLocalHost,
  normalizePublicHttpsUrl,
} from "../url-policy";

describe("crawl-pipeline/url-policy", () => {
  it("rejects insecure and private/local urls", () => {
    expect(normalizePublicHttpsUrl("http://example.com")).toBeNull();
    expect(normalizePublicHttpsUrl("https://localhost:3000/test")).toBeNull();
    expect(normalizePublicHttpsUrl("https://127.0.0.1/test")).toBeNull();
  });

  it("normalizes https urls and removes trackers", () => {
    const out = normalizePublicHttpsUrl(
      "https://Example.com/a//b/?utm_campaign=1&fbclid=2#frag"
    );
    expect(out).toBe("https://example.com/a/b");
  });

  it("normalizes relative urls against base", () => {
    const out = normalizePublicHttpsUrl("/docs/intro/?gclid=1", "https://example.com/root");
    expect(out).toBe("https://example.com/docs/intro");
  });

  it("extracts hostnames and detects private hosts", () => {
    expect(getDomainFromUrl("https://foo.bar/path")).toBe("foo.bar");
    expect(isPrivateOrLocalHost("192.168.1.2")).toBe(true);
    expect(isPrivateOrLocalHost("example.com")).toBe(false);
  });
});

