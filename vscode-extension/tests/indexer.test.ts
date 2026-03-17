import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  findFiles,
  readFile,
  requestJson,
  workspaceStateValues,
  workspaceStateUpdate,
  projectKeyValue,
  EventEmitter,
} = vi.hoisted(() => ({
  findFiles: vi.fn(async () => []),
  readFile: vi.fn(async () => new Uint8Array()),
  requestJson: vi.fn(async () => ({ ok: true })),
  workspaceStateValues: new Map<string, unknown>(),
  workspaceStateUpdate: vi.fn(async (key: string, value: unknown) => {
    workspaceStateValues.set(key, value);
  }),
  projectKeyValue: { current: "repo:hash" },
  EventEmitter: class<T> {
    private listeners: Array<(value: T) => void> = [];
    event = (listener: (value: T) => void) => {
      this.listeners.push(listener);
      return { dispose() {} };
    };
    fire(value: T) {
      for (const listener of this.listeners) listener(value);
    }
  },
}));

vi.mock("vscode", () => ({
  workspace: {
    findFiles,
    fs: {
      readFile,
    },
  },
  EventEmitter,
}));

vi.mock("../src/api-client", () => ({
  requestJson,
}));

vi.mock("../src/config", () => ({
  INDEX_STATE_KEY: "xpersona.playground.indexState",
  INDEX_FILE_STATE_KEY: "xpersona.playground.indexFileState",
  getBaseApiUrl: () => "http://localhost:3000",
  getProjectKey: () => projectKeyValue.current,
  normalizeWorkspaceRelativePath: (value: string | null | undefined) =>
    String(value || "").replace(/\\/g, "/"),
  toWorkspaceRelativePath: (uri: { fsPath: string }) => String(uri.fsPath || "").replace(/^C:\\repo\\?/i, "").replace(/\\/g, "/"),
}));

import { CloudIndexManager } from "../src/indexer";

function createContext() {
  return {
    workspaceState: {
      get: <T>(key: string) => workspaceStateValues.get(key) as T,
      update: workspaceStateUpdate,
    },
  };
}

function bytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "utf8"));
}

describe("indexer", () => {
  beforeEach(() => {
    findFiles.mockReset();
    readFile.mockReset();
    requestJson.mockReset();
    workspaceStateValues.clear();
    workspaceStateUpdate.mockClear();
    projectKeyValue.current = "repo:hash";
  });

  it("skips identical rebuild uploads and only upserts changed files", async () => {
    const files = [
      { fsPath: "C:\\repo\\src\\one.ts" },
      { fsPath: "C:\\repo\\src\\two.ts" },
    ];
    const fileContents = new Map<string, string>([
      ["C:\\repo\\src\\one.ts", "export const one = 1;\n"],
      ["C:\\repo\\src\\two.ts", "export const two = 2;\n"],
    ]);

    findFiles.mockResolvedValue(files);
    readFile.mockImplementation(async (uri: { fsPath: string }) => bytes(fileContents.get(uri.fsPath) || ""));
    requestJson.mockResolvedValue({ ok: true });

    const manager = new CloudIndexManager(createContext() as any, async () => ({ apiKey: "key" }));

    await manager.rebuild("manual");
    expect(requestJson).toHaveBeenCalledTimes(1);
    expect(requestJson.mock.calls[0]?.[3]?.chunks).toHaveLength(2);

    await manager.rebuild("background");
    expect(requestJson).toHaveBeenCalledTimes(1);

    fileContents.set("C:\\repo\\src\\two.ts", "export const two = 22;\n");
    await manager.rebuild("background");

    expect(requestJson).toHaveBeenCalledTimes(2);
    const changedBatch = requestJson.mock.calls[1]?.[3]?.chunks || [];
    expect(changedBatch).toHaveLength(1);
    expect(changedBatch[0]?.pathDisplay).toBe("src/two.ts");
  });

  it("excludes heavy directories during file discovery so mention suggestions stay populated", async () => {
    findFiles.mockImplementation(async (_include: string, exclude: string | undefined) => {
      if (exclude) {
        return [{ fsPath: "C:\\repo\\src\\route.ts" }];
      }
      return [{ fsPath: "C:\\repo\\node_modules\\leftpad\\index.js" }];
    });
    readFile.mockResolvedValue(bytes("export const ok = true;\n"));
    requestJson.mockResolvedValue({ ok: true });

    const manager = new CloudIndexManager(createContext() as any, async () => ({ apiKey: "key" }));
    const suggestions = await manager.getMentionSuggestions("");

    expect(findFiles).toHaveBeenCalledWith("**/*", expect.stringContaining("node_modules"), 2000);
    expect(suggestions).toContain("src/route.ts");
  });

  it("ignores volatile workspace paths like .trae for change-triggered rebuilds", async () => {
    const manager = new CloudIndexManager(createContext() as any, async () => ({ apiKey: "key" }));

    expect(manager.shouldTrackUri({ fsPath: "C:\\repo\\src\\route.ts" } as any)).toBe(true);
    expect(manager.shouldTrackUri({ fsPath: "C:\\repo\\.trae\\session.json" } as any)).toBe(false);
    expect(manager.shouldTrackUri({ fsPath: "C:\\repo\\.vscode\\settings.json" } as any)).toBe(false);
  });
});
