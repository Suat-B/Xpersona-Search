import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLAYGROUND_MODEL_ALIAS,
  PLAYGROUND_CONTRACT_VERSION,
  getDefaultPlaygroundModelEntry,
  listPlaygroundModels,
  resolvePlaygroundModelSelection,
} from "@/lib/playground/model-registry";

describe("playground model registry", () => {
  it("exposes a server-owned default model and at least one public alias", () => {
    const models = listPlaygroundModels();
    expect(models.length).toBeGreaterThanOrEqual(1);
    expect(models[0]?.alias).toBe(DEFAULT_PLAYGROUND_MODEL_ALIAS);
  });

  it("falls back to the default model for unknown requests", () => {
    const selection = resolvePlaygroundModelSelection({ requested: "anything-custom" });
    expect(selection.requested).toBe("anything-custom");
    expect(selection.resolvedAlias).toBe(DEFAULT_PLAYGROUND_MODEL_ALIAS);
    expect(selection.fallbackChain).toHaveLength(1);
  });

  it("resolves known built-in aliases", () => {
    const selection = resolvePlaygroundModelSelection({ requested: "qwen-next" });
    expect(selection.resolvedAlias).toBe("qwen-next");
    expect(selection.resolvedEntry.model).toContain("Qwen/");
  });

  it("returns a tool-ready default entry", () => {
    const entry = getDefaultPlaygroundModelEntry();
    expect(entry.enabled).toBe(true);
    expect(entry.certification).toBe("tool_ready");
    expect(entry.capabilities.supportsShellCommands).toBe(true);
    expect(entry.baseUrl).toBeTruthy();
  });

  it("publishes the minimal contract version", () => {
    expect(PLAYGROUND_CONTRACT_VERSION).toBe("2026-03-minimal-coding-v1");
  });
});
