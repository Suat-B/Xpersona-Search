import os from "node:os";
import path from "node:path";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { BrowserSessionManager } from "./browser-session-manager.js";

const cleanupPaths: string[] = [];

afterEach(async () => {
  delete process.env.BINARY_CHATGPT_PORTAL_AUTH_PATH;
  delete process.env.BINARY_QWEN_PORTAL_AUTH_PATH;
  delete process.env.BINARY_GEMINI_IMPORT_AUTH_PATH;
  while (cleanupPaths.length) {
    const target = cleanupPaths.pop();
    if (target) {
      await rm(target, { recursive: true, force: true });
    }
  }
});

describe("BrowserSessionManager", () => {
  it("imports ChatGPT/Codex-style local auth documents", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "binary-browser-auth-"));
    cleanupPaths.push(tempDir);
    const authPath = path.join(tempDir, "auth.json");
    await writeFile(
      authPath,
      JSON.stringify({
        auth_mode: "browser",
        tokens: {
          access_token: "access-token",
          refresh_token: "refresh-token",
          id_token: "id-token",
          account_id: "acct_123",
        },
      }),
      "utf8"
    );
    process.env.BINARY_CHATGPT_PORTAL_AUTH_PATH = authPath;

    const manager = new BrowserSessionManager();
    const imported = await manager.tryImport("chatgpt_portal");

    expect(imported?.secret.accessToken).toBe("access-token");
    expect(imported?.secret.refreshToken).toBe("refresh-token");
    expect(imported?.linkedAccountLabel).toBe("acct_123");
    expect(imported?.secret.importedFrom).toBe(authPath);
  });

  it("creates browser sessions that connect after import succeeds", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "binary-browser-auth-"));
    cleanupPaths.push(tempDir);
    const authPath = path.join(tempDir, "oauth_creds.json");
    await writeFile(
      authPath,
      JSON.stringify({
        access_token: "qwen-access",
        refresh_token: "qwen-refresh",
        account_id: "qwen-user",
      }),
      "utf8"
    );
    process.env.BINARY_QWEN_PORTAL_AUTH_PATH = authPath;

    const manager = new BrowserSessionManager();
    const session = manager.start("qwen_portal");
    const polled = await manager.poll(session.sessionId);

    expect(polled?.status).toBe("connected");
    expect(manager.getImportedAuth(session.sessionId)?.secret.accessToken).toBe("qwen-access");
  });
});
