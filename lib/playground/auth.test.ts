import { describe, expect, it, vi } from "vitest";
import { signVscodeAccessToken } from "@/lib/playground/vscode-tokens";

vi.mock("@/lib/auth-utils", () => {
  return {
    hashApiKey: (raw: string) => `hash:${raw}`,
  };
});

vi.mock("@/lib/admin", () => {
  return {
    isAdminEmail: () => false,
  };
});

vi.mock("@/lib/db", () => {
  return {
    db: {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      }),
    },
  };
});

describe("playground auth", () => {
  it("authenticates VS Code access tokens via Authorization header", async () => {
    process.env.PLAYGROUND_VSCODE_TOKEN_SECRET = "test-secret-32-chars-min-dddddddddddddddddddd";
    const token = signVscodeAccessToken({ userId: "user-1", email: "u@example.com", ttlMs: 60_000 });
    const { authenticatePlaygroundRequest } = await import("@/lib/playground/auth");
    const req = { headers: new Headers({ Authorization: `Bearer ${token}` }) } as any;
    const auth = await authenticatePlaygroundRequest(req);
    expect(auth).toEqual({ userId: "user-1", email: "u@example.com", apiKeyPrefix: null });
  });

  it("rejects invalid VS Code access tokens", async () => {
    process.env.PLAYGROUND_VSCODE_TOKEN_SECRET = "test-secret-32-chars-min-eeeeeeeeeeeeeeeeeeee";
    const { authenticatePlaygroundRequest } = await import("@/lib/playground/auth");
    const req = { headers: new Headers({ Authorization: "Bearer xp_vsat_not-a-token" }) } as any;
    const auth = await authenticatePlaygroundRequest(req);
    expect(auth).toBeNull();
  });
});
