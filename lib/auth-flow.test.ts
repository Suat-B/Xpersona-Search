import {
  buildPermanentAccountRequiredPayload,
  buildUpgradeAuthUrl,
  isTemporaryAccountType,
  linkTypeForAccount,
  normalizeCallbackUrl,
  resolveUpgradeCallbackPath,
} from "@/lib/auth-flow";

describe("auth-flow helpers", () => {
  it("detects temporary account types", () => {
    expect(isTemporaryAccountType("agent")).toBe(true);
    expect(isTemporaryAccountType("human")).toBe(true);
    expect(isTemporaryAccountType("email")).toBe(false);
    expect(isTemporaryAccountType(null)).toBe(false);
  });

  it("maps account type to link type", () => {
    expect(linkTypeForAccount("agent")).toBe("agent");
    expect(linkTypeForAccount("human")).toBe("guest");
    expect(linkTypeForAccount("email")).toBeNull();
  });

  it("builds signup and signin upgrade URLs with callback", () => {
    expect(buildUpgradeAuthUrl("signup", "agent", "/agent/foo/claim?step=2")).toBe(
      "/auth/signup?link=agent&callbackUrl=%2Fagent%2Ffoo%2Fclaim%3Fstep%3D2"
    );
    expect(buildUpgradeAuthUrl("signin", "human", "/dashboard/settings")).toBe(
      "/auth/signin?link=guest&callbackUrl=%2Fdashboard%2Fsettings"
    );
  });

  it("normalizes absolute callback URLs into internal paths", () => {
    expect(normalizeCallbackUrl("https://xpersona.co/agent/foo/manage?tab=1")).toBe(
      "/agent/foo/manage?tab=1"
    );
    expect(normalizeCallbackUrl("not-a-url")).toBeNull();
  });

  it("prefers non-api referer for upgrade callback resolution", () => {
    expect(
      resolveUpgradeCallbackPath("/agent/foo/claim", "https://xpersona.co/agent/foo/claim?m=1")
    ).toBe("/agent/foo/claim?m=1");
    expect(
      resolveUpgradeCallbackPath("/agent/foo/claim", "https://xpersona.co/api/agents/foo/claim")
    ).toBe("/agent/foo/claim");
  });

  it("builds permanent-account-required payload contract", () => {
    expect(
      buildPermanentAccountRequiredPayload("agent", "/agent/foo/claim")
    ).toEqual({
      success: false,
      error: "PERMANENT_ACCOUNT_REQUIRED",
      message: "Create or sign in with a permanent account to continue this action.",
      accountType: "agent",
      upgradeUrl: "/auth/signup?link=agent&callbackUrl=%2Fagent%2Ffoo%2Fclaim",
    });
  });
});
