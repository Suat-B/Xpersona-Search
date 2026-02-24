import { describe, expect, it } from "vitest";
import {
  buildCustomPageCsp,
  isAllowedBridgeFetchUrl,
  withinBridgeStorageQuota,
} from "./bridge";

describe("bridge utilities", () => {
  it("allows only https URLs in allowlist", () => {
    const allow = ["api.example.com"];
    expect(isAllowedBridgeFetchUrl("https://api.example.com/x", allow)).toBe(true);
    expect(isAllowedBridgeFetchUrl("https://sub.api.example.com/x", allow)).toBe(true);
    expect(isAllowedBridgeFetchUrl("http://api.example.com/x", allow)).toBe(false);
    expect(isAllowedBridgeFetchUrl("https://evil.com/x", allow)).toBe(false);
  });

  it("enforces storage quota", () => {
    expect(withinBridgeStorageQuota("x".repeat(100), 200)).toBe(true);
    expect(withinBridgeStorageQuota("x".repeat(500), 200)).toBe(false);
  });

  it("builds CSP with connect-src allowlist", () => {
    const csp = buildCustomPageCsp(["api.example.com", "cdn.example.com"]);
    expect(csp).toContain("connect-src");
    expect(csp).toContain("https://api.example.com");
    expect(csp).toContain("https://cdn.example.com");
  });
});
