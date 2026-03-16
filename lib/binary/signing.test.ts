import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertBinaryDownloadSigningReady,
  createBinaryDownloadSignature,
  hasConfiguredBinaryDownloadSecret,
  verifyBinaryDownloadSignature,
} from "@/lib/binary/signing";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_BINARY_SECRET = process.env.XPERSONA_BINARY_DOWNLOAD_SECRET;
const ORIGINAL_NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET;
const ORIGINAL_AUTH_SECRET = process.env.AUTH_SECRET;

function setNodeEnv(value: string | undefined): void {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, "NODE_ENV");
    return;
  }
  Reflect.set(process.env, "NODE_ENV", value);
}

afterEach(() => {
  setNodeEnv(ORIGINAL_NODE_ENV);
  process.env.XPERSONA_BINARY_DOWNLOAD_SECRET = ORIGINAL_BINARY_SECRET;
  process.env.NEXTAUTH_SECRET = ORIGINAL_NEXTAUTH_SECRET;
  process.env.AUTH_SECRET = ORIGINAL_AUTH_SECRET;
});

describe("binary signing", () => {
  it("creates and verifies signatures when a secret is configured", () => {
    process.env.XPERSONA_BINARY_DOWNLOAD_SECRET = "test-secret";

    const sig = createBinaryDownloadSignature("bin_123", "2030-01-01T00:00:00.000Z");
    expect(hasConfiguredBinaryDownloadSecret()).toBe(true);
    expect(verifyBinaryDownloadSignature("bin_123", "2030-01-01T00:00:00.000Z", sig)).toBe(true);
    expect(verifyBinaryDownloadSignature("bin_123", "2030-01-02T00:00:00.000Z", sig)).toBe(false);
  });

  it("rejects production publish flows when only the fallback secret is available", () => {
    delete process.env.XPERSONA_BINARY_DOWNLOAD_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.AUTH_SECRET;
    setNodeEnv("production");

    expect(hasConfiguredBinaryDownloadSecret()).toBe(false);
    expect(() => assertBinaryDownloadSigningReady()).toThrow(/Binary download signing is not configured/i);
  });
});
