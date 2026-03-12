import { describe, expect, it } from "vitest";
import {
  buildIndexChunkMetadata,
  buildRetrievalHints,
  modelSupportsImages,
  resolveRunProfileFromLegacyParallel,
} from "../src/intelligence-utils";

describe("vsix intelligence utils", () => {
  it("resolves deep focus from explicit run profile or legacy parallel alias", () => {
    expect(resolveRunProfileFromLegacyParallel({ runProfile: "deep_focus", parallel: false })).toBe("deep_focus");
    expect(resolveRunProfileFromLegacyParallel({ parallel: true })).toBe("deep_focus");
    expect(resolveRunProfileFromLegacyParallel({ parallel: false })).toBe("standard");
  });

  it("detects whether the selected model supports image input", () => {
    const catalog = [
      { alias: "playground-default", capabilities: { supportsImages: false } },
      { alias: "playground-vision", capabilities: { supportsImages: true } },
    ];
    expect(modelSupportsImages("playground-default", catalog)).toBe(false);
    expect(modelSupportsImages("playground-vision", catalog)).toBe(true);
    expect(modelSupportsImages("missing-model", catalog)).toBe(false);
  });

  it("builds retrieval hints with deduped paths, symbols, and diagnostics", () => {
    const hints = buildRetrievalHints({
      mentionPaths: ["@app/api/v1/playground/models/route.ts", "app/api/v1/playground/models/route.ts"],
      candidateSymbols: ["resolveModelSelection", "resolveModelSelection", "buildContextSelection"],
      diagnostics: [{ message: "Type error in models route" }, { message: "Type error in models route" }],
      preferredTargetPath: "./app/api/v1/playground/models/route.ts",
      recentTouchedPaths: ["app/api/v1/playground/models/route.ts", "lib/playground/orchestration.ts"],
    });

    expect(hints.mentionedPaths).toEqual(["app/api/v1/playground/models/route.ts"]);
    expect(hints.candidateSymbols).toEqual(["resolveModelSelection", "buildContextSelection"]);
    expect(hints.candidateErrors).toEqual(["Type error in models route"]);
    expect(hints.preferredTargetPath).toBe("app/api/v1/playground/models/route.ts");
    expect(hints.recentTouchedPaths).toEqual([
      "app/api/v1/playground/models/route.ts",
      "lib/playground/orchestration.ts",
    ]);
  });

  it("extracts path tokens, headings, and symbols for index metadata", () => {
    const metadata = buildIndexChunkMetadata({
      pathDisplay: "vscode-extension/src/extension.ts",
      language: "ts",
      content: [
        "# Extension Runtime",
        "export async function activate() {",
        "  return true;",
        "}",
      ].join("\n"),
      source: "cloud",
      reason: "Workspace index chunk",
    });

    expect(metadata.pathTokens).toContain("extension");
    expect(metadata.symbolNames).toContain("activate");
    expect(metadata.headings).toContain("Extension Runtime");
    expect(metadata.summary).toContain("Extension Runtime");
    expect(metadata.source).toBe("cloud");
  });
});
