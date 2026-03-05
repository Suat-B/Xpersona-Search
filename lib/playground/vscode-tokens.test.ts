import { describe, expect, it } from "vitest";
import { signVscodeAccessToken, verifyVscodeAccessToken } from "@/lib/playground/vscode-tokens";

describe("vscode tokens", () => {
  it("signs and verifies a VS Code access token", () => {
    process.env.PLAYGROUND_VSCODE_TOKEN_SECRET = "test-secret-32-chars-min-aaaaaaaaaaaaaaaa";
    const token = signVscodeAccessToken({ userId: "user-1", email: "u@example.com", nowMs: 1_000, ttlMs: 15 * 60 * 1000 });
    const verified = verifyVscodeAccessToken(token, { nowMs: 1_500 });
    expect(verified).toEqual({ userId: "user-1", email: "u@example.com" });
  });

  it("rejects tampered tokens", () => {
    process.env.PLAYGROUND_VSCODE_TOKEN_SECRET = "test-secret-32-chars-min-bbbbbbbbbbbbbbbbbbbb";
    const token = signVscodeAccessToken({ userId: "user-2", email: "u2@example.com", nowMs: 1_000, ttlMs: 60_000 });
    const tampered = token.replace("xp_vsat_", "xp_vsat_x");
    expect(verifyVscodeAccessToken(tampered, { nowMs: 1_500 })).toBeNull();
  });

  it("rejects expired tokens", () => {
    process.env.PLAYGROUND_VSCODE_TOKEN_SECRET = "test-secret-32-chars-min-cccccccccccccccccccc";
    const token = signVscodeAccessToken({ userId: "user-3", email: "u3@example.com", nowMs: 1_000, ttlMs: 1000 });
    expect(verifyVscodeAccessToken(token, { nowMs: 2_500, maxClockSkewMs: 0 })).toBeNull();
  });
});

