import { describe, expect, it } from "vitest";
import { verificationTierForMethod } from "./verification-tier";

describe("verificationTierForMethod", () => {
  it("maps bronze methods correctly", () => {
    expect(verificationTierForMethod("GITHUB_FILE")).toBe("BRONZE");
    expect(verificationTierForMethod("NPM_KEYWORD")).toBe("BRONZE");
    expect(verificationTierForMethod("PYPI_KEYWORD")).toBe("BRONZE");
    expect(verificationTierForMethod("EMAIL_MATCH")).toBe("BRONZE");
    expect(verificationTierForMethod("MANUAL_REVIEW")).toBe("BRONZE");
  });

  it("maps silver methods correctly", () => {
    expect(verificationTierForMethod("DNS_TXT")).toBe("SILVER");
    expect(verificationTierForMethod("META_TAG")).toBe("SILVER");
  });

  it("maps gold method correctly", () => {
    expect(verificationTierForMethod("CRYPTO_SIGNATURE")).toBe("GOLD");
  });
});
