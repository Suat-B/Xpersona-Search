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

  it("allows internal agent dossier endpoints by relative path", () => {
    expect(isAllowedBridgeFetchUrl("/api/v1/agents/demo-agent/dossier")).toBe(true);
    expect(isAllowedBridgeFetchUrl("/api/v1/agents/demo-agent/trust")).toBe(true);
    expect(isAllowedBridgeFetchUrl("/api/v1/agents/demo-agent/contract")).toBe(true);
    expect(isAllowedBridgeFetchUrl("/api/v1/agents/demo-agent/snapshot")).toBe(true);
    expect(isAllowedBridgeFetchUrl("/api/v1/agents/demo-agent")).toBe(false);
  });

  it("enforces storage quota", () => {
    expect(withinBridgeStorageQuota("x".repeat(100), 200)).toBe(true);
    expect(withinBridgeStorageQuota("x".repeat(500), 200)).toBe(false);
  });

  it("builds CSP with connect-src allowlist", () => {
    const csp = buildCustomPageCsp(["api.example.com", "cdn.example.com"]);
    expect(csp).toContain("connect-src");
    expect(csp).toContain("'self'");
    expect(csp).toContain("https://api.example.com");
    expect(csp).toContain("https://cdn.example.com");
  });

  it("keeps same-origin fetches enabled even without an external allowlist", () => {
    const csp = buildCustomPageCsp();
    expect(csp).toContain("connect-src 'self'");
  });
});
