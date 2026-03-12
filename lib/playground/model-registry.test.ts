import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLAYGROUND_MODEL_ALIAS,
  PLAYGROUND_CONTRACT_VERSION,
  getDefaultPlaygroundModelEntry,
  listPlaygroundModels,
  resolvePlaygroundModelSelection,
} from "@/lib/playground/model-registry";

describe("playground model registry", () => {
  it("exposes exactly one server-owned default model", () => {
    const models = listPlaygroundModels();
    expect(models).toHaveLength(1);
    expect(models[0]?.alias).toBe(DEFAULT_PLAYGROUND_MODEL_ALIAS);
  });

  it("resolves every request back to the default model", () => {
    const selection = resolvePlaygroundModelSelection({ requested: "anything-custom" });
    expect(selection.requested).toBe("anything-custom");
    expect(selection.resolvedAlias).toBe(DEFAULT_PLAYGROUND_MODEL_ALIAS);
    expect(selection.fallbackChain).toHaveLength(1);
  });

  it("returns a tool-ready default entry", () => {
    const entry = getDefaultPlaygroundModelEntry();
    expect(entry.enabled).toBe(true);
    expect(entry.certification).toBe("tool_ready");
    expect(entry.capabilities.supportsShellCommands).toBe(true);
  });

  it("publishes the minimal contract version", () => {
    expect(PLAYGROUND_CONTRACT_VERSION).toBe("2026-03-minimal-coding-v1");
  });
});
