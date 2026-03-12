import { describe, expect, it } from "vitest";
import {
  BACKUP_PLAYGROUND_MODEL_ALIAS,
  DEFAULT_PLAYGROUND_MODEL_ALIAS,
  listPlaygroundModels,
  PLAYGROUND_CONTRACT_VERSION,
  resolvePlaygroundModelSelection,
} from "@/lib/playground/model-registry";

describe("playground model registry", () => {
  it("lists versioned repo-backed models", () => {
    const models = listPlaygroundModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models.some((entry) => entry.alias === DEFAULT_PLAYGROUND_MODEL_ALIAS)).toBe(true);
    expect(models.every((entry) => entry.capabilities.maxContextTokens > 0)).toBe(true);
  });

  it("resolves the default alias with a fallback chain", () => {
    const selection = resolvePlaygroundModelSelection({
      requested: DEFAULT_PLAYGROUND_MODEL_ALIAS,
      allowedProviders: ["hf", "nvidia"],
      requirements: { textActions: true, toolReady: true },
    });
    expect(selection.resolvedAlias).toBe(DEFAULT_PLAYGROUND_MODEL_ALIAS);
    expect(selection.fallbackChain.some((entry) => entry.alias === BACKUP_PLAYGROUND_MODEL_ALIAS)).toBe(true);
  });

  it("filters by provider compatibility when requested", () => {
    const selection = resolvePlaygroundModelSelection({
      requested: DEFAULT_PLAYGROUND_MODEL_ALIAS,
      allowedProviders: ["nvidia"],
      requirements: { textActions: true },
    });
    expect(selection.resolvedEntry.provider).toBe("nvidia");
    expect(selection.resolvedAlias).toBe(BACKUP_PLAYGROUND_MODEL_ALIAS);
  });

  it("rejects non tool-ready models when toolReady is required", () => {
    const selection = resolvePlaygroundModelSelection({
      requested: "playground-native-preview",
      allowedProviders: ["hf", "nvidia"],
      requirements: { toolReady: true, textActions: true },
    });
    expect(selection.resolvedAlias).toBe(DEFAULT_PLAYGROUND_MODEL_ALIAS);
    expect(selection.resolvedEntry.certification).toBe("tool_ready");
  });

  it("exposes the shared contract version", () => {
    expect(PLAYGROUND_CONTRACT_VERSION).toBe("2026-03-actions-v1");
  });
});
