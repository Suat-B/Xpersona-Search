import { describe, expect, it } from "vitest";
import { DraftStore, buildDraftKey } from "../src/draft-store";

function createMemento() {
  const values = new Map<string, unknown>();
  return {
    get: <T>(key: string) => values.get(key) as T,
    update: async (key: string, value: unknown) => {
      values.set(key, value);
    },
  };
}

describe("draft store", () => {
  it("builds stable runtime and session scoped keys", () => {
    expect(buildDraftKey("qwenCode", null)).toBe("qwenCode:__new__");
    expect(buildDraftKey("playgroundApi", "session-1")).toBe("playgroundApi:session-1");
  });

  it("persists drafts by runtime and session bucket", async () => {
    const store = new DraftStore(createMemento() as any);

    await store.set("qwenCode", null, "draft one");
    await store.set("qwenCode", "session-1", "draft two");
    await store.set("playgroundApi", "session-1", "cloud draft");

    await expect(store.get("qwenCode", null)).resolves.toBe("draft one");
    await expect(store.get("qwenCode", "session-1")).resolves.toBe("draft two");
    await expect(store.get("playgroundApi", "session-1")).resolves.toBe("cloud draft");
  });

  it("clears a draft bucket when the stored text becomes empty", async () => {
    const store = new DraftStore(createMemento() as any);
    await store.set("qwenCode", "session-1", "draft two");
    await store.set("qwenCode", "session-1", "");
    await expect(store.get("qwenCode", "session-1")).resolves.toBe("");
  });
});
