import { describe, expect, it } from "vitest";
import {
  buildIndexChunkMetadata,
  buildRetrievalHints,
} from "../src/intelligence-utils";

describe("vsix intelligence utils", () => {
  it("builds retrieval hints with deduped paths, symbols, and diagnostics", () => {
    const hints = buildRetrievalHints({
      mentionPaths: ["@app/api/v1/playground/assist/route.ts", "app/api/v1/playground/assist/route.ts"],
      candidateSymbols: ["runAssist", "runAssist", "buildContextSelection"],
      diagnostics: [{ message: "Type error in assist route" }, { message: "Type error in assist route" }],
      preferredTargetPath: "./app/api/v1/playground/assist/route.ts",
      recentTouchedPaths: ["app/api/v1/playground/assist/route.ts", "lib/playground/orchestration.ts"],
    });

    expect(hints.mentionedPaths).toEqual(["app/api/v1/playground/assist/route.ts"]);
    expect(hints.candidateSymbols).toEqual(["runAssist", "buildContextSelection"]);
    expect(hints.candidateErrors).toEqual(["Type error in assist route"]);
    expect(hints.preferredTargetPath).toBe("app/api/v1/playground/assist/route.ts");
    expect(hints.recentTouchedPaths).toEqual([
      "app/api/v1/playground/assist/route.ts",
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
