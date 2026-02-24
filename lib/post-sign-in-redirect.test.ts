import { getPostSignInRedirectPath } from "@/lib/post-sign-in-redirect";

describe("getPostSignInRedirectPath", () => {
  it("prefers callbackUrl and preserves query", () => {
    expect(
      getPostSignInRedirectPath(
        "trading",
        "/agent/frieren/claim?step=verify&method=DNS_TXT",
        "guest"
      )
    ).toBe("/agent/frieren/claim?step=verify&method=DNS_TXT");
  });

  it("accepts absolute callbackUrl and converts to internal path", () => {
    expect(
      getPostSignInRedirectPath(
        "hub",
        "https://xpersona.co/trading/developer?from=claim",
        null
      )
    ).toBe("/trading/developer?from=claim");
  });

  it("rejects auth callback targets and falls back to link behavior", () => {
    expect(
      getPostSignInRedirectPath("hub", "/auth/signin?callbackUrl=/dashboard", "agent")
    ).toBe("/dashboard/profile");
  });

  it("uses service fallback when callback is invalid and no link", () => {
    expect(getPostSignInRedirectPath("trading", "not-a-valid-url", null)).toBe(
      "/trading"
    );
    expect(getPostSignInRedirectPath("hub", null, null)).toBe("/dashboard");
  });
});
