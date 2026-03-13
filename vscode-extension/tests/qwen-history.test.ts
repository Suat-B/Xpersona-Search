import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
  workspace: {
    workspaceFolders: [
      {
        name: "repo",
        uri: { fsPath: "C:/repo" },
      },
    ],
    getWorkspaceFolder: vi.fn(() => ({
      name: "repo",
      uri: { fsPath: "C:/repo" },
    })),
  },
}));

import {
  createPendingQwenSessionId,
  isPendingQwenSessionId,
  QwenHistoryService,
} from "../src/qwen-history";

function createExtensionContext() {
  const values = new Map<string, unknown>();
  return {
    globalState: {
      get: <T>(key: string) => values.get(key) as T,
      update: async (key: string, value: unknown) => {
        values.set(key, value);
      },
    },
  };
}

describe("qwen history", () => {
  let context: ReturnType<typeof createExtensionContext>;

  beforeEach(() => {
    context = createExtensionContext();
  });

  it("creates pending session ids for failed or not-yet-resolved runs", () => {
    const pending = createPendingQwenSessionId();
    expect(isPendingQwenSessionId(pending)).toBe(true);
    expect(isPendingQwenSessionId("session-1")).toBe(false);
  });

  it("replaces a pending session id with the real Qwen session id", async () => {
    const service = new QwenHistoryService(context as any);
    const pending = createPendingQwenSessionId();

    await service.saveConversation({
      sessionId: pending,
      mode: "auto",
      title: "fix route.ts",
      messages: [{ id: "1", role: "user", content: "fix route.ts" }],
      targets: ["app/api/v1/playground/models/route.ts"],
      intent: "change",
    });

    await service.replaceSessionId(pending, "session-42");

    await expect(service.hasSession(pending)).resolves.toBe(false);
    await expect(service.hasSession("session-42")).resolves.toBe(true);
    await expect(service.loadMessages("session-42")).resolves.toEqual([
      { id: "1", role: "user", content: "fix route.ts" },
    ]);
  });
});
